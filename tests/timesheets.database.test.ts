import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

/**
 * Synthetic PostgreSQL semantics only: either a fresh in-memory PGlite database
 * or the strict loopback-only native runner below. No remote calls or existing
 * data. PGlite serializes queries: these tests do NOT qualify
 * native PostgreSQL multi-connection concurrency or lock/deadlock behavior.
 * Run with COVIE_SQL_TOOLING pointing to an existing tooling package directory
 * containing @electric-sql/pglite, or pg for the explicit native test URL.
 * This does not install or change dependencies.
 */
const tooling = process.env.COVIE_SQL_TOOLING;
const nativeUrl = process.env.COVIE_TIMESHEETS_TEST_DATABASE_URL;
const fullSchema = process.env.COVIE_TIMESHEETS_FULL_SCHEMA === "1";
type Row = Record<string, unknown>;
type EmbeddedDatabase = {
  exec(sql: string): Promise<unknown>;
  query<T = Row>(sql: string, parameters?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
};
type Organisation = { calendarId: string; id: string; owner: string; ownerStaff: string; ownerEmail: string };
type Person = { staffId: string; userId: string; email: string };
type Mutation = { ok: boolean; id: string };

const baseline = `
CREATE TYPE calendar_type AS ENUM ('co_parenting','staff_rosters');
CREATE TABLE calendars (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, calendar_type calendar_type NOT NULL,
 timezone text NOT NULL DEFAULT 'UTC', share_enabled boolean NOT NULL DEFAULT false,
 archived_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE calendar_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), calendar_id uuid NOT NULL REFERENCES calendars(id),
 user_id uuid NOT NULL, permission text NOT NULL CHECK(permission IN('owner','editor','viewer')),
 UNIQUE(calendar_id,user_id)
);
CREATE TABLE covie_schema_migrations (migration_id text PRIMARY KEY,description text NOT NULL,baseline boolean NOT NULL);
CREATE SCHEMA neon_auth;
CREATE TABLE neon_auth."user" (id uuid PRIMARY KEY,email text NOT NULL,"emailVerified" boolean NOT NULL DEFAULT false);
`;

test(nativeUrl ? "Timesheets migration: isolated native PostgreSQL semantics" : "Timesheets migration: isolated PGlite semantics, not native concurrency qualification", { skip: !tooling, timeout: 120_000 }, async t => {
  const requireTooling = createRequire(resolve(tooling!, "package.json"));
  let db: EmbeddedDatabase;
  if (nativeUrl) {
    const url = new URL(nativeUrl);
    assert.ok(url.protocol === "postgresql:" || url.protocol === "postgres:");
    assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55436");
    assert.equal(url.pathname, "/timesheets_test"); assert.equal(url.username, "timesheets_test");
    assert.equal(url.password, ""); assert.equal(url.search, ""); assert.equal(url.hash, "");
    const { Client } = requireTooling("pg") as { Client: new (options: { connectionString: string }) => {
      connect(): Promise<void>; query<T>(sql: string, parameters?: unknown[]): Promise<{ rows: T[] }>; end(): Promise<void>;
    } };
    const client = new Client({ connectionString: nativeUrl });
    await client.connect();
    db = { query: (sql, parameters) => client.query(sql, parameters), exec: sql => client.query(sql), close: () => client.end() };
  } else {
    const { PGlite } = requireTooling("@electric-sql/pglite") as { PGlite: new () => EmbeddedDatabase };
    db = new PGlite();
  }
  t.after(() => db.close());
  if (fullSchema) {
    assert.ok(nativeUrl, "A full-schema run must use the explicit isolated native runner.");
    assert.equal((await db.query("SELECT migration_id FROM covie_schema_migrations WHERE migration_id='0036'")).rows.length, 1);
  } else {
    await db.exec(baseline);
    await db.exec(await readFile(new URL("../drizzle/0036_timesheets.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../drizzle/0037_timesheet_work_types.sql", import.meta.url), "utf8"));
  }
  const query = async <T = Row>(sql: string, parameters: unknown[] = []) => (await db.query<T>(sql, parameters)).rows;
  async function asRuntime<T>(operation: () => Promise<T>) {
    if (!fullSchema) return operation();
    await db.exec("SET ROLE covie_app");
    try { return await operation(); }
    finally { await db.exec("RESET ROLE"); }
  }
  const mutate = async (org: Organisation, actor: string, action: string, data: Row) =>
    asRuntime(async () => (await query<{ result: Mutation }>("SELECT timesheet_mutate($1::uuid,$2::uuid,$3,$4::jsonb) AS result", [org.calendarId, actor, action, JSON.stringify(data)]))[0].result);
  const reject = (operation: Promise<unknown>, code: string) => assert.rejects(operation, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code);
    return true;
  });
  async function account(email: string, verified = true) {
    const id = randomUUID();
    await query('INSERT INTO neon_auth."user"(id,email,"emailVerified") VALUES($1,$2,$3)', [id, email, verified]);
    return id;
  }
  async function organisation(): Promise<Organisation> {
    const calendarId = randomUUID(), ownerEmail = `owner-${randomUUID()}@example.invalid`, owner = await account(ownerEmail);
    await query("INSERT INTO calendars(id,name,calendar_type) VALUES($1,'Synthetic Timesheets','timesheets')", [calendarId]);
    await query("INSERT INTO calendar_memberships(calendar_id,user_id,permission) VALUES($1,$2,'owner')", [calendarId, owner]);
    const [{ id }] = await asRuntime(() => query<{ id: string }>("SELECT timesheet_create_organisation($1,$2,'Synthetic Timesheets','Synthetic owner',$3,'UTC') AS id", [calendarId, owner, ownerEmail]));
    const [{ id: ownerStaff }] = await query<{ id: string }>("SELECT id FROM timesheet_staff_profiles WHERE organisation_id=$1", [id]);
    return { calendarId, id, owner, ownerStaff, ownerEmail };
  }
  async function staff(org: Organisation, role = "member", email = `person-${randomUUID()}@example.invalid`) {
    const { id } = await mutate(org, org.owner, "saveStaff", { displayName: "Synthetic person", email, role, active: true });
    return { staffId: id, email };
  }
  async function invitation(org: Organisation, staffId: string, actor = org.owner) {
    const tokenHash = createHash("sha256").update(`synthetic-only:${randomUUID()}`).digest("hex");
    const { id } = await mutate(org, actor, "createInvite", { staffId, tokenHash });
    return { id, tokenHash };
  }
  const redeem = async (tokenHash: string, actor: string) =>
    asRuntime(async () => (await query<{ calendar_id: string }>("SELECT timesheet_redeem_invitation($1,$2::uuid) AS calendar_id", [tokenHash, actor]))[0].calendar_id);
  async function person(org: Organisation, role = "member"): Promise<Person> {
    const profile = await staff(org, role), userId = await account(profile.email);
    const invite = await invitation(org, profile.staffId);
    assert.equal(await redeem(invite.tokenHash, userId), org.calendarId);
    return { ...profile, userId };
  }
  async function assign(org: Organisation, manager: Person, target: { staffId: string }, assigned = true) {
    return mutate(org, org.owner, "assignManager", { managerStaffId: manager.staffId, staffId: target.staffId, assigned });
  }
  async function version(table: "organisations" | "timesheet_staff_profiles" | "timesheet_entries" | "timesheet_clients" | "timesheet_projects", id: string) {
    return (await query<{ version: number }>(`SELECT version FROM ${table} WHERE id=$1`, [id]))[0].version;
  }
  async function saveSettings(org: Organisation, incrementMinutes: number, timezone = "UTC") {
    return mutate(org, org.owner, "saveSettings", { name: "Synthetic Timesheets", timezone, incrementMinutes, version: await version("organisations", org.id) });
  }
  async function entryData(org: Organisation, staffId: string, patch: Row = {}) {
    return { staffId, clientId: null, projectId: null, start: "2026-10-08T09:07:00Z", end: "2026-10-08T09:22:00Z", timezone: "UTC", notes: "Synthetic work", billable: true,
      expectedOrganisationVersion: await version("organisations", org.id), ...patch };
  }
  async function updateStaff(org: Organisation, profile: { staffId: string; email: string }, patch: Row = {}, actor = org.owner) {
    return mutate(org, actor, "saveStaff", { id: profile.staffId, displayName: "Updated synthetic person", email: profile.email, role: "member", active: true,
      version: await version("timesheet_staff_profiles", profile.staffId), ...patch });
  }

  await t.test("additive standalone schema uses invoker functions and defaults to 15 minutes", async () => {
    const org = await organisation();
    assert.equal((await query<{ increment_minutes: number }>("SELECT increment_minutes FROM organisations WHERE id=$1", [org.id]))[0].increment_minutes, 15);
    const functions = await query<{ proname: string; prosecdef: boolean }>("SELECT proname,prosecdef FROM pg_proc WHERE proname LIKE 'timesheet_%'");
    assert.ok(functions.length >= 6); assert.ok(functions.every(row => !row.prosecdef));
    assert.equal((await query("SELECT * FROM covie_schema_migrations WHERE migration_id='0036'")).length, 1);
    if (!fullSchema) assert.equal((await query("SELECT * FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'staff_roster%'")).length, 0);
    await reject(query("SELECT timesheet_create_organisation($1,$2,'Duplicate','Owner',$3,'UTC')", [org.calendarId, org.owner, org.ownerEmail]), "23505");
    await query("UPDATE calendars SET share_enabled=true WHERE id=$1", [org.calendarId]);
    await reject(query("SELECT timesheet_create_organisation($1,$2,'Shared','Owner',$3,'UTC')", [org.calendarId, org.owner, org.ownerEmail]), "42501");
  });

  await t.test("restricted runtime role can call domain functions without Auth writes or mutable history privileges", { skip: !fullSchema }, async () => {
    const org = await organisation(), member = await person(org);
    const result = await mutate(org, member.userId, "saveEntry", await entryData(org, member.staffId));
    assert.ok(result.ok);
    assert.equal((await asRuntime(() => query<{ current_user: string }>("SELECT current_user")))[0].current_user, "covie_app");
    const [role] = await query<{ rolcanlogin: boolean; rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean; rolreplication: boolean; rolbypassrls: boolean }>(
      "SELECT rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='covie_app'");
    assert.ok(Object.values(role).every(value => value === false));
    await reject(asRuntime(() => query('UPDATE neon_auth."user" SET email=$1 WHERE id=$2', ["forbidden@example.invalid", member.userId])), "42501");
    await reject(asRuntime(() => query('INSERT INTO neon_auth."user"(id,email,"emailVerified") VALUES($1,$2,true)', [randomUUID(), "forbidden@example.invalid"])), "42501");
    await reject(asRuntime(() => query('DELETE FROM neon_auth."user" WHERE id=$1', [member.userId])), "42501");
    for (const table of ["timesheet_entry_revisions", "timesheet_audit"]) {
      await reject(asRuntime(() => query(`DELETE FROM ${table} WHERE organisation_id=$1`, [org.id])), "42501");
      await reject(asRuntime(() => query(`UPDATE ${table} SET actor_user_id=$1 WHERE organisation_id=$2`, [org.owner, org.id])), "42501");
    }
    assert.equal((await query<{ email: string }>('SELECT email FROM neon_auth."user" WHERE id=$1', [member.userId]))[0].email, member.email);
  });

  await t.test("cross-organisation staff, client, project, assignment and entry references are rejected", async () => {
    const a = await organisation(), b = await organisation(), memberA = await person(a), memberB = await person(b), managerA = await person(a, "manager");
    const clientB = await mutate(b, b.owner, "saveClient", { name: "Foreign client", active: true });
    const projectB = await mutate(b, b.owner, "saveProject", { clientId: clientB.id, name: "Foreign project", active: true });
    await reject(mutate(a, a.owner, "saveStaff", { id: memberB.staffId, version: 2, displayName: "Cross tenant", email: memberB.email, role: "member", active: true }), "42501");
    await reject(mutate(a, a.owner, "saveClient", { id: clientB.id, version: 1, name: "Cross tenant", active: true }), "42501");
    await reject(mutate(a, a.owner, "saveProject", { clientId: clientB.id, name: "Cross tenant", active: true }), "23514");
    await reject(assign(a, managerA, memberB), "23514");
    await reject(mutate(a, a.owner, "saveEntry", await entryData(a, memberB.staffId, { reason: "Synthetic correction" })), "42501");
    await reject(mutate(a, memberA.userId, "saveEntry", await entryData(a, memberA.staffId, { clientId: clientB.id, projectId: projectB.id })), "23514");
    const foreignEntry = await mutate(b, memberB.userId, "saveEntry", await entryData(b, memberB.staffId));
    await reject(mutate(a, a.owner, "deleteEntry", { id: foreignEntry.id, version: 1, reason: "Cross tenant" }), "42501");
    await reject(mutate(a, b.owner, "saveSettings", { name: "Cross tenant", timezone: "UTC", incrementMinutes: 15, version: 1 }), "42501");
    await reject(query("INSERT INTO timesheet_manager_assignments(organisation_id,manager_staff_id,staff_id) VALUES($1,$2,$3)", [a.id, managerA.staffId, memberB.staffId]), "23503");
    assert.equal((await query("SELECT * FROM timesheet_entries WHERE organisation_id=$1", [a.id])).length, 0);
  });

  await t.test("members are own-only; managers are assigned-only; owner profiles and linked email remain protected", async () => {
    const org = await organisation(), manager = await person(org, "manager"), assigned = await person(org), outside = await person(org);
    await assign(org, manager, assigned);
    for (const actor of [manager.userId, assigned.userId]) {
      await reject(mutate(org, actor, "saveSettings", { name: "Forbidden", timezone: "UTC", incrementMinutes: 5, version: 1 }), "42501");
      await reject(mutate(org, actor, "saveClient", { name: "Forbidden", active: true }), "42501");
    }
    await reject(mutate(org, manager.userId, "saveStaff", { displayName: "Forbidden", email: "new@example.invalid", role: "member", active: true }), "42501");
    await reject(updateStaff(org, outside, {}, manager.userId), "42501");
    await reject(updateStaff(org, assigned, { role: "manager" }, manager.userId), "42501");
    await reject(updateStaff(org, assigned, {}, assigned.userId), "42501");
    await updateStaff(org, assigned, {}, manager.userId);
    await reject(updateStaff(org, assigned, { email: "different@example.invalid" }), "23514");
    await reject(mutate(org, org.owner, "saveStaff", { id: org.ownerStaff, version: 1, displayName: "Owner", email: org.ownerEmail, role: "member", active: false }), "42501");
    await reject(mutate(org, manager.userId, "saveEntry", await entryData(org, outside.staffId, { reason: "Unassigned" })), "42501");
    await reject(mutate(org, assigned.userId, "saveEntry", await entryData(org, outside.staffId, { reason: "Other member" })), "42501");
    for (const actor of [manager.userId, org.owner]) await reject(mutate(org, actor, "saveEntry", await entryData(org, assigned.staffId, { reason: "x" })), "23514");
    const created = await mutate(org, manager.userId, "saveEntry", await entryData(org, assigned.staffId, { reason: "Entered from approved correction" }));
    await mutate(org, manager.userId, "saveEntry", await entryData(org, manager.staffId));
    await reject(mutate(org, outside.userId, "deleteEntry", { id: created.id, version: 1, reason: "Not mine" }), "42501");
    await assign(org, manager, assigned, false);
    await reject(mutate(org, manager.userId, "deleteEntry", { id: created.id, version: 1, reason: "No longer assigned" }), "42501");
    assert.equal((await query<{ allowed: boolean }>("SELECT timesheet_can_access($1,$2,$3) AS allowed", [org.id, manager.userId, assigned.staffId]))[0].allowed, false);
  });

  await t.test("increments, exact duration, overlap, snapshots and stale versions are enforced transactionally", async () => {
    const org = await organisation();
    for (const increment of [5, 10, 15, 30, 60]) await saveSettings(org, increment);
    await reject(saveSettings(org, 20), "23514");
    await saveSettings(org, 15);
    const original = await entryData(org, org.ownerStaff), created = await mutate(org, org.owner, "saveEntry", original);
    await reject(mutate(org, org.owner, "saveEntry", { ...original, start: "2026-10-08T09:15:00Z", end: "2026-10-08T09:30:00Z" }), "23514");
    const adjacent = await mutate(org, org.owner, "saveEntry", { ...original, start: "2026-10-08T09:22:00Z", end: "2026-10-08T09:37:00Z" });
    for (const patch of [
      { start: "2026-10-08T10:00:00Z", end: "2026-10-08T10:16:00Z" },
      { start: "2026-10-08T10:00:01Z", end: "2026-10-08T10:15:01Z" },
      { start: "2026-10-08T10:00:00.001Z", end: "2026-10-08T10:15:00.001Z" },
      { start: "2026-10-08T10:00:00Z", end: "2026-10-09T10:15:00Z" },
      { start: "2026-10-08T10:00:00Z", end: "2026-10-08T10:00:00Z" },
    ]) await reject(mutate(org, org.owner, "saveEntry", { ...original, ...patch }), "23514");
    await saveSettings(org, 60, "Pacific/Auckland");
    await reject(mutate(org, org.owner, "saveEntry", { ...original, id: created.id, version: 1, notes: "Stale settings" }), "40001");
    const current = await entryData(org, org.ownerStaff, { ...original, expectedOrganisationVersion: await version("organisations", org.id), id: created.id, version: 1, notes: "Notes-only after settings changed" });
    await mutate(org, org.owner, "saveEntry", current);
    const [saved] = await query<{ increment_minutes: number; timezone: string; duration_minutes: number; version: number }>("SELECT increment_minutes,timezone,duration_minutes,version FROM timesheet_entries WHERE id=$1", [created.id]);
    assert.deepEqual(saved, { increment_minutes: 15, timezone: "UTC", duration_minutes: 15, version: 2 });
    await reject(mutate(org, org.owner, "saveEntry", { ...current, notes: "Stale entry" }), "40001");
    await reject(mutate(org, org.owner, "saveEntry", { ...current, version: 2, timezone: "Pacific/Auckland", start: "2026-10-08T11:00:00Z", end: "2026-10-08T11:15:00Z" }), "23514");
    await mutate(org, org.owner, "saveEntry", { ...current, version: 2, timezone: "Pacific/Auckland", start: "2026-10-08T11:00:00Z", end: "2026-10-08T12:00:00Z" });
    assert.equal((await query<{ increment_minutes: number }>("SELECT increment_minutes FROM timesheet_entries WHERE id=$1", [created.id]))[0].increment_minutes, 60);
    await mutate(org, org.owner, "deleteEntry", { id: adjacent.id, version: 1 });
    await reject(mutate(org, org.owner, "deleteEntry", { id: adjacent.id, version: 1 }), "42501");
    const revisions = await query<{ action: string; before_state: Row | null; after_state: Row }>("SELECT action,before_state,after_state FROM timesheet_entry_revisions WHERE entry_id=$1 ORDER BY after_state->>'version'", [created.id]);
    assert.deepEqual(revisions.map(row => row.action), ["create", "update", "update"]);
    assert.equal(revisions[0].before_state, null); assert.equal(revisions[1].before_state?.version, 1); assert.equal(revisions[2].after_state.version, 3);
    assert.equal((await query("SELECT * FROM timesheet_entry_revisions WHERE entry_id=$1 AND action='delete'", [adjacent.id])).length, 1);
    await reject(query("UPDATE timesheet_entry_revisions SET reason='Rewrite history' WHERE entry_id=$1", [created.id]), "42501");
    await reject(query("DELETE FROM timesheet_entry_revisions WHERE entry_id=$1", [created.id]), "42501");
    await reject(query("UPDATE timesheet_audit SET action='Rewrite history' WHERE organisation_id=$1", [org.id]), "42501");
    await reject(query("DELETE FROM timesheet_audit WHERE organisation_id=$1", [org.id]), "42501");
  });

  await t.test("archived clients/projects preserve historical notes edits but cannot be selected for new timing", async () => {
    const org = await organisation(), client = await mutate(org, org.owner, "saveClient", { name: "Client", active: true });
    const other = await mutate(org, org.owner, "saveClient", { name: "Other client", active: true });
    const project = await mutate(org, org.owner, "saveProject", { name: "Project", clientId: client.id, active: true });
    await reject(mutate(org, org.owner, "saveProject", { id: project.id, version: 1, name: "Move project", clientId: other.id, active: true }), "23514");
    await reject(mutate(org, org.owner, "saveEntry", await entryData(org, org.ownerStaff, { clientId: other.id, projectId: project.id })), "23514");
    const data = await entryData(org, org.ownerStaff, { clientId: client.id, projectId: project.id });
    const saved = await mutate(org, org.owner, "saveEntry", data);
    await mutate(org, org.owner, "saveProject", { id: project.id, version: 1, name: "Project", clientId: client.id, active: false });
    await mutate(org, org.owner, "saveClient", { id: client.id, version: 1, name: "Client", active: false });
    await mutate(org, org.owner, "saveEntry", { ...data, id: saved.id, version: 1, notes: "Historical annotation" });
    await reject(mutate(org, org.owner, "saveEntry", { ...data, id: saved.id, version: 2, start: "2026-10-08T10:00:00Z", end: "2026-10-08T10:15:00Z" }), "23514");
    await reject(mutate(org, org.owner, "saveEntry", { ...data, start: "2026-10-08T10:00:00Z", end: "2026-10-08T10:15:00Z" }), "23514");
    await reject(mutate(org, org.owner, "saveClient", { id: client.id, version: 1, name: "Stale", active: true }), "40001");
  });

  await t.test("custom work types enforce owner/tenant scope, versions and stable historical labels", async () => {
    const org = await organisation(), other = await organisation(), member = await person(org), manager = await person(org, "manager");
    for (const actor of [member.userId, manager.userId]) await reject(mutate(org, actor, "saveWorkType", { name: "Forbidden", active: true }), "42501");
    const type = await mutate(org, org.owner, "saveWorkType", { name: "Lunch break", active: true });
    const foreign = await mutate(other, other.owner, "saveWorkType", { name: "Lunch break", active: true });
    await reject(mutate(org, org.owner, "saveWorkType", { name: " lunch BREAK ", active: true }), "23505");
    await reject(mutate(org, org.owner, "saveWorkType", { name: " ", active: true }), "23514");
    await reject(mutate(org, org.owner, "saveWorkType", { id: foreign.id, version: 1, name: "Cross tenant", active: true }), "42501");
    const data = await entryData(org, member.staffId, { workTypeId: type.id, billable: false });
    await reject(mutate(org, member.userId, "saveEntry", { ...data, workTypeId: foreign.id }), "23514");
    const saved = await mutate(org, member.userId, "saveEntry", { ...data, workTypeName: "Forged snapshot" });
    await reject(query("UPDATE timesheet_entries SET work_type_id=$1 WHERE id=$2", [foreign.id, saved.id]), "23503");
    await reject(query("UPDATE timesheet_entries SET work_type_name=NULL WHERE id=$1", [saved.id]), "23514");
    assert.equal((await query<{ work_type_name: string }>("SELECT work_type_name FROM timesheet_entries WHERE id=$1", [saved.id]))[0].work_type_name, "Lunch break");
    await mutate(org, org.owner, "saveWorkType", { id: type.id, version: 1, name: "Meal break", active: true });
    await reject(mutate(org, org.owner, "saveWorkType", { id: type.id, version: 1, name: "Stale", active: true }), "40001");
    await mutate(org, member.userId, "saveEntry", { ...data, id: saved.id, version: 1, notes: "Retains historical label" });
    const freshData = { ...data, start: "2026-10-08T10:00:00Z", end: "2026-10-08T10:15:00Z" };
    const fresh = await mutate(org, member.userId, "saveEntry", freshData);
    assert.equal((await query<{ work_type_name: string }>("SELECT work_type_name FROM timesheet_entries WHERE id=$1", [fresh.id]))[0].work_type_name, "Meal break");
    await mutate(org, org.owner, "saveWorkType", { id: type.id, version: 2, name: "Meal break", active: false });
    await reject(mutate(org, member.userId, "saveEntry", { ...freshData, start: "2026-10-08T11:00:00Z", end: "2026-10-08T11:15:00Z" }), "23514");
    // A correction may retain the existing archived classification and saved label.
    await mutate(org, member.userId, "saveEntry", { ...data, id: saved.id, version: 2, start: "2026-10-08T09:00:00Z", end: "2026-10-08T09:15:00Z" });
    const oldClient: Row = { ...data }; delete oldClient.workTypeId;
    await mutate(org, member.userId, "saveEntry", { ...oldClient, id: saved.id, version: 3, notes: "Older client keeps type" });
    const snapshot = (await query<{ work_type_id: string; work_type_name: string; billable: boolean }>("SELECT work_type_id,work_type_name,billable FROM timesheet_entries WHERE id=$1", [saved.id]))[0];
    assert.deepEqual(snapshot, { work_type_id: type.id, work_type_name: "Lunch break", billable: false });
    await mutate(org, member.userId, "saveEntry", { ...data, workTypeId: null, id: saved.id, version: 4 });
    await reject(mutate(org, member.userId, "saveEntry", { ...data, id: saved.id, version: 5 }), "23514");
    await mutate(org, org.owner, "saveWorkType", { id: type.id, version: 3, name: "Meal break", active: true });
    await mutate(org, member.userId, "saveEntry", { ...data, id: saved.id, version: 5 });
    assert.equal((await query<{ work_type_name: string }>("SELECT work_type_name FROM timesheet_entries WHERE id=$1", [saved.id]))[0].work_type_name, "Meal break");
    const revisions = await query<{ after_state: Row }>("SELECT after_state FROM timesheet_entry_revisions WHERE entry_id=$1 ORDER BY (after_state->>'version')::integer", [saved.id]);
    assert.deepEqual(revisions.map(row => row.after_state.work_type_name), ["Lunch break", "Lunch break", "Lunch break", "Lunch break", null, "Meal break"]);
    if (fullSchema) await reject(asRuntime(() => query("DELETE FROM timesheet_work_types WHERE id=$1", [type.id])), "42501");
    assert.equal((await query("SELECT * FROM timesheet_audit WHERE organisation_id=$1 AND action='saveWorkType'", [org.id])).length, 4);
  });

  await t.test("invitations require the exact verified Auth email; revoked/replaced/expired tokens fail and redemption is idempotent", async () => {
    const org = await organisation(), profile = await staff(org), first = await invitation(org, profile.staffId);
    const wrong = await account(`wrong-${randomUUID()}@example.invalid`), unverified = await account(profile.email, false);
    await reject(redeem(first.tokenHash, wrong), "42501");
    await reject(redeem(first.tokenHash, unverified), "42501");
    await reject(redeem(first.tokenHash, randomUUID()), "42501");
    const replacement = await invitation(org, profile.staffId);
    await query('UPDATE neon_auth."user" SET "emailVerified"=true WHERE id=$1', [unverified]);
    await reject(redeem(first.tokenHash, unverified), "42501");
    await mutate(org, org.owner, "revokeInvite", { id: replacement.id });
    await reject(redeem(replacement.tokenHash, unverified), "42501");
    const expired = await invitation(org, profile.staffId);
    await query("UPDATE timesheet_invitations SET expires_at=now()-interval '1 second' WHERE id=$1", [expired.id]);
    await reject(redeem(expired.tokenHash, unverified), "42501");
    const valid = await invitation(org, profile.staffId);
    assert.equal(await redeem(valid.tokenHash, unverified), org.calendarId);
    assert.equal(await redeem(valid.tokenHash, unverified), org.calendarId);
    assert.equal((await query("SELECT * FROM organisation_memberships WHERE organisation_id=$1 AND user_id=$2", [org.id, unverified])).length, 1);
    assert.equal((await query("SELECT * FROM calendar_memberships WHERE calendar_id=$1 AND user_id=$2", [org.calendarId, unverified])).length, 1);
    assert.equal((await query("SELECT * FROM timesheet_audit WHERE organisation_id=$1 AND action='invitation.accepted'", [org.id])).length, 1);
    await reject(invitation(org, profile.staffId), "23514");
    await reject(redeem(valid.tokenHash, await account(profile.email)), "42501");
    await mutate(org, org.owner, "revokeInvite", { id: valid.id });
    await reject(redeem(valid.tokenHash, unverified), "42501");
  });

  await t.test("manager invitation authority and target profile changes are rechecked at redemption", async () => {
    const org = await organisation(), manager = await person(org, "manager");
    const target = await staff(org), outside = await staff(org), accountId = await account(target.email);
    await reject(invitation(org, target.staffId, manager.userId), "42501");
    await assign(org, manager, target);
    const managerInvite = await invitation(org, target.staffId, manager.userId);
    await assign(org, manager, target, false);
    await reject(redeem(managerInvite.tokenHash, accountId), "42501");
    await assign(org, manager, target);
    const beforeDemotion = await invitation(org, target.staffId, manager.userId);
    await updateStaff(org, manager, { role: "member" });
    await reject(redeem(beforeDemotion.tokenHash, accountId), "42501");
    await assign(org, manager, target, false);
    assert.equal((await query("SELECT * FROM timesheet_manager_assignments WHERE organisation_id=$1 AND manager_staff_id=$2", [org.id, manager.staffId])).length, 0,
      "An owner can clean up an assignment after its manager is demoted.");
    const ownerInvite = await invitation(org, target.staffId);
    await updateStaff(org, target, { email: `changed-${randomUUID()}@example.invalid` });
    await reject(redeem(ownerInvite.tokenHash, accountId), "42501");
    const outsideAccount = await account(outside.email), roleInvite = await invitation(org, outside.staffId);
    await updateStaff(org, outside, { role: "manager" });
    await reject(redeem(roleInvite.tokenHash, outsideAccount), "42501");
    const archiveInvite = await invitation(org, outside.staffId);
    await updateStaff(org, outside, { role: "manager", active: false });
    await reject(redeem(archiveInvite.tokenHash, outsideAccount), "42501");
  });

  await t.test("current calendar and domain membership, active staff and archives all gate access", async () => {
    const org = await organisation(), member = await person(org), target = await staff(org), invite = await invitation(org, target.staffId), targetAccount = await account(target.email);
    const ownData = await entryData(org, member.staffId);
    await query("UPDATE calendar_memberships SET permission='viewer' WHERE calendar_id=$1 AND user_id=$2", [org.calendarId, member.userId]);
    await reject(mutate(org, member.userId, "saveEntry", ownData), "42501");
    await query("UPDATE calendar_memberships SET permission='editor' WHERE calendar_id=$1 AND user_id=$2", [org.calendarId, member.userId]);
    await updateStaff(org, member, { active: false });
    await reject(mutate(org, member.userId, "saveEntry", ownData), "42501");
    await reject(mutate(org, org.owner, "saveEntry", { ...ownData, reason: "Archived member" }), "23514");
    await query("UPDATE organisations SET archived_at=now() WHERE id=$1", [org.id]);
    await reject(mutate(org, org.owner, "saveClient", { name: "Archived organisation", active: true }), "42501");
    await reject(redeem(invite.tokenHash, targetAccount), "42501");
    await query("UPDATE organisations SET archived_at=NULL WHERE id=$1", [org.id]);
    await query("UPDATE calendars SET archived_at=now() WHERE id=$1", [org.calendarId]);
    await reject(mutate(org, org.owner, "saveClient", { name: "Archived calendar", active: true }), "42501");
    await reject(redeem(invite.tokenHash, targetAccount), "42501");
  });
});
