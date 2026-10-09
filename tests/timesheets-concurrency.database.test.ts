import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

/** Native, isolated loopback only. Run after timesheets.database.test.ts in the
 * fresh cluster created by scripts/test-timesheets-native.sh. These are real
 * overlapping transactions on independent PostgreSQL connections. */
const nativeUrl = process.env.COVIE_TIMESHEETS_TEST_DATABASE_URL;
const tooling = process.env.COVIE_SQL_TOOLING;
type Row = Record<string, unknown>;
type Client = {
  connect(): Promise<void>; query<T = Row>(sql: string, parameters?: unknown[]): Promise<{ rows: T[] }>;
  end(): Promise<void>;
};
type Organisation = { id: string; calendarId: string; owner: string; ownerStaff: string };
type Person = { staffId: string; userId: string; email: string };
type Result = { ok: true; id: string };

test("Timesheets native PostgreSQL concurrency and revocation ordering", { skip: !nativeUrl || !tooling, timeout: 90_000 }, async t => {
  const url = new URL(nativeUrl!);
  assert.ok(url.protocol === "postgresql:" || url.protocol === "postgres:");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55436");
  assert.equal(url.pathname, "/timesheets_test"); assert.equal(url.username, "timesheets_test");
  assert.equal(url.password, ""); assert.equal(url.search, ""); assert.equal(url.hash, "");
  const { Client: PgClient } = createRequire(resolve(tooling!, "package.json"))("pg") as {
    Client: new (options: { connectionString: string; application_name: string }) => Client;
  };
  const observer = new PgClient({ connectionString: nativeUrl!, application_name: "timesheets-test-observer" });
  const first = new PgClient({ connectionString: nativeUrl!, application_name: "timesheets-test-first" });
  const second = new PgClient({ connectionString: nativeUrl!, application_name: "timesheets-test-second" });
  const clients = [observer, first, second];
  await Promise.all(clients.map(client => client.connect()));
  t.after(async () => {
    await Promise.all(clients.map(async client => { await client.query("ROLLBACK").catch(() => undefined); await client.end(); }));
  });
  await Promise.all(clients.map(client => client.query("SET statement_timeout='10s'; SET lock_timeout='8s'")));
  if (process.env.COVIE_TIMESHEETS_FULL_SCHEMA === "1") {
    await first.query("SET ROLE covie_app");
    await second.query("SET ROLE covie_app");
  }
  t.afterEach(async () => {
    // A failed assertion must not leave the winner's transaction holding locks
    // across later scenarios. Release it before draining the waiting connection.
    await first.query("ROLLBACK");
    await second.query("ROLLBACK");
  });
  assert.equal((await observer.query("SELECT migration_id FROM covie_schema_migrations WHERE migration_id='0036'")).rows.length, 1,
    "Run the synthetic semantic fixture/migration suite first in this fresh cluster.");
  const firstPid = (await first.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  const secondPid = (await second.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  async function blockedByFirst() {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [{ blockers }] = (await observer.query<{ blockers: number[] }>("SELECT pg_blocking_pids($1) AS blockers", [secondPid])).rows;
      if (blockers.includes(firstPid)) return;
      await delay(20);
    }
    assert.fail("The second connection did not demonstrably wait on the first transaction's lock.");
  }
  const outcome = <T>(promise: Promise<T>) => promise.then(value => ({ value, error: null }), (error: unknown) => ({ value: null, error: error as { code?: string } }));
  const mutate = async (client: Client, org: Organisation, actor: string, action: string, data: Row) =>
    (await client.query<{ result: Result }>("SELECT timesheet_mutate($1::uuid,$2::uuid,$3,$4::jsonb) AS result", [org.calendarId, actor, action, JSON.stringify(data)])).rows[0].result;
  const redeem = async (client: Client, token: string, actor: string) =>
    (await client.query<{ calendar_id: string }>("SELECT timesheet_redeem_invitation($1,$2::uuid) AS calendar_id", [token, actor])).rows[0].calendar_id;
  async function organisation(): Promise<Organisation> {
    const calendarId = randomUUID(), owner = randomUUID(), email = `owner-${randomUUID()}@example.invalid`;
    await observer.query('INSERT INTO neon_auth."user"(id,email,"emailVerified") VALUES($1,$2,true)', [owner, email]);
    await observer.query("INSERT INTO calendars(id,name,calendar_type) VALUES($1,'Synthetic concurrency','timesheets')", [calendarId]);
    await observer.query("INSERT INTO calendar_memberships(calendar_id,user_id,permission) VALUES($1,$2,'owner')", [calendarId, owner]);
    const [{ id }] = (await observer.query<{ id: string }>("SELECT timesheet_create_organisation($1,$2,'Synthetic concurrency','Owner',$3,'UTC') AS id", [calendarId, owner, email])).rows;
    const [{ id: ownerStaff }] = (await observer.query<{ id: string }>("SELECT id FROM timesheet_staff_profiles WHERE organisation_id=$1", [id])).rows;
    return { id, calendarId, owner, ownerStaff };
  }
  async function invite(org: Organisation) {
    const email = `member-${randomUUID()}@example.invalid`, userId = randomUUID();
    await observer.query('INSERT INTO neon_auth."user"(id,email,"emailVerified") VALUES($1,$2,true)', [userId, email]);
    const profile = await mutate(observer, org, org.owner, "saveStaff", { displayName: "Synthetic member", email, role: "member", active: true });
    const tokenHash = createHash("sha256").update(`synthetic:${randomUUID()}`).digest("hex");
    const invitation = await mutate(observer, org, org.owner, "createInvite", { staffId: profile.id, tokenHash });
    return { staffId: profile.id, userId, email, tokenHash, invitationId: invitation.id };
  }
  async function person(org: Organisation): Promise<Person> {
    const invited = await invite(org);
    await redeem(observer, invited.tokenHash, invited.userId);
    return invited;
  }
  function entry(org: Organisation, patch: Row = {}) {
    return { staffId: org.ownerStaff, clientId: null, projectId: null, start: "2026-10-08T09:07:00Z", end: "2026-10-08T09:22:00Z",
      timezone: "UTC", notes: "Synthetic race", billable: false, expectedOrganisationVersion: 1, ...patch };
  }

  await t.test("work type rename and archival serialize with entry saves and stale owner updates", async () => {
    const org = await organisation();
    const type = await mutate(observer, org, org.owner, "saveWorkType", { name: "Meetings", active: true });
    await first.query("BEGIN");
    await mutate(first, org, org.owner, "saveWorkType", { id: type.id, version: 1, name: "Team meetings", active: true });
    const create = outcome(mutate(second, org, org.owner, "saveEntry", entry(org, { workTypeId: type.id })));
    await blockedByFirst(); await first.query("COMMIT");
    const created = await create; assert.equal(created.error, null);
    assert.equal((await observer.query<{ work_type_name: string }>("SELECT work_type_name FROM timesheet_entries WHERE id=$1", [created.value!.id])).rows[0].work_type_name, "Team meetings");
    await first.query("BEGIN");
    await mutate(first, org, org.owner, "saveWorkType", { id: type.id, version: 2, name: "Team meetings", active: false });
    const pending = outcome(mutate(second, org, org.owner, "saveEntry", entry(org, { workTypeId: type.id, start: "2026-10-08T10:00:00Z", end: "2026-10-08T10:15:00Z" })));
    await blockedByFirst(); await first.query("COMMIT");
    assert.equal((await pending).error?.code, "23514");
    await first.query("BEGIN");
    await mutate(first, org, org.owner, "saveWorkType", { id: type.id, version: 3, name: "Meetings", active: true });
    const stale = outcome(mutate(second, org, org.owner, "saveWorkType", { id: type.id, version: 3, name: "Lost update", active: false }));
    await blockedByFirst(); await first.query("COMMIT");
    assert.equal((await stale).error?.code, "40001");
  });

  await t.test("same-token simultaneous redemption has one membership and an idempotent same-account retry", async () => {
    const org = await organisation(), invited = await invite(org);
    await first.query("BEGIN");
    assert.equal(await redeem(first, invited.tokenHash, invited.userId), org.calendarId);
    const pending = outcome(redeem(second, invited.tokenHash, invited.userId));
    await blockedByFirst();
    await first.query("COMMIT");
    const result = await pending;
    assert.equal(result.error, null); assert.equal(result.value, org.calendarId);
    assert.equal((await observer.query("SELECT * FROM organisation_memberships WHERE organisation_id=$1 AND user_id=$2", [org.id, invited.userId])).rows.length, 1);
    assert.equal((await observer.query("SELECT * FROM timesheet_audit WHERE organisation_id=$1 AND action='invitation.accepted'", [org.id])).rows.length, 1);
  });

  await t.test("same-token different accounts cannot both acquire the staff identity", async () => {
    const org = await organisation(), invited = await invite(org), differentUser = randomUUID();
    // Deliberately stronger than normal Auth uniqueness: even matching verified
    // emails on two synthetic IDs cannot bind one invite to both accounts.
    await observer.query('INSERT INTO neon_auth."user"(id,email,"emailVerified") VALUES($1,$2,true)', [differentUser, invited.email]);
    await first.query("BEGIN"); await redeem(first, invited.tokenHash, invited.userId);
    const pending = outcome(redeem(second, invited.tokenHash, differentUser));
    await blockedByFirst(); await first.query("COMMIT");
    assert.equal((await pending).error?.code, "42501");
    assert.equal((await observer.query("SELECT * FROM organisation_memberships WHERE organisation_id=$1 AND user_id=$2", [org.id, differentUser])).rows.length, 0);
  });

  await t.test("overlapping concurrent inserts serialize and stale concurrent updates cannot overwrite", async () => {
    const org = await organisation(), data = entry(org);
    await first.query("BEGIN"); const created = await mutate(first, org, org.owner, "saveEntry", data);
    const collision = outcome(mutate(second, org, org.owner, "saveEntry", { ...data, start: "2026-10-08T09:15:00Z", end: "2026-10-08T09:30:00Z" }));
    await blockedByFirst(); await first.query("COMMIT");
    assert.equal((await collision).error?.code, "23514");
    assert.equal((await observer.query("SELECT * FROM timesheet_entries WHERE organisation_id=$1", [org.id])).rows.length, 1);
    await first.query("BEGIN");
    await mutate(first, org, org.owner, "saveEntry", { ...data, id: created.id, version: 1, notes: "Winning update" });
    const stale = outcome(mutate(second, org, org.owner, "saveEntry", { ...data, id: created.id, version: 1, notes: "Must not overwrite" }));
    await blockedByFirst(); await first.query("COMMIT");
    assert.equal((await stale).error?.code, "40001");
    assert.deepEqual((await observer.query("SELECT version,notes FROM timesheet_entries WHERE id=$1", [created.id])).rows[0], { version: 2, notes: "Winning update" });
    assert.equal((await observer.query("SELECT * FROM timesheet_entry_revisions WHERE entry_id=$1", [created.id])).rows.length, 2);
  });

  await t.test("invitation revocation and redemption observe the winning transaction in both orders", async () => {
    const org = await organisation(), revoked = await invite(org);
    await first.query("BEGIN"); await mutate(first, org, org.owner, "revokeInvite", { id: revoked.invitationId });
    const rejected = outcome(redeem(second, revoked.tokenHash, revoked.userId));
    await blockedByFirst(); await first.query("COMMIT");
    assert.equal((await rejected).error?.code, "42501");
    assert.equal((await observer.query("SELECT * FROM organisation_memberships WHERE organisation_id=$1 AND user_id=$2", [org.id, revoked.userId])).rows.length, 0);
    const accepted = await invite(org);
    await first.query("BEGIN"); await redeem(first, accepted.tokenHash, accepted.userId);
    const revokeAfter = outcome(mutate(second, org, org.owner, "revokeInvite", { id: accepted.invitationId }));
    await blockedByFirst(); await first.query("COMMIT");
    assert.equal((await revokeAfter).error, null);
    assert.equal((await observer.query("SELECT * FROM organisation_memberships WHERE organisation_id=$1 AND user_id=$2", [org.id, accepted.userId])).rows.length, 1);
    assert.equal((await outcome(redeem(observer, accepted.tokenHash, accepted.userId))).error?.code, "42501");
  });

  await t.test("core membership revocation wins before a waiting entry mutation and queues behind an earlier one", async () => {
    const org = await organisation(), member = await person(org), data = entry(org, { staffId: member.staffId });
    await first.query("BEGIN");
    await first.query("UPDATE calendar_memberships SET permission='viewer' WHERE calendar_id=$1 AND user_id=$2", [org.calendarId, member.userId]);
    const denied = outcome(mutate(second, org, member.userId, "saveEntry", data));
    await blockedByFirst(); await first.query("COMMIT");
    assert.equal((await denied).error?.code, "42501");
    assert.equal((await observer.query("SELECT * FROM timesheet_entries WHERE organisation_id=$1", [org.id])).rows.length, 0);
    await observer.query("UPDATE calendar_memberships SET permission='editor' WHERE calendar_id=$1 AND user_id=$2", [org.calendarId, member.userId]);
    await first.query("BEGIN"); await mutate(first, org, member.userId, "saveEntry", data);
    const revoke = outcome(second.query("UPDATE calendar_memberships SET permission='viewer' WHERE calendar_id=$1 AND user_id=$2", [org.calendarId, member.userId]));
    await blockedByFirst(); await first.query("COMMIT");
    assert.equal((await revoke).error, null);
    assert.equal((await observer.query("SELECT * FROM timesheet_entries WHERE organisation_id=$1", [org.id])).rows.length, 1);
    assert.equal((await outcome(mutate(observer, org, member.userId, "saveEntry", { ...data, start: "2026-10-08T10:00:00Z", end: "2026-10-08T10:15:00Z" }))).error?.code, "42501");
  });

  await t.test("a settings change makes a waiting entry's organisation version stale", async () => {
    const org = await organisation();
    await first.query("BEGIN");
    await mutate(first, org, org.owner, "saveSettings", { name: "Changed settings", timezone: "UTC", incrementMinutes: 30, version: 1 });
    const stale = outcome(mutate(second, org, org.owner, "saveEntry", entry(org)));
    await blockedByFirst(); await first.query("COMMIT");
    assert.equal((await stale).error?.code, "40001");
    assert.equal((await observer.query("SELECT * FROM timesheet_entries WHERE organisation_id=$1", [org.id])).rows.length, 0);
  });
});
