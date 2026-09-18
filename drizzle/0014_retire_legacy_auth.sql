DROP TABLE IF EXISTS "sessions";
DROP TABLE IF EXISTS "access_tokens";
DROP TYPE IF EXISTS "access_token_type";

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0014', 'Retire legacy token and session authentication', false);
