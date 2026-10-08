# Covie security baseline

This document records the security controls Covie relies on in production. It is an operational baseline, not a claim that any internet-facing service is risk-free.

## Authentication

- Managed Neon Auth / Better Auth owns password hashing, sessions, email verification, password reset and Google sign-in.
- Email/password signups require at least 12 characters.
- Email verification is required for new email/password accounts.
- Accounts that already had active Covie calendar access when verification was enabled were grandfathered to avoid an accidental lockout.
- Authentication cookies are signed with a server-only secret and use SameSite protection.
- Auth redirect origins stay limited to Covie-controlled production/main hosts. The active Vercel production deployment hostname may also be temporarily trusted; production requests to generated deployment hosts are redirected to the stable production URL before auth runs. Do not remove the currently active deployment origin until the canonical redirect is live.

## Authorization

- Calendar access is derived from the authenticated user and calendar_memberships.
- Viewer, editor and owner permissions are enforced server-side.
- State-changing API routes use same-origin request checks.
- Public legacy editor/session links are retired.

## Database credentials

Normal runtime queries should use APP_DATABASE_URL with the restricted covie_app Postgres role.

DATABASE_URL is reserved for migrations/owner operations. Drizzle intentionally continues to use DATABASE_URL.

Until APP_DATABASE_URL is configured in the deployment environment, the application deliberately falls back to DATABASE_URL so credential rotation can be completed without downtime. Treat that fallback as a temporary operational state, not the desired steady state.

The restricted role is intended to:
- read/write Covie application tables;
- read the non-secret neon_auth.user profile table only where the application needs account names/emails;
- have no access to neon_auth.account, neon_auth.session, verification records or Auth configuration;
- have no database/schema creation, role management, replication, bypass-RLS or superuser capability.

Never expose either database URL to browser code.

## Sensitive data

- Database traffic is TLS protected and Neon provides encryption at rest.
- Child health identifiers, medication/allergy notes and similar fields are not copied into audit history; audit records only which profile fields changed.
- Google Calendar access and refresh tokens are additionally encrypted by Covie with AES-256-GCM before database storage.
- Invite codes are stored as hashes rather than reusable plaintext credentials.
- Approval emails intentionally omit the private proposal details.

Field-level encryption for all child profile text is not currently used. It would add operational/key-management complexity while offering limited protection against a full application-runtime compromise. Revisit this only if Covie's compliance requirements or threat model materially change.

## Files

- Attachments use private object storage and short-lived signed upload/download URLs.
- Uploads have narrow MIME/size allowlists.
- Filename control characters are rejected and extensions must match the declared MIME type.
- MIME/extension validation is not antivirus scanning. If Covie begins accepting untrusted files at significant public scale, add content inspection/malware scanning before treating uploads as fully trusted.

## Browser and platform controls

- Authenticated pages and APIs are private/no-store.
- The PWA service worker caches static assets only, not private page/API/auth content.
- Security headers include HSTS, nosniff, anti-framing controls, referrer policy, permissions policy and a baseline CSP.
- Vercel provides platform DDoS protection.
- Managed Auth supplies authentication-level abuse protections. Add custom WAF rate limits only when real traffic justifies them; roll them out in log mode first to avoid blocking legitimate parents.

## Secret handling

Keep these server-only:
- DATABASE_URL
- APP_DATABASE_URL
- NEON_AUTH_COOKIE_SECRET
- GOOGLE_CLIENT_SECRET
- GOOGLE_TOKEN_ENCRYPTION_KEY
- CRON_SECRET
- RESEND_API_KEY

Do not create NEXT_PUBLIC variants of secrets.

Prefer write-only/sensitive environment-variable storage in production. Rotate a credential if it is ever exposed outside its intended secret store.

## Dependency audit gate and temporary development exception

Run `node scripts/dependency-audit.mjs`. It runs both full and production-only npm audits, prints the unfiltered findings, and saves `full.json`, `production.json`, and `policy.json` under `build/security-audit/` (or `AUDIT_REPORT_DIR`). npm receives public package names and versions to perform these checks. Network, report-schema, or reachability-check failures block the gate. The high/critical threshold remains unchanged; moderate findings are reported for follow-up.

On 2026-10-08, the owner approved one narrowly scoped, temporary exception for [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). It expires at **2026-11-07 00:00 UTC**. This acknowledges an unpatched development dependency; it does not claim the package is fixed. There is no automatic renewal. Upgrade to an official patched release, remove the affected dependency, or explicitly re-review the exception before expiry.

The only reviewed dependency path is:

`eslint-config-next@16.3.8` → `@next/eslint-plugin-next@16.3.8` → `fast-glob@3.3.1` → `micromatch@4.0.8` → `braces@3.0.3`.

All five packages are development-only in the lockfile. Inspection of the exact published Next ESLint plugin and its [tagged source](https://github.com/vercel/next.js/blob/v16.3.8/packages/eslint-plugin-next/src/utils/get-root-dirs.ts) found that its sole fast-glob call receives the repository-controlled ESLint `settings.next.rootDir` value. Covie omits that setting, so the plugin uses `context.cwd` without invoking glob expansion. Application sources do not reference these packages. This assessment covers the reported dependency path, not every possible bundled dependency in the framework.

The [upstream advisory report](https://github.com/micromatch/braces/issues/70) recommends limiting input length and nesting until a fix exists. Covie's reviewed path does not accept patterns at all. As of this review, npm's latest `braces` is 3.0.3, with no patched release. Next ESLint 16.4.0 stable and 16.5.0-canary.3 still depend on fast-glob 3.3.1; updating them does not remove the affected path.

The gate permits only that exact advisory and its five known high-severity propagation entries. It fails on any production high/critical finding, unknown high/critical finding, additional advisory, changed severity or range, changed package versions/edges, duplicate package copies, production classification, new dependency consumers, configured `next.rootDir` in any effective project ESLint config, or application source reference to the lint packages. The conservative source scan checks literal package names and subpaths outside tests, audit scripts, and the ESLint config; computed/obfuscated module loading is outside this reachability assessment and must not be introduced for these dependencies. Full audit findings remain visible, including this exception and existing moderate esbuild/Drizzle findings.

The same remediation updates Sharp to 0.35.5 (with libvips binaries 1.3.4) and source-map-js to 1.2.2, compatible official patches for [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) and [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). No framework downgrade, advisory removal, or broad development-dependency exclusion is used to pass the full gate.
