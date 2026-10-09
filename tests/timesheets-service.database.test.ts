import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  exportTimesheetsCsv, loadTimesheets, loadTimesheetsHistory, mutateTimesheets,
  redeemTimesheetsInvitation, timesheetsErrorResponse, TimesheetsError,
  type TimesheetsSession, type TimesheetsSql,
} from "../lib/timesheets/service";

/** Actual service functions with a parameterized pg tag, never a production URL. */
const nativeUrl = process.env.COVIE_TIMESHEETS_TEST_DATABASE_URL;
const tooling = process.env.COVIE_SQL_TOOLING;
const embedded = process.env.COVIE_TIMESHEETS_EMBEDDED === "1";
type Row = Record<string, unknown>;
type Client = { connect(): Promise<void>; end(): Promise<void>; query<T = Row>(sql: string, parameters?: unknown[]): Promise<{ rows: T[] }> };
type Organisation = { id: string; ownerStaff: string; owner: TimesheetsSession };
type Person = { staffId: string; session: TimesheetsSession; token: string };

test(`Timesheets actual service projections and preprocessing on restricted ${embedded ? "embedded PostgreSQL (not native concurrency)" : "native runtime"}`, { skip: !tooling || (!nativeUrl && !embedded), timeout: 60_000 }, async t => {
  assert.equal(process.env.APP_DATABASE_URL, undefined); assert.equal(process.env.DATABASE_URL, undefined);
  let observer: Client, runtime: Client;
  if (embedded) {
    assert.equal(nativeUrl, undefined, "Embedded service checks must not use any network URL.");
    const { PGlite } = createRequire(resolve(tooling!, "package.json"))("@electric-sql/pglite") as { PGlite: new () => { exec(sql: string): Promise<unknown>; query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>; close(): Promise<void> } };
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`CREATE TYPE calendar_type AS ENUM ('co_parenting','staff_rosters');
      CREATE TABLE calendars(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,calendar_type calendar_type NOT NULL,timezone text NOT NULL DEFAULT 'UTC',share_enabled boolean NOT NULL DEFAULT false,archived_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE calendar_memberships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),calendar_id uuid NOT NULL REFERENCES calendars(id),user_id uuid NOT NULL,permission text NOT NULL CHECK(permission IN('owner','editor','viewer')),UNIQUE(calendar_id,user_id));
      CREATE TABLE covie_schema_migrations(migration_id text PRIMARY KEY,description text NOT NULL,baseline boolean NOT NULL);
      CREATE SCHEMA neon_auth; CREATE TABLE neon_auth."user"(id uuid PRIMARY KEY,name text,email text NOT NULL,"emailVerified" boolean NOT NULL DEFAULT false);`);
    for (const file of ["drizzle/0036_timesheets.sql", "tests/fixtures/timesheets-pre-work-types.sql", "drizzle/0037_timesheet_work_types.sql"]) await db.exec(await readFile(resolve(file), "utf8"));
    await db.exec(`CREATE ROLE covie_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public,neon_auth TO covie_app;
      GRANT SELECT,INSERT,UPDATE,DELETE ON calendars,calendar_memberships TO covie_app;
      GRANT SELECT(id,name,email,"emailVerified") ON neon_auth."user" TO covie_app;`);
    for (const file of ["docs/releases/timesheets-permissions.sql", "docs/releases/timesheets-work-types-permissions.sql"]) await db.exec(await readFile(resolve(file), "utf8"));
    // Embedded checks are sequential. Per-query roles model runtime rights; this
    // deliberately makes no claim about independent-connection transactions.
    observer = { connect: async () => {}, end: async () => {}, query: async (statement, params) => { await db.exec("RESET ROLE"); return db.query(statement, params); } };
    runtime = { connect: async () => {}, end: async () => {}, query: async (statement, params) => { await db.exec("SET ROLE covie_app"); try { return await db.query(statement, params); } finally { await db.exec("RESET ROLE"); } } };
  } else {
    const url = new URL(nativeUrl!);
    assert.ok(url.protocol === "postgresql:" || url.protocol === "postgres:");
    assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55436");
    assert.equal(url.pathname, "/timesheets_test"); assert.equal(url.username, "timesheets_test");
    assert.equal(url.password, ""); assert.equal(url.search, ""); assert.equal(url.hash, "");
    const { Client: PgClient } = createRequire(resolve(tooling!, "package.json"))("pg") as { Client: new (options: { connectionString: string }) => Client };
    observer = new PgClient({ connectionString: nativeUrl! }); runtime = new PgClient({ connectionString: nativeUrl! });
    await observer.connect(); await runtime.connect();
    t.after(async () => { await runtime.end(); await observer.end(); });
    await runtime.query("SET ROLE covie_app; SET statement_timeout='10s'");
  }
  const statements: string[] = [];
  function tag(before?: (statement: string, parameters: unknown[]) => Promise<void>) {
    return (async (strings: TemplateStringsArray, ...parameters: unknown[]) => {
      const statement = strings.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, "");
      statements.push(statement);
      if (before) await before(statement, parameters);
      return (await runtime.query(statement, parameters)).rows;
    }) as unknown as TimesheetsSql;
  }
  const sql = tag();
  async function session(calendarId: string, userId: string, email: string): Promise<TimesheetsSession> {
    const [{ id, permission }] = (await observer.query<{ id: string; permission: "owner" | "editor" }>("SELECT id,permission FROM calendar_memberships WHERE calendar_id=$1 AND user_id=$2", [calendarId, userId])).rows;
    return { membershipId: id, calendarId, calendarName: "Synthetic service", calendarType: "timesheets", calendarTimezone: "UTC", participantId: null,
      permission, displayName: null, colorKey: null, profileSlot: null, userId, userName: "Synthetic account", userEmail: email };
  }
  async function account(email: string) {
    const id = randomUUID();
    await observer.query('INSERT INTO neon_auth."user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Synthetic account", email]);
    return id;
  }
  async function organisation(): Promise<Organisation> {
    const calendarId = randomUUID(), email = `owner-${randomUUID()}@example.invalid`, userId = await account(email);
    await observer.query("INSERT INTO calendars(id,name,calendar_type,timezone) VALUES($1,'Synthetic service','timesheets','UTC')", [calendarId]);
    await observer.query("INSERT INTO calendar_memberships(calendar_id,user_id,permission) VALUES($1,$2,'owner')", [calendarId, userId]);
    const [{ id }] = (await runtime.query<{ id: string }>("SELECT timesheet_create_organisation($1,$2,'Synthetic service','Owner',$3,'UTC') AS id", [calendarId, userId, email])).rows;
    const [{ id: ownerStaff }] = (await observer.query<{ id: string }>("SELECT id FROM timesheet_staff_profiles WHERE organisation_id=$1", [id])).rows;
    return { id, ownerStaff, owner: await session(calendarId, userId, email) };
  }
  async function person(org: Organisation, role: "manager" | "member" = "member", displayName = "Synthetic member"): Promise<Person> {
    const email = `person-${randomUUID()}@example.invalid`, userId = await account(email);
    const profile = await mutateTimesheets(org.owner, { action: "saveStaff", data: { displayName, email, role, active: true } }, sql);
    const invite = await mutateTimesheets(org.owner, { action: "createInvite", data: { staffId: profile.id! } }, sql);
    assert.match(invite.invitationUrl!, /^\/timesheets\/invite\/[A-Za-z0-9_-]{43}$/);
    const token = invite.invitationUrl!.split("/").at(-1)!;
    const [{ token_hash }] = (await observer.query<{ token_hash: string }>("SELECT token_hash FROM timesheet_invitations WHERE id=$1", [invite.id])).rows;
    assert.equal(token_hash, createHash("sha256").update(token).digest("hex"));
    assert.equal(await redeemTimesheetsInvitation(token, userId, sql), org.owner.calendarId);
    assert.equal(await redeemTimesheetsInvitation(token, userId, sql), org.owner.calendarId);
    return { staffId: profile.id!, session: await session(org.owner.calendarId, userId, email), token };
  }
  const saveEntry = (staffId: string, patch: Row = {}) => ({ action: "saveEntry", data: {
    staffId, clientId: null, projectId: null, startLocal: "2026-10-12T09:07", endLocal: "2026-10-12T09:22",
    notes: "Synthetic service work", billable: false, organisationVersion: 1, ...patch,
  } });
  function assertNoInternals(value: unknown, secretValues: string[] = []) {
    const json = JSON.stringify(value);
    assert.doesNotMatch(json, /"(?:token_hash|tokenHash|user_id|userId|actor_user_id|created_by_user_id|updated_by_user_id|membership_id|deleted_at|organisation_id)"/);
    for (const secret of secretValues) assert.ok(!json.includes(secret));
  }

  await t.test("runtime work-type grants exclude deletion, truncation and privilege delegation", async () => {
    const [permissions] = (await runtime.query<{ selected: boolean; inserted: boolean; updated: boolean; deleted: boolean; truncated: boolean; grantable: boolean }>(`SELECT
      has_table_privilege('covie_app','timesheet_work_types','SELECT') AS selected,
      has_table_privilege('covie_app','timesheet_work_types','INSERT') AS inserted,
      has_table_privilege('covie_app','timesheet_work_types','UPDATE') AS updated,
      has_table_privilege('covie_app','timesheet_work_types','DELETE') AS deleted,
      has_table_privilege('covie_app','timesheet_work_types','TRUNCATE') AS truncated,
      has_table_privilege('covie_app','timesheet_work_types','UPDATE WITH GRANT OPTION') AS grantable`)).rows;
    assert.deepEqual(permissions, { selected: true, inserted: true, updated: true, deleted: false, truncated: false, grantable: false });
  });

  await t.test("pre-0037 entries and immutable revision JSON remain readable and editable", async () => {
    const owner = await session("37000000-0000-4000-8000-000000000002", "37000000-0000-4000-8000-000000000001", "legacy-work-type@example.invalid");
    const before = await loadTimesheets(owner, "2026-10-12", "day", sql);
    assert.equal(before.entries.length, 1); assert.deepEqual(before.workTypes, []);
    assert.equal(before.entries[0].workTypeId, null); assert.equal(before.entries[0].workTypeName, null);
    const oldJson = (await observer.query<{ after_state: Row }>("SELECT after_state FROM timesheet_entry_revisions WHERE entry_id=$1", [before.entries[0].id])).rows[0].after_state;
    assert.equal(Object.hasOwn(oldJson, "work_type_id"), false); assert.equal(Object.hasOwn(oldJson, "work_type_name"), false);
    const history = await loadTimesheetsHistory(owner, before.entries[0].id, sql);
    assert.equal(history[0].after?.workTypeId, null); assert.equal(history[0].after?.workTypeName, null);
    assert.ok(exportTimesheetsCsv(before).includes("Saved before custom work types"));
    await mutateTimesheets(owner, saveEntry(before.ownStaffId!, { id: before.entries[0].id, version: 1, startLocal: "2026-10-12T09:00", endLocal: "2026-10-12T09:15", notes: "Historical edit" }), sql);
    const after = await loadTimesheets(owner, "2026-10-12", "day", sql);
    assert.equal(after.entries[0].workTypeId, null); assert.equal(after.entries[0].workTypeName, null);
    assert.deepEqual((await observer.query<{ after_state: Row }>("SELECT after_state FROM timesheet_entry_revisions WHERE entry_id=$1 AND action='create'", [before.entries[0].id])).rows[0].after_state, oldJson);
  });

  await t.test("actual work type service preserves historical labels in reads, CSV and revisions", async () => {
    const org = await organisation(), other = await organisation(), staff = await person(org);
    const created = await mutateTimesheets(org.owner, { action: "saveWorkType", data: { name: "=Lunch break", active: true } }, sql);
    await mutateTimesheets(other.owner, { action: "saveWorkType", data: { name: "Private other business", active: true } }, sql);
    await assert.rejects(mutateTimesheets(staff.session, { action: "saveWorkType", data: { name: "Denied", active: true } }, sql), error => timesheetsErrorResponse(error).status === 403);
    const saved = await mutateTimesheets(staff.session, saveEntry(staff.staffId, { workTypeId: created.id }), sql);
    await mutateTimesheets(org.owner, { action: "saveWorkType", data: { id: created.id, version: 1, name: "Meal break", active: false } }, sql);
    const data = await loadTimesheets(staff.session, "2026-10-12", "day", sql);
    assert.deepEqual(data.workTypes, [{ id: created.id, name: "Meal break", active: false, version: 2 }]);
    assert.equal(data.entries[0].workTypeName, "=Lunch break"); assert.equal(data.entries[0].workTypeId, created.id);
    const csv = exportTimesheetsCsv(data);
    assert.ok(csv.includes('"Work type"')); assert.ok(csv.includes("'=Lunch break")); assert.ok(!csv.includes("Meal break"));
    await mutateTimesheets(staff.session, saveEntry(staff.staffId, { id: saved.id, version: 1, notes: "Older browser preserves classification" }), sql);
    const history = await loadTimesheetsHistory(staff.session, saved.id!, sql);
    assert.equal(history.length, 2); assert.equal(history[1].after?.workTypeName, "=Lunch break");
    assertNoInternals(data);
  });

  await t.test("read, invitation, CSV and history projections share exact tenant/staff scope", async () => {
    const org = await organisation(), foreign = await organisation();
    const manager = await person(org, "manager", "Synthetic manager"), assigned = await person(org, "member", "=Assigned member"), outside = await person(org, "member", "Outside member");
    await mutateTimesheets(org.owner, { action: "assignManager", data: { managerStaffId: manager.staffId, staffId: assigned.staffId, assigned: true } }, sql);
    const client = await mutateTimesheets(org.owner, { action: "saveClient", data: { name: "=Client formula", active: true } }, sql);
    const project = await mutateTimesheets(org.owner, { action: "saveProject", data: { name: "Project, quoted", clientId: client.id, active: true } }, sql);
    const block = await mutateTimesheets(assigned.session, saveEntry(assigned.staffId, { clientId: client.id, projectId: project.id, startLocal: "2026-10-11T23:52", endLocal: "2026-10-12T00:07", notes: "=1+1", billable: true }), sql);
    const managerBlock = await mutateTimesheets(manager.session, saveEntry(manager.staffId, { notes: "Manager own note" }), sql);
    await mutateTimesheets(outside.session, saveEntry(outside.staffId, { notes: "OUTSIDE PRIVATE" }), sql);
    const foreignBlock = await mutateTimesheets(foreign.owner, saveEntry(foreign.ownerStaff, { notes: "FOREIGN PRIVATE" }), sql);
    const data = await loadTimesheets(manager.session, "2026-10-12", "week", sql);
    assert.deepEqual(data.staff.map(row => row.id).sort(), [manager.staffId, assigned.staffId].sort());
    assert.deepEqual(data.entries.map(row => row.id).sort(), [block.id, managerBlock.id].sort());
    assert.ok(data.invitations.every(invite => invite.staffId === assigned.staffId));
    assert.deepEqual(data.totals.find(row => row.staffId === assigned.staffId), { staffId: assigned.staffId, totalMinutes: 7, billableMinutes: 7 });
    assertNoInternals(data, [assigned.token, manager.token, outside.token, outside.session.userId, foreign.owner.userId, "OUTSIDE PRIVATE", "FOREIGN PRIVATE"]);
    const csv = exportTimesheetsCsv(data);
    assert.match(csv, /"'=Assigned member","'=Client formula","Project, quoted"/);
    assert.match(csv, /"15","7","7","'=1\+1"/);
    assert.doesNotMatch(csv, /OUTSIDE PRIVATE|FOREIGN PRIVATE/);
    const memberData = await loadTimesheets(assigned.session, "2026-10-12", "day", sql);
    assert.deepEqual(memberData.staff.map(row => row.id), [assigned.staffId]);
    assert.deepEqual(memberData.entries.map(row => row.id), [block.id]);
    assert.deepEqual(memberData.invitations, []);
    await mutateTimesheets(manager.session, saveEntry(assigned.staffId, { id: block.id, version: 1, clientId: client.id, projectId: project.id,
      startLocal: "2026-10-11T23:52", endLocal: "2026-10-12T00:07", notes: "Corrected annotation", billable: true, reason: "Member requested clarification" }), sql);
    const history = await loadTimesheetsHistory(assigned.session, block.id!, sql);
    assert.deepEqual(history.map(row => row.action), ["create", "update"]);
    assert.equal(history[1].actorName, "Synthetic manager"); assert.equal(history[1].ownActor, false);
    assert.equal(history[1].reason, "Member requested clarification");
    assertNoInternals(history, [manager.session.userId, assigned.session.userId]);
    assert.deepEqual(await loadTimesheetsHistory(outside.session, block.id!, sql), []);
    assert.deepEqual(await loadTimesheetsHistory(org.owner, foreignBlock.id!, sql), []);
    await assert.rejects(loadTimesheets({ ...org.owner, calendarId: foreign.owner.calendarId }, "2026-10-12", "day", sql), error => error instanceof TimesheetsError && error.status === 403);
    await mutateTimesheets(assigned.session, { action: "deleteEntry", data: { id: block.id, version: 2 } }, sql);
    assert.deepEqual((await loadTimesheets(assigned.session, "2026-10-12", "day", sql)).entries, []);
    assert.deepEqual((await loadTimesheetsHistory(assigned.session, block.id!, sql)).map(row => row.action), ["create", "update", "delete"]);
  });

  await t.test("loaded organisation version is rejected before stale local-time interpretation; unchanged historical timing remains editable", async () => {
    const org = await organisation();
    await mutateTimesheets(org.owner, { action: "saveSettings", data: { name: "Changed timezone", timezone: "America/New_York", incrementMinutes: 30, version: 1 } }, sql);
    const stale = saveEntry(org.ownerStaff, { startLocal: "2026-03-08T02:30", endLocal: "2026-03-08T02:45" });
    statements.length = 0;
    await assert.rejects(mutateTimesheets(org.owner, stale, sql), error => error instanceof TimesheetsError && error.status === 409);
    assert.equal(statements.filter(statement => /timesheet_mutate/.test(statement)).length, 0, "Do not issue a write for a stale editor.");
    await assert.rejects(mutateTimesheets(org.owner, { ...stale, data: { ...stale.data, organisationVersion: 2 } }, sql), /does not exist/);
    const saved = await mutateTimesheets(org.owner, saveEntry(org.ownerStaff, { startLocal: "2026-03-08T03:00", endLocal: "2026-03-08T03:30", organisationVersion: 2 }), sql);
    await mutateTimesheets(org.owner, { action: "saveSettings", data: { name: "New increments", timezone: "UTC", incrementMinutes: 60, version: 2 } }, sql);
    await mutateTimesheets(org.owner, saveEntry(org.ownerStaff, { id: saved.id, version: 1, startLocal: "2026-03-08T07:00", endLocal: "2026-03-08T07:30", organisationVersion: 3, notes: "Historical note update" }), sql);
    const data = await loadTimesheets(org.owner, "2026-03-08", "day", sql);
    assert.equal(data.entries[0].timezone, "America/New_York"); assert.equal(data.entries[0].incrementMinutes, 30);
    assert.equal(data.entries[0].durationMinutes, 30); assert.equal(data.entries[0].version, 2);
    await assert.rejects(mutateTimesheets(org.owner, saveEntry(org.ownerStaff, { id: saved.id, version: 2, startLocal: "2026-03-08T07:01", endLocal: "2026-03-08T07:31", organisationVersion: 3 }), sql), /exact multiple of 60/);
  });

  await t.test("service read snapshots discard concurrent revocation and reflect manager assignment removal", async () => {
    const org = await organisation(), manager = await person(org, "manager"), assigned = await person(org);
    await mutateTimesheets(org.owner, { action: "assignManager", data: { managerStaffId: manager.staffId, staffId: assigned.staffId, assigned: true } }, sql);
    await mutateTimesheets(assigned.session, saveEntry(assigned.staffId, { notes: "ASSIGNED PRIVATE" }), sql);
    let removed = false;
    const reassignedSql = tag(async statement => {
      if (!removed && statement.includes("WITH permitted")) {
        removed = true;
        await observer.query("SELECT timesheet_mutate($1,$2,'assignManager',$3::jsonb)", [org.owner.calendarId, org.owner.userId,
          JSON.stringify({ managerStaffId: manager.staffId, staffId: assigned.staffId, assigned: false })]);
      }
    });
    const data = await loadTimesheets(manager.session, "2026-10-12", "day", reassignedSql);
    assert.deepEqual(data.entries, []); assert.doesNotMatch(JSON.stringify(data), /ASSIGNED PRIVATE/);
    let revoked = false;
    const revokedSql = tag(async statement => {
      if (!revoked && statement.includes("WITH permitted")) {
        revoked = true;
        await observer.query("UPDATE calendar_memberships SET permission='viewer' WHERE calendar_id=$1 AND user_id=$2", [org.owner.calendarId, assigned.session.userId]);
      }
    });
    await assert.rejects(loadTimesheets(assigned.session, "2026-10-12", "day", revokedSql), error => error instanceof TimesheetsError && error.status === 409);
  });

  await t.test("a setting change between preprocessing and SQL mutation still returns conflict and writes nothing", async () => {
    const org = await organisation(); let changed = false;
    const racingSql = tag(async statement => {
      if (!changed && statement.includes("SELECT timesheet_mutate")) {
        changed = true;
        await observer.query("SELECT timesheet_mutate($1,$2,'saveSettings',$3::jsonb)", [org.owner.calendarId, org.owner.userId,
          JSON.stringify({ name: "Concurrent settings", timezone: "UTC", incrementMinutes: 30, version: 1 })]);
      }
    });
    await assert.rejects(mutateTimesheets(org.owner, saveEntry(org.ownerStaff), racingSql), error => timesheetsErrorResponse(error).status === 409);
    assert.equal((await observer.query("SELECT * FROM timesheet_entries WHERE organisation_id=$1", [org.id])).rows.length, 0);
  });

  await t.test("actual query envelopes retain midnight-backward overlaps and exclude next-date-only candidates", async () => {
    const org = await organisation();
    await mutateTimesheets(org.owner, { action: "saveSettings", data: { name: "Historical timezone", timezone: "America/St_Johns", incrementMinutes: 5, version: 1 } }, sql);
    // 23:45 repeats as the clock crosses midnight backwards in this historical zone.
    await mutateTimesheets(org.owner, saveEntry(org.ownerStaff, { startLocal: "1988-10-29T23:45", endLocal: "1988-10-30T00:00", startDisambiguation: "later", endDisambiguation: "later", organisationVersion: 2 }), sql);
    const day = await loadTimesheets(org.owner, "1988-10-29", "day", sql);
    assert.equal(day.entries.length, 1); assert.equal(day.totals[0].totalMinutes, 15);
    const next = await loadTimesheets(org.owner, "1988-10-30", "day", sql);
    assert.equal(next.entries.length, 0); assert.deepEqual(next.totals, []);
  });
});
