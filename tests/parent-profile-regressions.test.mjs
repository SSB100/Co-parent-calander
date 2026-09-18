import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("parent profiles are separate from account membership and capped at two", async () => {
  const route = await source("app/api/parents/route.ts");

  assert.match(route, /getOwnerSession\s*\(/);
  assert.match(route, /isSameOriginMutation\s*\(/);
  assert.match(route, /existing\.length >= 2/);
  assert.match(route, /This calendar already has two parent profiles\./);
  assert.match(route, /INSERT INTO participants/);
  assert.match(route, /profile_slot/);
  assert.match(route, /nextAvailableParentProfileSlot/);
  assert.match(route, /parent_profile\.create/);
  assert.doesNotMatch(route, /INSERT INTO calendar_memberships/);
});

test("calendar page exposes Add parent and explains that account access is optional", async () => {
  const panel = await source("components/calendar/members-panel.tsx");

  assert.match(panel, /Add parent/);
  assert.match(panel, /Parent profiles/);
  assert.match(panel, /does not need an account or calendar access/);
  assert.match(panel, /fetch\("\/api\/parents"/);
  assert.match(panel, /Profile only/);
  assert.match(panel, /Has access/);
});

test("editor join claims an existing unlinked parent profile before creating a new one", async () => {
  const actions = await source("app/calendar/actions.ts");

  assert.match(actions, /available_participant AS/);
  assert.match(actions, /NOT EXISTS \(\s*SELECT 1 FROM calendar_memberships membership\s*WHERE membership\.participant_id = participant\.id/);
  assert.match(actions, /COALESCE\(\s*\(SELECT id FROM available_participant LIMIT 1\),\s*\(SELECT id FROM new_participant LIMIT 1\)/);
  assert.match(actions, /NOT EXISTS \(SELECT 1 FROM available_participant\)/);
  assert.match(actions, /available_profile_slot/);
  assert.match(actions, /profile_slot/);
});

test("upgrading a viewer to editor also claims an unlinked parent profile", async () => {
  const invites = await source("app/api/invites/route.ts");

  assert.match(invites, /available_participant_id/);
  assert.match(invites, /membership\.participant_id = participant\.id/);
  assert.match(invites, /participantId: availableParticipantId/);
  assert.match(invites, /This calendar already has two linked parent profiles\./);
  assert.match(invites, /available_profile_slot/);
  assert.match(invites, /profile_slot/);
});


test("parent identity is semantic and calendar styling does not depend on participant array order", async () => {
  const [migration, core, identity, calendar, recurring] = await Promise.all([
    source("drizzle/0015_parent_profile_identity.sql"),
    source("lib/db/schema/core.ts"),
    source("lib/parents/identity.ts"),
    source("components/calendar/calendar-shell.tsx"),
    source("components/calendar/recurring-schedule-panel.tsx"),
  ]);

  assert.match(migration, /parent_profile_slot/);
  assert.match(migration, /parent_one/);
  assert.match(migration, /parent_two/);
  assert.match(migration, /row_number\(\) OVER/);
  assert.match(migration, /participants_calendar_profile_slot_unique/);
  assert.match(core, /profileSlot: parentProfileSlot/);
  assert.match(identity, /nextAvailableParentProfileSlot/);
  assert.match(identity, /parentProfileSlotIndex/);
  assert.match(calendar, /parentProfileSlotIndex/);
  assert.match(calendar, /participant\?\.profileSlot/);
  assert.match(recurring, /parentProfileSlotIndex/);
  assert.match(recurring, /participant\?\.profileSlot/);
});


test("parent calendar colours use a curated unique palette without a schema migration", async () => {
  const [identity, settingsRoute, settingsPanel, calendar] = await Promise.all([
    source("lib/parents/identity.ts"),
    source("app/api/settings/route.ts"),
    source("components/calendar/settings-panel.tsx"),
    source("components/calendar/calendar-shell.tsx"),
  ]);

  assert.match(identity, /parentColorKeys/);
  assert.match(identity, /emerald/);
  assert.match(identity, /violet/);
  assert.match(identity, /coral/);
  assert.match(identity, /sunshine/);
  assert.match(identity, /sky/);
  assert.match(settingsRoute, /colorKey: z\.enum\(parentColorKeys\)/);
  assert.match(settingsRoute, /Choose a different calendar colour for each parent/);
  assert.match(settingsRoute, /color_key = \$\{parent\.colorKey\}/);
  assert.match(settingsPanel, /role="radiogroup"/);
  assert.match(settingsPanel, /usedByOtherParent/);
  assert.match(calendar, /participant\?\.colorKey/);
});
