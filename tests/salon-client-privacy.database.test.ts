import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { neon } from "@neondatabase/serverless";
import { loadOwnAppointment } from "../lib/salon/service";

const connection = process.env.SALON_TEST_DATABASE_URL;
test("Client appointment detail uses the published business name or neutral fallback", { skip: !connection }, async () => {
  assert.equal(new URL(connection!).hostname, "ep-billowing-hill-a7v4eaar-pooler.ap-southeast-2.aws.neon.tech");
  process.env.APP_DATABASE_URL = connection;
  const sql = neon(connection!), calendarId = randomUUID(), owner = randomUUID(), practitionerId = randomUUID(), serviceId = randomUUID(), client = randomUUID(), appointmentId = randomUUID();
  const start = `${new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)}T10:00:00.000Z`;
  const input = JSON.stringify({ requestId: appointmentId, practitionerId, serviceId, start, clientName: "Synthetic client", clientEmail: "privacy@example.invalid", clientPhone: "", expectedTerms: { serviceName: "Synthetic service", durationMinutes: 30, priceMinor: null, currency: "NZD", cancellationHours: 0 } });
  const result = await sql.transaction([
    sql`INSERT INTO calendars(id,name,calendar_type,timezone) VALUES(${calendarId},'Synthetic private internal business name','salon_bookings','UTC')`,
    sql`INSERT INTO calendar_memberships(calendar_id,user_id,permission) VALUES(${calendarId},${owner},'owner')`,
    sql`INSERT INTO salon_settings(calendar_id,business_name,public_enabled,lead_minutes,cancellation_hours) VALUES(${calendarId},'Synthetic public business name',true,0,0)`,
    sql`INSERT INTO salon_practitioners(id,calendar_id,user_id,role,display_name,bookable) VALUES(${practitionerId},${calendarId},${owner},'owner','Synthetic provider',true)`,
    sql`INSERT INTO salon_services(id,calendar_id,name,duration_minutes,bookable) VALUES(${serviceId},${calendarId},'Synthetic service',30,true)`,
    sql`INSERT INTO salon_practitioner_services(calendar_id,practitioner_id,service_id) VALUES(${calendarId},${practitionerId},${serviceId})`,
    sql`INSERT INTO salon_working_hours(calendar_id,practitioner_id,weekday,start_minute,end_minute) SELECT ${calendarId},${practitionerId},day,0,1440 FROM generate_series(0,6)day`,
    sql`SELECT salon_book(${calendarId}::uuid,${client}::uuid,${input}::jsonb,true) AS result`,
  ]);
  const id = result[7][0].result.id;
  await sql`SELECT salon_change_appointment(${client}::uuid,${id}::uuid,1,'cancel',NULL::timestamptz,NULL::uuid)`;
  const named = await loadOwnAppointment(client, id);
  assert.equal(named.businessName, "Synthetic public business name");
  assert.ok(!JSON.stringify(named).includes("private internal"));
  assert.equal(typeof named.appointment.start, "string"); assert.equal("notes" in named.appointment, false);
  await sql`UPDATE salon_settings SET business_name='',public_enabled=false WHERE calendar_id=${calendarId}`;
  const unnamed = await loadOwnAppointment(client, id);
  assert.equal(unnamed.businessName, "Salon"); assert.ok(!JSON.stringify(unnamed).includes("private internal"));
  assert.equal((await sql`SELECT count(*)::int AS n FROM calendar_memberships WHERE calendar_id=${calendarId} AND user_id=${client}`)[0].n, 0);
});
