import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { neon } from "@neondatabase/serverless";

const connection = process.env.SALON_TEST_DATABASE_URL;
test("Salon self-profile edits preserve authority and booking policy remains owner-only", { skip: !connection }, async () => {
  assert.equal(new URL(connection!).hostname, "ep-billowing-hill-a7v4eaar-pooler.ap-southeast-2.aws.neon.tech");
  const sql = neon(connection!), calendarId = randomUUID(), owner = randomUUID(), manager = randomUUID(), practitioner = randomUUID(), other = randomUUID();
  const managerId = randomUUID(), practitionerId = randomUUID(), otherId = randomUUID();
  await sql.transaction([
    sql`INSERT INTO calendars(id,name,calendar_type) VALUES(${calendarId},'Synthetic Salon authority qualification','salon_bookings')`,
    sql`INSERT INTO calendar_memberships(calendar_id,user_id,permission) VALUES(${calendarId},${owner},'owner'),(${calendarId},${manager},'editor'),(${calendarId},${practitioner},'editor'),(${calendarId},${other},'editor')`,
    sql`INSERT INTO salon_practitioners(id,calendar_id,user_id,role,display_name) VALUES(${managerId},${calendarId},${manager},'manager','Synthetic manager'),(${practitionerId},${calendarId},${practitioner},'practitioner','Synthetic practitioner'),(${otherId},${calendarId},${other},'practitioner','Synthetic other')`,
  ]);
  const edit = (id: string, role: string, changes: Record<string, unknown> = {}) => JSON.stringify({ id, displayName: "Updated synthetic name", bio: "Updated synthetic bio", kind: "contractor", role, active: true, bookable: false, ...changes });
  const own = await sql`SELECT salon_mutate(${calendarId}::uuid,${practitioner}::uuid,'savePractitioner',${edit(practitionerId, "practitioner")}::jsonb) AS result`;
  assert.equal(own[0].result.ok, true);
  const managerEdit = await sql`SELECT salon_mutate(${calendarId}::uuid,${manager}::uuid,'savePractitioner',${edit(managerId, "manager")}::jsonb) AS result`;
  assert.equal(managerEdit[0].result.ok, true);
  for (const [actor, id, role] of [[practitioner, practitionerId, "practitioner"], [manager, managerId, "manager"]]) {
    for (const change of [{ role: "owner" }, { role: role === "manager" ? "practitioner" : "manager" }, { active: false }, { bookable: true }]) {
      await assert.rejects(sql`SELECT salon_mutate(${calendarId}::uuid,${actor}::uuid,'savePractitioner',${edit(id, role, change)}::jsonb)`);
    }
  }
  await assert.rejects(sql`SELECT salon_mutate(${calendarId}::uuid,${practitioner}::uuid,'savePractitioner',${edit(otherId, "practitioner")}::jsonb)`);
  const policy = JSON.stringify({ businessName: "Synthetic owner policy", description: "", location: "", publicEnabled: false, leadMinutes: 0, advanceDays: 90, slotMinutes: 15, cancellationHours: 0 });
  await sql`SELECT salon_mutate(${calendarId}::uuid,${owner}::uuid,'saveSettings',${policy}::jsonb)`;
  await assert.rejects(sql`SELECT salon_mutate(${calendarId}::uuid,${manager}::uuid,'saveSettings',${policy}::jsonb)`);
  const profiles = await sql`SELECT id,role,active,bookable,display_name,bio,kind FROM salon_practitioners WHERE calendar_id=${calendarId} AND id IN (${managerId},${practitionerId})`;
  assert.ok(profiles.every(row => row.active && !row.bookable && row.display_name === "Updated synthetic name" && row.bio === "Updated synthetic bio" && row.kind === "contractor"));
  assert.equal(profiles.find(row => row.id === managerId)?.role, "manager"); assert.equal(profiles.find(row => row.id === practitionerId)?.role, "practitioner");
  await sql`UPDATE salon_practitioners SET active=false WHERE id=${practitionerId} AND calendar_id=${calendarId}`;
  await assert.rejects(sql`SELECT salon_mutate(${calendarId}::uuid,${practitioner}::uuid,'savePractitioner',${edit(practitionerId, "practitioner")}::jsonb)`);
});
