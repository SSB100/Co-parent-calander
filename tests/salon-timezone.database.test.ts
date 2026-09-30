import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { neon } from "@neondatabase/serverless";
import { bookPublicSalon, loadPublicSalon } from "../lib/salon/service";
import { salonSlotLocalLabel } from "../lib/salon/slots";

const connection = process.env.SALON_TEST_DATABASE_URL;
function nextTransition(kind: "fold" | "gap") {
  const year = new Date().getUTCFullYear();
  for (const nextYear of [year, year + 1]) {
    const date = kind === "fold" ? new Date(Date.UTC(nextYear, 3, 1, 12)) : new Date(Date.UTC(nextYear, 8, 30, 12));
    date.setUTCDate(date.getUTCDate() + (kind === "fold" ? (7 - date.getUTCDay()) % 7 : -date.getUTCDay()));
    if (date.getTime() > Date.now() + 86400000 && date.getTime() < Date.now() + 365 * 86400000) return date.toISOString().slice(0, 10);
  }
  return undefined;
}
test("Salon database availability matches real DST instants and full-visit local hours", { skip: !connection }, async t => {
  assert.equal(new URL(connection!).hostname, "ep-billowing-hill-a7v4eaar-pooler.ap-southeast-2.aws.neon.tech");
  process.env.APP_DATABASE_URL = connection;
  const sql = neon(connection!), calendarId = randomUUID(), owner = randomUUID(), practitionerId = randomUUID(), serviceId = randomUUID(), client = { id: randomUUID() };
  await sql.transaction([
    sql`INSERT INTO calendars(id,name,calendar_type,timezone) VALUES(${calendarId},'Synthetic Salon DST qualification','salon_bookings','Pacific/Auckland')`,
    sql`INSERT INTO calendar_memberships(calendar_id,user_id,permission) VALUES(${calendarId},${owner},'owner')`,
    sql`INSERT INTO salon_settings(calendar_id,business_name,public_enabled,lead_minutes,advance_days,cancellation_hours) VALUES(${calendarId},'Synthetic DST',true,0,365,0)`,
    sql`INSERT INTO salon_practitioners(id,calendar_id,user_id,role,display_name,bookable) VALUES(${practitionerId},${calendarId},${owner},'owner','Synthetic DST provider',true)`,
    sql`INSERT INTO salon_services(id,calendar_id,name,duration_minutes,bookable) VALUES(${serviceId},${calendarId},'Synthetic DST service',30,true)`,
    sql`INSERT INTO salon_practitioner_services(calendar_id,practitioner_id,service_id) VALUES(${calendarId},${practitionerId},${serviceId})`,
    sql`INSERT INTO salon_working_hours(calendar_id,practitioner_id,weekday,start_minute,end_minute) VALUES(${calendarId},${practitionerId},0,60,240)`,
  ]);
  const proposal = (start: string, durationMinutes: number) => ({ requestId: randomUUID(), practitionerId, serviceId, start, clientName: "Synthetic DST client", clientEmail: "dst@example.invalid", clientPhone: "", expectedTerms: { serviceName: "Synthetic DST service", durationMinutes, priceMinor: null, currency: "NZD", cancellationHours: 0 } });
  const foldDate = nextTransition("fold"), gapDate = nextTransition("gap");
  await t.test("repeated-clock slots are distinct and SQL rejects a visit crossing a closed part of the fold", { skip: !foldDate }, async () => {
    const page = await loadPublicSalon(calendarId, foldDate!, serviceId);
    const repeated = page.slots.filter(slot => salonSlotLocalLabel(page.timezone, slot.start) === `${foldDate}T02:15`);
    assert.equal(repeated.length, 2); assert.equal(Date.parse(repeated[1].start) - Date.parse(repeated[0].start), 3600000);
    // Changing this synthetic provider's hours does not rewrite any appointment.
    await sql.transaction([
      sql`UPDATE salon_working_hours SET start_minute=150,end_minute=210 WHERE calendar_id=${calendarId} AND practitioner_id=${practitionerId}`,
      sql`UPDATE salon_services SET duration_minutes=60 WHERE id=${serviceId} AND calendar_id=${calendarId}`,
    ]);
    const early = new Date(Date.parse(repeated[0].start) + 15 * 60000).toISOString();
    const late = new Date(Date.parse(repeated[1].start) + 15 * 60000).toISOString();
    await assert.rejects(bookPublicSalon(client, calendarId, proposal(early, 60)), (error: unknown) => !!error && typeof error === "object" && "constraint" in error && error.constraint === "salon_hours");
    const current = await loadPublicSalon(calendarId, foldDate!, serviceId);
    assert.ok(!current.slots.some(slot => slot.start === early)); assert.ok(current.slots.some(slot => slot.start === late));
    await bookPublicSalon(client, calendarId, proposal(late, 60));
  });
  await t.test("spring gap has no invented clock times and a continuous actual-time visit can cross it", { skip: !gapDate }, async () => {
    await sql.transaction([
      sql`UPDATE salon_working_hours SET start_minute=60,end_minute=240 WHERE calendar_id=${calendarId} AND practitioner_id=${practitionerId}`,
      sql`UPDATE salon_services SET duration_minutes=30 WHERE id=${serviceId} AND calendar_id=${calendarId}`,
    ]);
    const page = await loadPublicSalon(calendarId, gapDate!, serviceId);
    assert.ok(!page.slots.some(slot => salonSlotLocalLabel(page.timezone, slot.start).includes("T02:")));
    const crossing = page.slots.find(slot => salonSlotLocalLabel(page.timezone, slot.start) === `${gapDate}T01:45`)!;
    assert.ok(crossing); assert.equal(salonSlotLocalLabel(page.timezone, crossing.end), `${gapDate}T03:15`);
    assert.equal(Date.parse(crossing.end) - Date.parse(crossing.start), 30 * 60000);
    await bookPublicSalon(client, calendarId, proposal(crossing.start, 30));
  });
});
