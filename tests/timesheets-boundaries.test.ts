import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { safeAuthReturnTo } from "../lib/security/auth-return";
import { calendarPathForType, calendarTemplateManifests } from "../lib/templates/calendar-templates";
import { workspaceOrganiserTools } from "../lib/templates/workspace-navigation";
const read = (file: string) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("Timesheets is a separately registered calendar and does not repurpose Staff attendance", async () => {
  assert.equal(calendarPathForType("timesheets"), "/calendar-types/timesheets");
  assert.equal(calendarTemplateManifests.timesheets.primaryScheduledEntity, "Work block");
  assert.notEqual(calendarPathForType("timesheets"), calendarPathForType("staff_rosters"));
  assert.deepEqual(workspaceOrganiserTools("timesheets", "member"), []);
  assert.deepEqual(workspaceOrganiserTools("timesheets", "manager").map(tool => tool.key), ["team"]);
  for (const file of ["lib/timesheets/service.ts", "lib/timesheets/model.ts", "lib/timesheets/contracts.ts", "drizzle/0036_timesheets.sql"]) {
    const source = await read(file);
    assert.doesNotMatch(source, /(?:INSERT INTO|UPDATE|DELETE FROM) staff_roster|from ["'].*staff-rosters/);
  }
});
test("invitation return allowlist preserves exactly one bounded token path", () => {
  const valid = `/timesheets/invite/${"a".repeat(43)}`;
  assert.equal(safeAuthReturnTo(valid), valid);
  for (const value of [valid + "?next=/personal", valid + "#token", valid + "/", valid.replace("a".repeat(43), "a".repeat(42)), valid.replace("timesheets", "%74imesheets"), `https://evil.test${valid}`, `//evil.test${valid}`, `/timesheets/invite/${"a".repeat(42)}%2f`]) assert.equal(safeAuthReturnTo(value), "");
});
test("Timesheets routes bind reads, export and writes to current selected calendar", async () => {
  const source = await read("app/api/timesheets/route.ts");
  assert.equal((source.match(/matchesExpectedCalendar\(/g) ?? []).length, 2);
  assert.equal((source.match(/getCalendarSession\(/g) ?? []).length, 2);
  assert.match(source, /isSameOriginMutation\(request\)/);
  assert.match(source, /private, no-store/);
  assert.match(source, /exportTimesheetsCsv\(data\)/);
  assert.doesNotMatch(source, /request[^\n]*userId|request[^\n]*organisationId/);
});
test("invitation tokens are hashed, email verification is authoritative, and read payloads are allowlisted", async () => {
  const [service, migration, page, headers] = await Promise.all([read("lib/timesheets/service.ts"), read("drizzle/0036_timesheets.sql"), read("app/timesheets/invite/[token]/page.tsx"), read("next.config.ts")]);
  assert.match(service, /randomBytes\(32\)/);
  assert.match(service, /tokenHash: hashToken\(rawToken\)/);
  assert.match(migration, /SELECT lower\(trim\(email\)\),"emailVerified"/);
  assert.match(migration, /account_verified IS DISTINCT FROM true OR account_email IS DISTINCT FROM invitation.email/);
  assert.match(migration, /PERFORM timesheet_lock\(invitation.organisation_id\)/);
  assert.match(migration, /invitation.redeemed_by_user_id=p_actor/);
  assert.match(migration, /timesheet_core_membership_lock/);
  assert.match(migration, /timesheet_revision_immutable/);
  assert.doesNotMatch(service.slice(service.indexOf("export async function loadTimesheets"), service.indexOf("async function existingEntry")), /token_hash/);
  assert.match(page, /index: false, follow: false/);
  assert.match(headers, /source: "\/timesheets\/invite\/:path\*"/);
});
test("organisation creation is included in the existing atomic calendar transaction", async () => {
  const actions = await read("app/calendar/actions.ts");
  assert.match(actions, /calendarType === "timesheets"[\s\S]*statements.push\(sql`SELECT timesheet_create_organisation/);
  assert.ok(actions.indexOf("timesheet_create_organisation") < actions.indexOf("await sql.transaction(statements)"));
});
test("Timesheets lifecycle preserves audited history without changing other calendar deletion", async () => {
  const [actions, controls] = await Promise.all([read("app/calendar/actions.ts"), read("components/calendars/calendar-lifecycle-controls.tsx")]);
  assert.match(actions, /calendar.calendar_type === "timesheets"[\s\S]*Timesheets retain audited work history/);
  assert.match(controls, /current.calendarType === "timesheets"[\s\S]*Archive this calendar/);
});
test("unverified signup returns directly to the invitation's code verification flow", async () => {
  const [auth, page, form] = await Promise.all([read("app/auth/actions.ts"), read("app/timesheets/invite/[token]/page.tsx"), read("app/timesheets/invite/[token]/invitation-form.tsx")]);
  assert.match(auth, /returnTo.startsWith\("\/timesheets\/invite\/"\)\) return `\$\{returnTo\}\?verify=1`/);
  assert.match(page, /verificationRequested=\{query.verify === "1"\}/);
  assert.match(form, /details open=\{verificationRequested\}/);
  assert.match(form, /type: "email-verification"/);
  assert.match(form, /emailOtp.verifyEmail\(\{ email: address, otp \}\)/);
});
