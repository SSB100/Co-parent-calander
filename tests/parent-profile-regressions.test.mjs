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
  const actions = await source("app/dashboard/actions.ts");

  assert.match(actions, /available_participant AS/);
  assert.match(actions, /NOT EXISTS \(\s*SELECT 1 FROM calendar_memberships membership\s*WHERE membership\.participant_id = participant\.id/);
  assert.match(actions, /COALESCE\(\s*\(SELECT id FROM available_participant LIMIT 1\),\s*\(SELECT id FROM new_participant LIMIT 1\)/);
  assert.match(actions, /NOT EXISTS \(SELECT 1 FROM available_participant\)/);
});

test("upgrading a viewer to editor also claims an unlinked parent profile", async () => {
  const invites = await source("app/api/invites/route.ts");

  assert.match(invites, /available_participant_id/);
  assert.match(invites, /membership\.participant_id = participant\.id/);
  assert.match(invites, /participantId: availableParticipantId/);
  assert.match(invites, /This calendar already has two linked parent profiles\./);
});
