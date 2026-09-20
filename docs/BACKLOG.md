# Covie backlog

This file contains deliberately deferred work. These are not blockers for day-to-day development unless marked otherwise.

## Operational

- [ ] Configure `CONTACT_EMAIL` in Vercel so FAQ/Contact submissions have a production inbox.
- [ ] Activate the restricted `covie_app` runtime database role by setting `APP_DATABASE_URL` in Vercel and verifying runtime queries use it while migrations keep `DATABASE_URL`.
- [ ] Review orphan/test calendar data, including the stale calendar membership that points to a removed Auth user, and delete only records confirmed as disposable.

## Auth production readiness

- [ ] After the current login repair is confirmed in Production, run a real password-reset and Google sign-in smoke test from the stable production URL.

- [ ] Replace Neon's shared Google OAuth development credentials with a Covie-owned Google OAuth client before broad public launch. Register the production Managed Neon Auth callback URL and publish/verify the Google consent configuration as required.
- [ ] Replace Neon's shared auth email sender with a Covie-controlled SMTP/email provider for production password-reset and verification reliability.

## Legal / privacy

- [ ] Have the current New Zealand Terms & Conditions and Privacy Policy reviewed by an appropriate legal/privacy professional before broad public launch.
