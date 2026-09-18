-- Legacy token/session authentication has been retired from application runtime code.
-- Keep the old credential tables and enum temporarily as recovery data for legacy-only
-- calendars that have not yet been attached to Managed Neon Auth memberships.
-- A later cleanup migration may remove them once recovery is complete.

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0014', 'Retire legacy token and session authentication', false);
