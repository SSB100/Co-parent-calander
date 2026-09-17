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

test("every calendar mutation requires editor session and same-origin protection", async () => {
  for (const route of calendarMutationRoutes) {
    const text = await source(route.file);

    assert.match(
      text,
      /getEditorSession\s*\(/,
      `${route.file} must require an editor session`,
    );
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

test("viewer route contains no calendar mutation fetches or form actions", async () => {
  const text = await source("app/share/[token]/page.tsx");

  assert.doesNotMatch(text, /fetch\s*\(\s*["']\/api\//);
  assert.doesNotMatch(text, /method\s*:\s*["'](?:POST|PATCH|PUT|DELETE)["']/);
  assert.doesNotMatch(text, /<form\b/);
});
