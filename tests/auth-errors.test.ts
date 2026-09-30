import test from "node:test";
import assert from "node:assert/strict";
import { signInFailure } from "../lib/auth/sign-in-error";
import { safeServerDiagnostic } from "../lib/server-diagnostics";

test("sign-in distinguishes invalid credentials, verification and throttling", () => {
  assert.equal(signInFailure({ code: "invalid_credentials", status: 401 }).category, "credentials");
  assert.equal(signInFailure({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 }).category, "credentials");
  assert.equal(signInFailure({ code: "email_not_confirmed", status: 403 }).category, "verification");
  assert.equal(signInFailure({ code: "anything", status: 429 }).category, "rate_limit");
});

test("upstream, origin and unknown failures never blame the password", () => {
  for (const failure of [
    { status: 502, code: "invalid_credentials" },
    { status: 500, message: "incorrect upstream configuration" },
    { status: 403, code: "INVALID_ORIGIN" },
    { status: 401, code: "unknown" },
    new TypeError("fetch failed"), null,
  ]) {
    assert.equal(signInFailure(failure).category, "service");
    assert.match(signInFailure(failure).message, /temporarily unavailable/);
  }
});

test("diagnostics allow only bounded codes, status, booleans and hashed hosts", () => {
  const diagnostic = safeServerDiagnostic({
    code: "42P01", status: 502, message: "private message", stack: "private stack",
    email: "private@example.test", password: "private password", cookie: "private cookie",
    cause: { code: "ENOTFOUND", message: "private cause" },
  }, {
    NEON_AUTH_BASE_URL: "https://auth.example.test/secret-path?token=private",
    NEON_AUTH_COOKIE_SECRET: "private cookie secret",
    APP_DATABASE_URL: "postgresql://user:private@database.example.test/private?token=private",
  });
  assert.equal(diagnostic.code, "42P01");
  assert.equal(diagnostic.causeCode, "ENOTFOUND");
  assert.equal(diagnostic.status, 502);
  assert.equal(diagnostic.authConfigured, true);
  assert.equal(diagnostic.appDatabaseConfigured, true);
  assert.equal(diagnostic.fallbackDatabaseConfigured, false);
  assert.match(diagnostic.authHostFingerprint!, /^[a-f0-9]{16}$/);
  assert.doesNotMatch(JSON.stringify(diagnostic), /private|example|password|cookie secret|user:/);
  assert.deepEqual(safeServerDiagnostic({ code: "arbitrary secret", status: NaN }, {}), {
    code: null, causeCode: null, status: null, authConfigured: false, authCookieConfigured: false,
    appDatabaseConfigured: false, fallbackDatabaseConfigured: false, authHostFingerprint: null, databaseHostFingerprint: null,
  });
});

test("host fingerprint ignores credentials and paths, and malformed configuration is bounded", () => {
  const first = safeServerDiagnostic(null, { DATABASE_URL: "postgresql://one:first@db.example.test/one" });
  const second = safeServerDiagnostic(null, { DATABASE_URL: "postgresql://two:second@db.example.test/two" });
  assert.equal(first.databaseHostFingerprint, second.databaseHostFingerprint);
  assert.equal(safeServerDiagnostic(null, { DATABASE_URL: "malformed value" }).databaseHostFingerprint, "invalid_url");
});
