import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("Phase 6 migration extends children and adds lightweight activities", async () => {
  const [migration, schema] = await Promise.all([
    source("drizzle/0009_child_profiles.sql"),
    source("lib/db/schema.ts"),
  ]);

  assert.match(migration, /full_name/);
  assert.match(migration, /date_of_birth/);
  assert.match(migration, /school_name/);
  assert.match(migration, /allergies/);
  assert.match(migration, /medications/);
  assert.match(migration, /nhi_number/);
  assert.match(migration, /clothing_size/);
  assert.match(migration, /CREATE TABLE "child_activities"/);
  assert.match(schema, /export const childActivities = pgTable/);
});

test("shared child reference information updates immediately without approval proposals", async () => {
  const profileRoute = await source("app/api/children/[id]/route.ts");
  const activityRoute = await source("app/api/children/[id]/activities/route.ts");

  assert.match(profileRoute, /getEditorSession/);
  assert.match(activityRoute, /getEditorSession/);
  assert.doesNotMatch(profileRoute, /createApprovalProposal|getSharedApprovalTarget/);
  assert.doesNotMatch(activityRoute, /createApprovalProposal|getSharedApprovalTarget/);
});

test("child history records changed field names instead of sensitive values", async () => {
  const [profileRoute, activityRoute] = await Promise.all([
    source("app/api/children/[id]/route.ts"),
    source("app/api/children/[id]/activities/route.ts"),
  ]);

  assert.match(profileRoute, /changedFields/);
  assert.match(profileRoute, /sections: changedSections/);
  assert.doesNotMatch(profileRoute, /before_state/);
  assert.match(activityRoute, /activityName/);
  assert.match(activityRoute, /changedFields/);
});

test("child profile hub reuses existing linked expenses and responsibilities", async () => {
  const route = await source("app/api/children/[id]/route.ts");
  const shell = await source("components/children/child-profile-shell.tsx");

  assert.match(route, /responsibilityChildren/);
  assert.match(route, /expenses\.childId/);
  assert.match(shell, /Responsibilities/);
  assert.match(shell, /Recent expenses/);
  assert.match(shell, /Open Responsibilities/);
  assert.match(shell, /Open Expenses/);
});

test("child profile contains the planned Basic School Health Activities and Practical sections", async () => {
  const shell = await source("components/children/child-profile-shell.tsx");

  assert.match(shell, />Basic</);
  assert.match(shell, />School</);
  assert.match(shell, />Health</);
  assert.match(shell, />Activities</);
  assert.match(shell, /Useful practical information/);
  assert.match(shell, /Preferred name/);
  assert.match(shell, /Date of birth/);
  assert.match(shell, /Before \/ after-school care/);
  assert.match(shell, /Allergies/);
  assert.match(shell, /Medications/);
  assert.match(shell, /NHI \/ health identifier/);
  assert.match(shell, /Clothing size/);
  assert.match(shell, /Shoe size/);
});

test("viewers can read profiles but mutations require edit access", async () => {
  const [listRoute, profileRoute, activityRoute] = await Promise.all([
    source("app/api/children/route.ts"),
    source("app/api/children/[id]/route.ts"),
    source("app/api/children/[id]/activities/route.ts"),
  ]);

  assert.match(listRoute, /getCalendarSession/);
  assert.match(profileRoute, /getCalendarSession/);
  assert.match(profileRoute, /getEditorSession/);
  assert.match(activityRoute, /getEditorSession/);
  assert.match(profileRoute, /Editor access is required/);
  assert.match(activityRoute, /Editor access is required/);
});

test("Kids is reachable from Home Calendar Expenses and Responsibilities", async () => {
  const files = await Promise.all([
    source("components/home/home-shell.tsx"),
    source("components/calendar/calendar-shell.tsx"),
    source("components/expenses/expenses-shell.tsx"),
    source("components/responsibilities/responsibilities-shell.tsx"),
  ]);

  for (const text of files) {
    assert.match(text, /href="\/kids"/);
  }
  assert.match(files[0], /Your child profiles/);
  assert.match(files[0], /\/kids\/\$\{child\.id\}/);
});

test("child profiles create no date marker or Google Calendar sync surface", async () => {
  const files = await Promise.all([
    source("app/api/children/[id]/route.ts"),
    source("app/api/children/[id]/activities/route.ts"),
    source("components/children/child-profile-shell.tsx"),
  ]);

  for (const text of files) {
    assert.doesNotMatch(text, /google-calendar/);
    assert.doesNotMatch(text, /buildCalendarSyncJobStatement/);
  }
});

test("Phase 7 profile photos use the shared private attachment layer", async () => {
  const [shell, photo] = await Promise.all([
    source("components/children/child-profile-shell.tsx"),
    source("components/attachments/profile-photo.tsx"),
  ]);

  assert.match(shell, /ProfilePhoto/);
  assert.match(photo, /\/api\/attachments/);
  assert.match(photo, /role: "profile_photo"/);
  assert.match(photo, /category: "profile_photo"/);
  assert.doesNotMatch(photo, /data:image|base64/);
});
