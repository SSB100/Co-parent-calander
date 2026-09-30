import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { neon } from "@neondatabase/serverless";
import { bookPublicSalon, loadOwnAppointment, loadSalon, loadPublicSalon, SalonError, type SalonSession } from "../lib/salon/service";

const connection = process.env.SALON_TEST_DATABASE_URL;
const expectedHost = "ep-billowing-hill-a7v4eaar-pooler.ap-southeast-2.aws.neon.tech";
test("Salon guards and lock-ordered setting changes on new isolated fixtures", { skip: !connection }, async t => {
  assert.equal(new URL(connection!).hostname, expectedHost);
  process.env.APP_DATABASE_URL = connection;
  const sql = neon(connection!);
  const calendarId = randomUUID(), owner = randomUUID(), practitionerId = randomUUID(), serviceId = randomUUID(), client = { id: randomUUID() }, outsider = randomUUID(), manager = randomUUID(), managerProfileId = randomUUID();
  const day = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const at = (hour: number) => `${day}T${String(hour).padStart(2, "0")}:00:00.000Z`;
  const input = (hour: number) => ({ requestId: randomUUID(), practitionerId, serviceId, start: at(hour), clientName: "Synthetic lock test", clientEmail: "lock-test@example.invalid", clientPhone: "", expectedTerms: { serviceName: "Synthetic cut", durationMinutes: 60, priceMinor: null, currency: "NZD", cancellationHours: 0 } });
  await sql.transaction([
    sql`INSERT INTO calendars(id,name,calendar_type,timezone) VALUES(${calendarId},'Synthetic Salon lock qualification','salon_bookings','UTC')`,
    sql`INSERT INTO calendar_memberships(calendar_id,user_id,permission) VALUES(${calendarId},${owner},'owner'),(${calendarId},${manager},'editor')`,
    sql`INSERT INTO salon_settings(calendar_id,business_name,public_enabled,lead_minutes,cancellation_hours) VALUES(${calendarId},'Synthetic lock test',true,0,0)`,
    sql`INSERT INTO salon_practitioners(id,calendar_id,user_id,role,display_name,bookable) VALUES(${practitionerId},${calendarId},${owner},'owner','Synthetic owner',true),(${managerProfileId},${calendarId},${manager},'manager','Synthetic manager',false)`,
    sql`INSERT INTO salon_services(id,calendar_id,name,duration_minutes,bookable) VALUES(${serviceId},${calendarId},'Synthetic cut',60,true)`,
    sql`INSERT INTO salon_practitioner_services(calendar_id,practitioner_id,service_id) VALUES(${calendarId},${practitionerId},${serviceId})`,
    sql`INSERT INTO salon_working_hours(calendar_id,practitioner_id,weekday,start_minute,end_minute) SELECT ${calendarId},${practitionerId},day,0,1440 FROM generate_series(0,6) day`,
  ]);
  const booked = await bookPublicSalon(client, calendarId, input(9));
  await t.test("direct table writes cannot bypass appointment ownership, conflict or snapshot guards", async () => {
    await assert.rejects(sql`INSERT INTO salon_appointments SELECT (jsonb_populate_record(NULL::salon_appointments,
      to_jsonb(a)||jsonb_build_object('id',${randomUUID()}::uuid,'request_key',${randomUUID()}::uuid))).* FROM salon_appointments a WHERE a.id=${booked.id}`);
    await assert.rejects(sql`UPDATE salon_appointments SET status='cancelled',version=version+1,updated_by_user_id=${outsider} WHERE id=${booked.id}`);
    await assert.rejects(sql`UPDATE salon_appointments SET price_minor=1,version=version+1,updated_by_user_id=${owner} WHERE id=${booked.id}`);
    await assert.rejects(sql`INSERT INTO salon_time_blocks(calendar_id,practitioner_id,start_at,end_at,created_by_user_id,updated_by_user_id)
      VALUES(${calendarId},${practitionerId},${at(9)},${at(10)},${owner},${owner})`);
    const unchanged = await loadOwnAppointment(client.id, booked.id!);
    assert.equal(unchanged.appointment.version, 1); assert.equal(unchanged.appointment.status, "confirmed"); assert.equal(unchanged.appointment.priceMinor, null);
  });

  async function holdRead<T>(pattern: RegExp, read: () => Promise<T>, change: () => Promise<unknown>) {
    const originalFetch = globalThis.fetch;
    let signalBlocked!: () => void; let release!: () => void; let used = false;
    const blocked = new Promise<void>(resolve => { signalBlocked = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    globalThis.fetch = async (request, init) => {
      let query = "";
      if (typeof init?.body === "string") { try { query = JSON.parse(init.body).query ?? ""; } catch { /* unrelated fetch */ } }
      if (!used && pattern.test(query)) { used = true; signalBlocked(); await gate; }
      return originalFetch(request, init);
    };
    const reading = read();
    const timer = setTimeout(() => { release(); signalBlocked(); }, 60000);
    try {
      await blocked; assert.ok(used, "The read must reach the selected query boundary");
      await change(); release(); await assert.rejects(reading, (error: unknown) => error instanceof SalonError && [403, 409].includes(error.status));
    } finally { clearTimeout(timer); release(); globalThis.fetch = originalFetch; await reading.catch(() => undefined); }
  }
  await t.test("staff and public projections fail closed when access is withdrawn during a read", async () => {
    const session: SalonSession = { calendarId, membershipId: randomUUID(), userId: manager, calendarName: "Synthetic Salon lock qualification", calendarType: "salon_bookings", calendarTimezone: "UTC", permission: "editor", userName: "Synthetic", userEmail: "manager@example.invalid", participantId: null, displayName: null, colorKey: null, profileSlot: null };
    await holdRead(/WITH upcoming/, () => loadSalon(session, day), () => sql`UPDATE salon_practitioners SET role='practitioner' WHERE id=${managerProfileId} AND calendar_id=${calendarId}`);
    await holdRead(/SELECT s.id,s.name,s.description/, () => loadPublicSalon(calendarId, day, serviceId), () => sql`UPDATE salon_settings SET public_enabled=false WHERE calendar_id=${calendarId}`);
    await sql`UPDATE salon_settings SET public_enabled=true WHERE calendar_id=${calendarId}`;
  });

  await t.test("a settings change holding the calendar lock takes effect before a waiting booking recheck", async () => {
    // A private advisory transaction lock is only a test barrier. It confirms the
    // settings transaction already holds the actual calendar row lock.
    const barrier = Math.floor(Math.random() * 2000000000);
    const changing = sql.transaction([
      sql`SELECT salon_lock_calendar(${calendarId}::uuid)`,
      sql`SELECT pg_advisory_xact_lock(35,${barrier})`,
      sql`SELECT pg_sleep(15)`,
      sql`UPDATE salon_settings SET public_enabled=false WHERE calendar_id=${calendarId}`,
    ]);
    // Force execution now; Neon transaction objects are promises.
    const updateDone = Promise.resolve(changing);
    let sawLock = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const rows = await sql`SELECT pg_try_advisory_xact_lock(35,${barrier}) AS available`;
      if (!rows[0].available) { sawLock = true; break; }
    }
    assert.ok(sawLock, "The concurrent settings transaction must hold its barrier before the booking begins");
    await assert.rejects(bookPublicSalon(client, calendarId, input(11)));
    await updateDone;
    assert.equal((await sql`SELECT count(*)::int AS n FROM salon_appointments WHERE calendar_id=${calendarId}`)[0].n, 1);
  });

  await t.test("existing runtime table and function ACLs require no privilege expansion", async () => {
    const tables = await sql`SELECT c.relname,(has_table_privilege('covie_app',c.oid,'SELECT') AND has_table_privilege('covie_app',c.oid,'INSERT') AND has_table_privilege('covie_app',c.oid,'UPDATE') AND has_table_privilege('covie_app',c.oid,'DELETE')) AS allowed
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'salon_%'`;
    assert.equal(tables.length, 9); assert.ok(tables.every(table => table.allowed));
    const functions = await sql`SELECT p.proname,p.prosecdef,has_function_privilege('covie_app',p.oid,'EXECUTE') AS allowed
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('salon_book','salon_mutate','salon_change_appointment','salon_redeem_invitation')`;
    assert.equal(functions.length, 4); assert.ok(functions.every(fn => fn.allowed && !fn.prosecdef));
  });
});
