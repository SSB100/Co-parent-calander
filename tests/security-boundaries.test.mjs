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
  { file: "app/api/children/route.ts", methods: ["POST"] },
  { file: "app/api/share/route.ts", methods: ["POST", "DELETE"] },
];
const sameOriginMutationRoutes = [
  ...calendarMutationRoutes,
  { file: "app/api/children/[id]/route.ts", methods: ["PATCH"] },
  { file: "app/api/children/[id]/activities/route.ts", methods: ["POST", "PATCH", "DELETE"] },
  { file: "app/api/expenses/route.ts", methods: ["POST", "PATCH", "DELETE"] },
  { file: "app/api/expenses/[id]/settlement/route.ts", methods: ["PATCH"] },
  { file: "app/api/responsibilities/route.ts", methods: ["POST", "PATCH", "DELETE"] },
  { file: "app/api/responsibilities/[id]/completion/route.ts", methods: ["PATCH"] },
  { file: "app/api/attachments/route.ts", methods: ["POST"] },
  { file: "app/api/attachments/[id]/route.ts", methods: ["PATCH", "DELETE"] },
  { file: "app/api/links/route.ts", methods: ["POST", "DELETE"] },
  { file: "app/api/proposals/route.ts", methods: ["POST"] },
  { file: "app/api/proposals/[id]/route.ts", methods: ["PATCH"] },
  { file: "app/api/invites/route.ts", methods: ["POST", "PATCH", "DELETE"] },
  { file: "app/api/parents/route.ts", methods: ["POST"] },
  { file: "app/api/google-calendar/route.ts", methods: ["PATCH", "DELETE"] },
  { file: "app/api/google-calendar/reconcile/route.ts", methods: ["POST"] },
  { file: "app/api/session/logout/route.ts", methods: ["POST"] },
  { file: "app/api/setup/route.ts", methods: ["POST"] },
  { file: "app/api/contact/route.ts", methods: ["POST"] },
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
  assert.match(proxy, /\/calendar-types\/\:path\*/);
  assert.match(proxy, /\/home\/\:path\*/);
  assert.match(proxy, /\/expenses\/\:path\*/);
  assert.match(proxy, /\/responsibilities\/\:path\*/);
  assert.match(proxy, /\/kids\/\:path\*/);
  assert.match(session, /calendarMemberships\.userId/);
  assert.match(session, /session\.permission === ["']viewer["']/);
});

test("global browser headers reduce common web attack surface and APIs are never cached", async () => {
  const config = await source("next.config.ts");

  assert.match(config, /Content-Security-Policy/);
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /object-src 'none'/);
  assert.match(config, /form-action 'self'/);
  assert.match(config, /Strict-Transport-Security/);
  assert.match(config, /X-Content-Type-Options/);
  assert.match(config, /X-Frame-Options/);
  assert.match(config, /Permissions-Policy/);
  assert.match(config, /source: "\/api\/\:path\*"/);
  assert.match(config, /productionDeploymentRedirects/);
  assert.match(config, /VERCEL_PROJECT_PRODUCTION_URL/);
  assert.match(config, /co-parent-calander-\[a-z0-9\]\{9\}-haakers-projects/);
  assert.match(config, /destination: `https:\/\/\$\{process\.env\.VERCEL_PROJECT_PRODUCTION_URL\}\/\:path\*`/);
  assert.match(config, /private, no-store, max-age=0/);
  assert.match(config, /"\/calendar\/\:path\*"/);
  assert.match(config, /"\/calendar-types\/\:path\*"/);
  assert.match(config, /"\/home\/\:path\*"/);
  assert.match(config, /"\/expenses\/\:path\*"/);
  assert.match(config, /"\/responsibilities\/\:path\*"/);
  assert.match(config, /"\/kids\/\:path\*"/);
  assert.doesNotMatch(config, /poweredByHeader:\s*true/);
});

test("email password flow uses stronger new passwords without breaking existing sign-ins or enumerating accounts", async () => {
  const [actions, form] = await Promise.all([
    source("app/auth/actions.ts"),
    source("components/auth/credentials-form.tsx"),
  ]);

  assert.match(actions, /signInPassword[\s\S]*min\(1/);
  assert.match(actions, /newPassword[\s\S]*min\(12/);
  assert.match(actions, /password:\s*newPassword/);
  assert.match(actions, /confirmPassword:\s*newPassword/);
  assert.match(actions, /termsAccepted:\s*z\.literal\("yes"/);
  assert.match(actions, /The passwords do not match/);
  assert.match(actions, /Terms & Conditions before creating your account/);
  assert.match(actions, /The email or password is incorrect/);
  assert.match(actions, /Verify your email using the message we sent you/);
  assert.match(actions, /message\.includes\("verif"\)/);
  assert.doesNotMatch(actions, /status === 403/);
  assert.match(actions, /verificationDestination/);
  assert.match(actions, /\/auth\/sign-in\?/);
  assert.doesNotMatch(actions, /signUpError\.message/);
  assert.doesNotMatch(actions, /alreadyExists/);
  assert.match(form, /name="confirmPassword"/);
  assert.match(form, /name="termsAccepted"/);
  assert.match(form, /termsAccepted \? "yes" : ""/);
  assert.match(form, /href="\/terms"/);
  assert.match(form, /href="\/privacy"/);
  assert.match(form, /minLength=\{isSignUp \? 12 : 1\}/);
  assert.match(form, /At least 12 characters/);
  assert.match(form, /verification email/);
});


test("deferred operational and production auth work stays visible in the repository backlog", async () => {
  const backlog = await source("docs/BACKLOG.md");

  assert.match(backlog, /CONTACT_EMAIL/);
  assert.match(backlog, /APP_DATABASE_URL/);
  assert.match(backlog, /orphan\/test calendar data/);
  assert.match(backlog, /Covie-owned Google OAuth client/);
  assert.match(backlog, /Covie-controlled SMTP\/email provider/);
});


test("runtime database access prefers a restricted credential while migrations keep the owner URL", async () => {
  const [database, drizzle, env] = await Promise.all([
    source("lib/db/index.ts"),
    source("drizzle.config.ts"),
    source(".env.example"),
  ]);

  assert.match(database, /process\.env\.APP_DATABASE_URL \?\? process\.env\.DATABASE_URL/);
  assert.match(env, /APP_DATABASE_URL=/);
  assert.match(env, /restricted Covie application role/);
  assert.match(drizzle, /process\.env\.DATABASE_URL/);
  assert.doesNotMatch(drizzle, /APP_DATABASE_URL/);
});

test("the public root explains Covie and keeps authenticated workspace data private", async () => {
  const [home, chrome] = await Promise.all([
    source("app/page.tsx"),
    source("components/marketing/public-chrome.tsx"),
  ]);

  assert.match(chrome, /\/auth\/sign-in/);
  assert.match(home + chrome, /\/auth\/sign-up/);
  assert.match(home, /Life between two homes, made simpler/);
  assert.match(home, /Create or join/);
  assert.match(home, /The same screens you will actually use/);
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


test("sign-in and sign-up explicitly follow Neon Google OAuth redirects", async () => {
  const [form, provider, brand] = await Promise.all([
    source("components/auth/credentials-form.tsx"),
    source("components/auth/auth-provider.tsx"),
    source("components/google/google-brand.tsx"),
  ]);

  assert.match(form, /authClient\.signIn\.social/);
  assert.match(form, /provider: "google"/);
  assert.match(form, /disableRedirect: true/);
  assert.match(form, /window\.location\.assign\(data\.url\)/);
  assert.match(form, /new URL\(callbackPath, window\.location\.origin\)/);
  assert.match(form, /\/onboarding\?invite=/);
  assert.match(form, /isSignUp[\s\S]*?\? "\/onboarding"[\s\S]*?: "\/"/);
  assert.match(form, /Sign in with Google/);
  assert.match(form, /Sign up with Google/);
  assert.match(provider, /social=\{\{ providers: \["google"\] \}\}/);
  assert.match(provider, /onSessionChange=\{\(\) => router\.refresh\(\)\}/);
  assert.match(brand, /#4285F4/);
  assert.match(brand, /#34A853/);
  assert.match(brand, /#FBBC05/);
  assert.match(brand, /#EA4335/);
  assert.match(brand, /#747775/);
  assert.doesNotMatch(form, /GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_ID/);
});


test("public contact form is same-origin, validated and delivered without database persistence", async () => {
  const [route, form, env] = await Promise.all([
    source("app/api/contact/route.ts"),
    source("components/marketing/contact-form.tsx"),
    source(".env.example"),
  ]);

  assert.match(route, /isSameOriginMutation/);
  assert.match(route, /CONTACT_EMAIL/);
  assert.match(route, /RESEND_API_KEY/);
  assert.match(route, /EMAIL_FROM/);
  assert.match(route, /request_feature: "Request a Feature"/);
  assert.match(route, /website/);
  assert.doesNotMatch(route, /getDb|getSql|INSERT INTO|contact_requests/);
  assert.match(form, /Request a Feature/);
  assert.match(form, /name="name"/);
  assert.match(form, /name="email"/);
  assert.match(form, /name="comments"/);
  assert.match(form, /selected \?/);
  assert.match(env, /CONTACT_EMAIL=/);
});


test("approval notification email config is optional and does not expose provider secrets to the client", async () => {
  const [email, env, packageJson] = await Promise.all([
    source("lib/email/approval-notifications.ts"),
    source(".env.example"),
    source("package.json"),
  ]);

  assert.match(env, /RESEND_API_KEY=/);
  assert.match(env, /EMAIL_FROM=/);
  assert.match(email, /process\.env\.RESEND_API_KEY/);
  assert.match(email, /process\.env\.EMAIL_FROM/);
  assert.doesNotMatch(email, /NEXT_PUBLIC_RESEND|NEXT_PUBLIC_EMAIL/);
  assert.doesNotMatch(packageJson, /"resend"/);
});
