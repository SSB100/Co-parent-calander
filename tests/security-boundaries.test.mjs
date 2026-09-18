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
  { file: "app/api/share/route.ts", methods: ["POST", "DELETE"] },
];
const sameOriginMutationRoutes = [
  ...calendarMutationRoutes,
  { file: "app/api/invites/route.ts", methods: ["POST", "PATCH", "DELETE"] },
  { file: "app/api/parents/route.ts", methods: ["POST"] },
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

test("legacy public share links now require account login", async () => {
  const text = await source("app/share/[token]/page.tsx");

  assert.match(text, /redirect\(["']\/auth\/sign-in["']\)/);
  assert.doesNotMatch(text, /accessTokens/);
});

test("legacy editor links are retired and cannot authenticate", async () => {
  const [route, session, schema] = await Promise.all([
    source("app/access/editor/[token]/route.ts"),
    source("lib/security/session.ts"),
    source("lib/db/schema.ts"),
  ]);

  assert.match(route, /\/auth\/sign-in/);
  assert.match(route, /legacy.*retired/);
  assert.doesNotMatch(route, /accessTokens|createEditorSessionRecord|SESSION_COOKIE_NAME/);
  assert.doesNotMatch(session, /coparent_session|getLegacyEditorSession|claimLegacyCalendarForCurrentUser/);
  assert.doesNotMatch(schema, /accessTokens|sessions = pgTable|access_token_type/);
});

test("account routes use managed Neon auth and protect the signed-in workspace", async () => {
  const handler = await source("app/api/auth/[...path]/route.ts");
  const proxy = await source("proxy.ts");
  const session = await source("lib/security/session.ts");

  assert.match(handler, /auth\.handler\(\)/);
  assert.match(proxy, /auth\.middleware/);
  assert.match(proxy, /\/dashboard\/\:path\*/);
  assert.match(proxy, /\/calendar\/\:path\*/);
  assert.match(session, /calendarMemberships\.userId/);
  assert.match(session, /session\.permission === ["']viewer["']/);
});

test("the public root explains Covie and keeps authenticated workspace data private", async () => {
  const home = await source("app/page.tsx");

  assert.match(home, /\/auth\/sign-in/);
  assert.match(home, /\/auth\/sign-up/);
  assert.match(home, /Co-parenting,/);
  assert.match(home, /How Covie works/);
  assert.match(home, /Create or join/);
  assert.doesNotMatch(home, /CalendarShell/);
  assert.doesNotMatch(home, /\/api\/calendar/);
});

test("viewer route contains no calendar mutation fetches or form actions", async () => {
  const text = await source("app/share/[token]/page.tsx");

  assert.doesNotMatch(text, /fetch\s*\(\s*["']\/api\//);
  assert.doesNotMatch(text, /method\s*:\s*["'](?:POST|PATCH|PUT|DELETE)["']/);
  assert.doesNotMatch(text, /<form\b/);
});

test("calendar invite management is owner-only and uses hashed one-use codes", async () => {
  const text = await source("app/api/invites/route.ts");

  assert.match(text, /getOwnerSession\s*\(/);
  assert.match(text, /hashToken\(normalizedCode\)/);
  assert.match(text, /max_uses/);
  assert.match(text, /lt\(calendarInvites\.useCount, calendarInvites\.maxUses\)/);
  assert.match(text, /z\.enum\(\[["']editor["'], ["']viewer["']\]\)/);
});


test("legacy setup is retired while managed calendar creation and joining remain account based", async () => {
  const [setup, calendarActions] = await Promise.all([
    source("app/api/setup/route.ts"),
    source("app/calendar/actions.ts"),
  ]);

  assert.match(setup, /status: 410/);
  assert.match(setup, /Legacy setup links have been retired/);
  assert.doesNotMatch(setup, /access_tokens|generateSecureToken|editorUrl/);

  assert.match(calendarActions, /calendar_memberships/);
  assert.match(calendarActions, /calendar_invites/);
  assert.match(calendarActions, /requireAccount/);
});


test("login and signup expose Google OAuth through the managed Neon Auth client", async () => {
  const [provider, form] = await Promise.all([
    source("components/auth/auth-provider.tsx"),
    source("components/auth/credentials-form.tsx"),
  ]);

  assert.match(provider, /social=\{\{ providers: \["google"\] \}\}/);
  assert.match(form, /authClient\.signIn\.social/);
  assert.match(form, /provider: "google"/);
  assert.match(form, /Continue with Google/);
  assert.match(form, /\/onboarding\?invite=/);
});
