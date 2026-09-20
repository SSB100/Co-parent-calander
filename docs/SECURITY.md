# Covie security baseline

This document records the security controls Covie relies on in production. It is an operational baseline, not a claim that any internet-facing service is risk-free.

## Authentication

- Managed Neon Auth / Better Auth owns password hashing, sessions, email verification, password reset and Google sign-in.
- Email/password signups require at least 12 characters.
- Email verification is required for new email/password accounts.
- Accounts that already had active Covie calendar access when verification was enabled were grandfathered to avoid an accidental lockout.
- Authentication cookies are signed with a server-only secret and use SameSite protection.
- Auth redirect origins should remain limited to stable production/main domains. Remove one-off deployment URLs after production deployments if the integration adds them automatically.

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
