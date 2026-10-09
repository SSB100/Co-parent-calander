#!/usr/bin/env bash
set -euo pipefail

# Uses only the explicitly approved installed PG binaries/tooling, read-only.
# All cluster data and logs are fresh synthetic artifacts in this worktree.
# Retains data after confirmed shutdown; no existing runner/data is removed.
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pg_root="${COVIE_TIMESHEETS_PG_ROOT:-}"
pg_bin="${COVIE_TIMESHEETS_PG_BIN:-}"
pg_lib="${COVIE_TIMESHEETS_PG_LIB:-}"
if [[ -z "$pg_bin" ]] && [[ -n "$pg_root" ]]; then pg_bin="$pg_root/usr/lib/postgresql/17/bin"; fi
if [[ -z "$pg_lib" ]] && [[ -n "$pg_root" ]]; then pg_lib="$pg_root/usr/lib/x86_64-linux-gnu"; fi
if [[ -z "$pg_bin" ]] && command -v pg_config >/dev/null 2>&1; then pg_bin="$(pg_config --bindir)"; fi
[[ -n "$pg_bin" ]] || { printf 'Set COVIE_TIMESHEETS_PG_BIN to an installed PostgreSQL bin directory.\n' >&2; exit 1; }
tooling="${COVIE_SQL_TOOLING:-$repo/build/timesheets-sql-tooling}"
if [[ "${COVIE_TIMESHEETS_SANITIZED:-}" != 1 ]]; then
  exec env -i PATH="$PATH" LANG=C.UTF-8 HOME=/tmp \
    COVIE_TIMESHEETS_SANITIZED=1 COVIE_TIMESHEETS_PG_ROOT="$pg_root" COVIE_TIMESHEETS_PG_BIN="$pg_bin" COVIE_TIMESHEETS_PG_LIB="$pg_lib" COVIE_SQL_TOOLING="$tooling" \
    NODE_OPTIONS=--max-old-space-size=256 bash "${BASH_SOURCE[0]}" "$@"
fi

bin="$pg_bin"
export LD_LIBRARY_PATH="$pg_lib"
for program in initdb pg_ctl createdb psql; do
  [[ -x "$bin/$program" ]] || { printf 'Missing approved PostgreSQL binary: %s\n' "$bin/$program" >&2; exit 1; }
done
[[ -f "$tooling/node_modules/pg/package.json" ]] || { printf 'Missing existing pg tooling: %s\n' "$tooling" >&2; exit 1; }
[[ "$(id -u)" != 0 ]] || { printf 'Run this synthetic cluster as the non-root workspace user.\n' >&2; exit 1; }

mkdir -p "$repo/build"
run="$(mktemp -d "$repo/build/pg-run.XXXXXX")"
mkdir -p "$run/logs" "$run/tmp" "$run/home"
export HOME="$run/home" TMPDIR="$run/tmp"
printf 'Synthetic Timesheets PostgreSQL qualification\nStarted: %s\nNo provider/production connection environment retained.\n' "$(date -u +%FT%TZ)" > "$run/run.txt"
printf 'Timesheets PostgreSQL artifacts: %s\n' "$run"
started=0
finish() {
  local status=$?
  trap - EXIT INT TERM
  if [[ "$started" == 1 ]] && "$bin/pg_ctl" -D "$run/data" status > "$run/logs/status-before-stop.log" 2>&1; then
    if "$bin/pg_ctl" -D "$run/data" -m fast -w stop > "$run/logs/stop.log" 2>&1; then
      printf 'Shutdown confirmed: %s\n' "$(date -u +%FT%TZ)" >> "$run/run.txt"
    else
      printf 'PostgreSQL shutdown failed; inspect %s/logs/stop.log.\n' "$run" >&2
      status=1
    fi
  fi
  printf 'Exit status: %s\nData and logs retained: %s\n' "$status" "$run" >> "$run/run.txt"
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"$bin/initdb" -D "$run/data" -U timesheets_test --auth-local=reject --auth-host=trust --encoding=UTF8 --no-locale > "$run/logs/initdb.log" 2>&1
cat >> "$run/data/postgresql.conf" <<'CONFIG'
listen_addresses = '127.0.0.1'
port = 55436
unix_socket_directories = ''
shared_buffers = '16MB'
max_connections = 12
jit = off
fsync = on
log_statement = 'none'
CONFIG
started=1
"$bin/pg_ctl" -D "$run/data" -l "$run/logs/postgres.log" -w start > "$run/logs/start.log" 2>&1
"$bin/createdb" -h 127.0.0.1 -p 55436 -U timesheets_test timesheets_test
export COVIE_TIMESHEETS_TEST_DATABASE_URL=postgresql://timesheets_test@127.0.0.1:55436/timesheets_test
cd "$repo"
# Rebuild the entire historical schema in a new database, one migration per
# transaction. These are not replayed against any existing/production database.
psql=("$bin/psql" -X -h 127.0.0.1 -p 55436 -U timesheets_test -d timesheets_test -v ON_ERROR_STOP=1)
"${psql[@]}" --single-transaction > "$run/logs/auth-stub.log" <<'SQL'
CREATE SCHEMA neon_auth;
CREATE TABLE neon_auth."user" (id uuid PRIMARY KEY,name text,email text NOT NULL,"emailVerified" boolean NOT NULL DEFAULT false);
SQL
cat > "$run/legacy-fixture.sql" <<'SQL'
INSERT INTO calendars(id,name,calendar_type,timezone) VALUES
 ('10000000-0000-4000-8000-000000000001','Synthetic preserved Co-parenting','co_parenting','UTC'),
 ('10000000-0000-4000-8000-000000000002','Synthetic preserved Staff Rosters','staff_rosters','UTC');
INSERT INTO participants(id,calendar_id,display_name,color_key,profile_slot) VALUES
 ('10000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','Synthetic parent','coral','parent_one');
INSERT INTO children(id,calendar_id,display_name) VALUES
 ('10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001','Synthetic child');
INSERT INTO parenting_assignments(id,calendar_id,child_id,assignment_date,parent_id,note) VALUES
 ('10000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000012','2026-10-08','10000000-0000-4000-8000-000000000011','Preserve this synthetic parenting record');
INSERT INTO calendar_memberships(id,calendar_id,user_id,permission) VALUES
 ('10000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000031','owner');
INSERT INTO staff_roster_members(id,calendar_id,membership_id,display_name,access_role) VALUES
 ('10000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000021','Synthetic preserved staff','owner');
INSERT INTO staff_roster_clock_sessions(id,calendar_id,member_id,clock_in_at,clock_out_at,unrostered) VALUES
 ('10000000-0000-4000-8000-000000000023','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000022','2026-10-08T09:07:00Z','2026-10-08T09:22:00Z',true);
INSERT INTO staff_roster_shifts(id,calendar_id,member_id,shift_date,start_time,end_time,note) VALUES
 ('10000000-0000-4000-8000-000000000024','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000022','2026-10-08','09:00','17:00','Preserve this synthetic roster');
SQL
cat > "$run/legacy-fingerprint.sql" <<'SQL'
SELECT md5(jsonb_build_object(
 'calendars',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM calendars r WHERE id IN('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')),
 'parents',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM participants r WHERE calendar_id='10000000-0000-4000-8000-000000000001'),
 'children',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM children r WHERE calendar_id='10000000-0000-4000-8000-000000000001'),
 'assignments',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM parenting_assignments r WHERE calendar_id='10000000-0000-4000-8000-000000000001'),
 'memberships',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM calendar_memberships r WHERE calendar_id='10000000-0000-4000-8000-000000000002'),
 'staff',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM staff_roster_members r WHERE calendar_id='10000000-0000-4000-8000-000000000002'),
 'clocks',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM staff_roster_clock_sessions r WHERE calendar_id='10000000-0000-4000-8000-000000000002'),
 'shifts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM staff_roster_shifts r WHERE calendar_id='10000000-0000-4000-8000-000000000002')
)::text);
SQL
for migration in "$repo"/drizzle/[0-9][0-9][0-9][0-9]_*.sql; do
  name="$(basename "$migration" .sql)"
  if [[ "$name" == 0036_timesheets ]]; then
    "${psql[@]}" --single-transaction -f "$run/legacy-fixture.sql" > "$run/logs/legacy-fixture.log"
    "${psql[@]}" -At -f "$run/legacy-fingerprint.sql" > "$run/legacy-before.sha"
  fi
  if [[ "$name" == 0037_timesheet_work_types ]]; then
    "${psql[@]}" --single-transaction -f "$repo/tests/fixtures/timesheets-pre-work-types.sql" > "$run/logs/pre-work-types-fixture.log"
  fi
  "${psql[@]}" --single-transaction -f "$migration" > "$run/logs/migration-$name.log" 2>&1
done
"${psql[@]}" -At -f "$run/legacy-fingerprint.sql" > "$run/legacy-after-migration.sha"
cmp "$run/legacy-before.sha" "$run/legacy-after-migration.sha"
# A NOLOGIN role with no credentials models the existing runtime role. Its
# pre-existing access is confined to core calendar records and public Auth
# profile columns; the proposed 0036 bundle grants only the new domain rights.
"${psql[@]}" --single-transaction > "$run/logs/runtime-role.log" <<'SQL'
CREATE ROLE covie_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public,neon_auth TO covie_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON calendars,calendar_memberships TO covie_app;
GRANT SELECT(id,name,email,"emailVerified") ON neon_auth."user" TO covie_app;
SQL
"${psql[@]}" --single-transaction -f "$repo/docs/releases/timesheets-permissions.sql" > "$run/logs/timesheets-permissions.log" 2>&1
"${psql[@]}" --single-transaction -f "$repo/docs/releases/timesheets-work-types-permissions.sql" > "$run/logs/work-types-permissions.log" 2>&1
export COVIE_TIMESHEETS_FULL_SCHEMA=1
# Same exec/network namespace throughout; no background runner survives EXIT.
node --import tsx --test --test-concurrency=1 tests/timesheets.database.test.ts 2>&1 | tee "$run/logs/semantics.log"
node --import tsx --test --test-concurrency=1 tests/timesheets-concurrency.database.test.ts 2>&1 | tee "$run/logs/concurrency.log"
node --import tsx --test --test-concurrency=1 tests/timesheets-service.database.test.ts 2>&1 | tee "$run/logs/service.log"
"${psql[@]}" -At -f "$run/legacy-fingerprint.sql" > "$run/legacy-after-tests.sha"
cmp "$run/legacy-before.sha" "$run/legacy-after-tests.sha"
printf 'All migrations, runtime permissions, semantics and native concurrency checks passed. Legacy fingerprints unchanged.\n' | tee -a "$run/run.txt"
