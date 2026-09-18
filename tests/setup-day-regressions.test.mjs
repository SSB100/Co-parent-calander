import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("legacy setup is retired in favor of managed dashboard calendars", async () => {
  const [setup, dashboard] = await Promise.all([
    source("app/api/setup/route.ts"),
    source("app/dashboard/actions.ts"),
  ]);

  assert.match(setup, /status: 410/);
  assert.match(setup, /Legacy setup links have been retired/);
  assert.doesNotMatch(setup, /generateSecureToken|access_tokens|editorUrl/);

  assert.match(dashboard, /createCalendar/);
  assert.match(dashboard, /joinCalendar/);
  assert.match(dashboard, /calendar_memberships/);
  assert.match(dashboard, /calendar_invites/);
});

test("day-detail edits keep validation, direct split ownership, transaction, and audit behavior", async () => {
  const text = await source("app/api/assignment-details/route.ts");

  assert.match(text, /regex\(\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
  assert.match(text, /Choose a valid handover time\./);
  assert.match(text, /max\(120,\s*["']Keep the handover location under 120 characters\.["']\)/);
  assert.match(text, /max\(500,\s*["']Keep the note under 500 characters\.["']\)/);
  assert.match(text, /Assign this day before adding handover details or a note\./);
  assert.match(text, /ownershipSchema/);
  assert.match(text, /z\.enum\(\["full_day", "morning", "afternoon"\]\)/);

  assert.match(text, /eq\(children\.active,\s*true\)/);
  assert.match(text, /Add at least one child before editing a calendar day\./);
  assert.match(text, /'manual'/);
  assert.match(text, /recurring_rule_id\s*=\s*NULL/);
  assert.match(text, /afternoon_parent_id/);
  assert.match(text, /assignment\.details_update/);
  assert.match(text, /assignment\.single_clear/);
  assert.match(text, /before_state/);
  assert.match(text, /after_state/);
  assert.match(text, /await sql\.transaction\(statements\)/);
  assert.match(text, /affectedChildren:\s*childRows\.length/);
});
