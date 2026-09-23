import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { rosterPublicationDiff } from "../lib/staff-rosters/publication-diff";
import { rosterPublicationFeedback } from "../lib/staff-rosters/publication-feedback";
import { staffRosterEmailCopy } from "../lib/email/staff-roster-notifications";

const root = process.cwd();

async function source(file: string) {
  return readFile(path.join(root, file), "utf8");
}

function shift(input: {
  id: string;
  memberId: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  sourceShiftId?: string | null;
}) {
  return {
    id: input.id,
    memberId: input.memberId,
    roleId: null,
    locationId: null,
    date: input.date ?? "2026-09-28",
    startTime: input.startTime ?? "09:00",
    endTime: input.endTime ?? "17:00",
    note: null,
    availabilityOverride: false,
    sourceShiftId: input.sourceShiftId ?? null,
  };
}

test("publication diff is empty when live and published snapshots match", () => {
  const live = shift({ id: "shift-1", memberId: "staff-a" });
  const published = shift({
    id: "published-1",
    sourceShiftId: "shift-1",
    memberId: "staff-a",
  });

  assert.deepEqual(rosterPublicationDiff([live], [published]), {
    memberIds: [],
    changedShiftCount: 0,
  });
});

test("publication diff targets the Staff affected by added changed and removed shifts", () => {
  const added = rosterPublicationDiff(
    [shift({ id: "shift-1", memberId: "staff-a" })],
    [],
  );
  assert.deepEqual(added, {
    memberIds: ["staff-a"],
    changedShiftCount: 1,
  });

  const changed = rosterPublicationDiff(
    [
      shift({
        id: "shift-1",
        memberId: "staff-a",
        startTime: "10:00",
        endTime: "18:00",
      }),
    ],
    [
      shift({
        id: "published-1",
        sourceShiftId: "shift-1",
        memberId: "staff-a",
      }),
    ],
  );
  assert.deepEqual(changed, {
    memberIds: ["staff-a"],
    changedShiftCount: 1,
  });

  const removed = rosterPublicationDiff(
    [],
    [
      shift({
        id: "published-1",
        sourceShiftId: "shift-1",
        memberId: "staff-a",
      }),
    ],
  );
  assert.deepEqual(removed, {
    memberIds: ["staff-a"],
    changedShiftCount: 1,
  });
});

test("reassigning a published shift targets both the previous and new Staff member", () => {
  const diff = rosterPublicationDiff(
    [shift({ id: "shift-1", memberId: "staff-b" })],
    [
      shift({
        id: "published-1",
        sourceShiftId: "shift-1",
        memberId: "staff-a",
      }),
    ],
  );

  assert.deepEqual(new Set(diff.memberIds), new Set(["staff-a", "staff-b"]));
  assert.equal(diff.changedShiftCount, 1);
});

test("publication feedback distinguishes successful email delivery from communication warnings", () => {
  assert.deepEqual(
    rosterPublicationFeedback({
      action: "publish",
      affectedMemberCount: 2,
      emailDelivery: {
        configured: true,
        attempted: 2,
        sent: 2,
        failed: 0,
        skippedUnlinked: 0,
        lookupFailed: false,
      },
    }),
    {
      tone: "teal",
      text: "Roster published for 2 staff members. 2 email notifications were sent.",
    },
  );

  const unlinked = rosterPublicationFeedback({
    action: "send_updates",
    affectedMemberCount: 2,
    emailDelivery: {
      configured: true,
      attempted: 1,
      sent: 1,
      failed: 0,
      skippedUnlinked: 1,
      lookupFailed: false,
    },
  });
  assert.equal(unlinked.tone, "sunshine");
  assert.match(unlinked.text, /not linked to a Covie account yet/);

  const providerFailure = rosterPublicationFeedback({
    action: "send_updates",
    affectedMemberCount: 1,
    emailDelivery: {
      configured: true,
      attempted: 1,
      sent: 0,
      failed: 1,
      skippedUnlinked: 0,
      lookupFailed: false,
    },
  });
  assert.equal(providerFailure.tone, "sunshine");
  assert.match(providerFailure.text, /could not be delivered/);

  const unconfigured = rosterPublicationFeedback({
    action: "publish",
    affectedMemberCount: 1,
    emailDelivery: {
      configured: false,
      attempted: 0,
      sent: 0,
      failed: 0,
      skippedUnlinked: 0,
      lookupFailed: false,
    },
  });
  assert.equal(unconfigured.tone, "sunshine");
  assert.match(unconfigured.text, /Email notifications are not configured/);
});

test("Staff roster email copy is privacy-minimal", () => {
  const published = staffRosterEmailCopy("roster_published", "2026-09-28");
  const updated = staffRosterEmailCopy("roster_updated", "2026-09-28");

  assert.equal(published.subject, "Your Covie roster is ready");
  assert.match(published.body, /week beginning/);
  assert.doesNotMatch(published.body, /09:00|17:00|location|role/i);

  assert.equal(updated.subject, "Your Covie roster was updated");
  assert.match(updated.body, /has been updated/);
  assert.doesNotMatch(updated.body, /09:00|17:00|location|role/i);
});

test("publication commits snapshots before attempting Staff email delivery", async () => {
  const service = await source("lib/staff-rosters/service.ts");
  const transactionIndex = service.indexOf("await sql.transaction([");
  const emailIndex = service.indexOf("await sendStaffRosterEmails({");

  assert.ok(transactionIndex >= 0);
  assert.ok(emailIndex > transactionIndex);
  assert.match(service, /kind: action === "publish" \? "roster_published" : "roster_updated"/);
  assert.match(service, /affectedMemberCount: notificationMemberIds\.length/);
});

test("Staff email recipients are restricted to linked active members in the selected calendar", async () => {
  const email = await source("lib/email/staff-roster-notifications.ts");

  assert.match(email, /member\.calendar_id = \$\{calendarId\}/);
  assert.match(email, /member\.active = true/);
  assert.match(email, /member\.membership_id IS NOT NULL/);
  assert.match(email, /JOIN calendar_memberships membership/);
  assert.match(email, /JOIN neon_auth\."user" auth_user/);
  assert.match(email, /requested\.has\(recipient\.member_id\)/);
  assert.match(email, /to: \[recipient\.email\]/);
  assert.doesNotMatch(email, /beforeSummary|afterSummary|shift\.start_time|shift\.end_time/);
});
