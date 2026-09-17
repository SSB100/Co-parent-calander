import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("setup keeps one-time bootstrap validation, editor links, transaction, and audit guarantees", async () => {
  const text = await source("app/api/setup/route.ts");

  assert.match(text, /calendarName:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(80\)/);
  assert.match(text, /parentOneName:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(50\)/);
  assert.match(text, /parentTwoName:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(50\)/);
  assert.match(text, /children:\s*z\.array\([^\n]+\)\.min\(1\)\.max\(10\)/);
  assert.match(text, /Use a different display name for each parent\./);

  assert.match(text, /bootstrapRows\[0\]\?\.colorKey\s*!==\s*["']setup["']/);
  assert.match(text, /This calendar has already been set up\./);

  assert.match(text, /const parentOneToken\s*=\s*generateSecureToken\(\)/);
  assert.match(text, /const parentTwoToken\s*=\s*generateSecureToken\(\)/);
  assert.match(text, /type = 'editor'/);
  assert.match(text, /parentOne:\s*\{[\s\S]*editorUrl:/);
  assert.match(text, /parentTwo:\s*\{[\s\S]*editorUrl:/);

  assert.match(text, /await sql\.transaction\(statements\)/);
  assert.match(text, /calendar\.setup_completed/);
});

test("day-detail edits keep validation, manual override, clear semantics, transaction, and audit behavior", async () => {
  const text = await source("app/api/assignment-details/route.ts");

  assert.match(text, /regex\(\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
  assert.match(text, /Choose a valid handover time\./);
  assert.match(text, /max\(120,\s*["']Keep the handover location under 120 characters\.["']\)/);
  assert.match(text, /max\(500,\s*["']Keep the note under 500 characters\.["']\)/);
  assert.match(text, /Assign the day to a parent before adding handover details or a note\./);

  assert.match(text, /eq\(children\.active,\s*true\)/);
  assert.match(text, /Add at least one child before editing a calendar day\./);
  assert.match(text, /'manual'/);
  assert.match(text, /recurring_rule_id\s*=\s*NULL/);
  assert.match(text, /assignment\.details_update/);
  assert.match(text, /assignment\.single_clear/);
  assert.match(text, /before_state/);
  assert.match(text, /after_state/);
  assert.match(text, /await sql\.transaction\(statements\)/);
  assert.match(text, /affectedChildren:\s*childRows\.length/);
});
