import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

const calendarMutationRoutes = [
  { file: "app/api/assignments/route.ts", methods: ["POST"] },
  { file: "app/api/assignment-details/route.ts", methods: ["PATCH"] },
  { file: "app/api/assignments/undo/route.ts", methods: ["POST"] },
  { file: "app/api/events/route.ts", methods: ["POST", "PATCH", "DELETE"] },
  { file: "app/api/recurring-schedule/route.ts", methods: ["POST", "DELETE"] },
  { file: "app/api/settings/route.ts", methods: ["PATCH"] },
  { file: "app/api/setup/route.ts", methods: ["POST"] },
  { file: "app/api/share/route.ts", methods: ["POST", "DELETE"] },
];
const sameOriginMutationRoutes = [
  ...calendarMutationRoutes,
  { file: "app/api/session/logout/route.ts", methods: ["POST"] },
];

test("every calendar mutation requires an editor session", async () => {
  for (const route of calendarMutationRoutes) {
    const text = await source(route.file);

    assert.match(
      text,
      /getEditorSession\s*\(/,
      `${route.file} must require an editor session`,
    );
  }
});

test("every mutation route uses same-origin protection", async () => {
  for (const route of sameOriginMutationRoutes) {
    const text = await source(route.file);

    assert.match(
      text,
      /isSameOriginMutation\s*\(/,
      `${route.file} must reject cross-origin mutation requests`,
    );

    for (const method of route.methods) {
      assert.match(
        text,
        new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`),
        `${route.file} must still expose its expected ${method} handler`,
      );
    }
  }
});

test("same-origin mutation protection fails closed when Origin is missing or invalid", async () => {
  const text = await source("lib/security/request.ts");

  assert.match(text, /if \(!origin\) \{\s*return false;/);
  assert.match(text, /new URL\(origin\)\.origin === request\.nextUrl\.origin/);
  assert.match(text, /catch \{\s*return false;/);
});

test("read-only share links validate viewer tokens and never create editor sessions", async () => {
  const text = await source("app/share/[token]/page.tsx");

  assert.match(text, /eq\(accessTokens\.type,\s*["']viewer["']\)/);
  assert.doesNotMatch(text, /createEditorSessionRecord/);
  assert.doesNotMatch(text, /SESSION_COOKIE_NAME/);
  assert.doesNotMatch(text, /response\.cookies\.set/);
  assert.doesNotMatch(text, /cookies\s*\(/);
});

test("editor access is a separate token path that explicitly creates an editor session", async () => {
  const text = await source("app/access/editor/[token]/route.ts");

  assert.match(text, /eq\(accessTokens\.type,\s*["']editor["']\)/);
  assert.match(text, /createEditorSessionRecord\s*\(/);
});

test("invalid editor links receive clear feedback after returning to preview mode", async () => {
  const accessRoute = await source("app/access/editor/[token]/route.ts");
  const calendarShell = await source("components/calendar/calendar-shell.tsx");

  assert.match(accessRoute, /new URL\(["']\/\?access=invalid["']/);
  assert.match(calendarShell, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(calendarShell, /That editor link is invalid, expired, or revoked\./);
});

test("the public root clearly distinguishes preview data from the live calendar", async () => {
  const calendarShell = await source("components/calendar/calendar-shell.tsx");

  assert.match(calendarShell, /Public preview/);
  assert.match(calendarShell, /not your saved family calendar/);
  assert.match(calendarShell, /private editor link/);
  assert.match(calendarShell, /viewer link/);
});

test("viewer route contains no calendar mutation fetches or form actions", async () => {
  const text = await source("app/share/[token]/page.tsx");

  assert.doesNotMatch(text, /fetch\s*\(\s*["']\/api\//);
  assert.doesNotMatch(text, /method\s*:\s*["'](?:POST|PATCH|PUT|DELETE)["']/);
  assert.doesNotMatch(text, /<form\b/);
});
