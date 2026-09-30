import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { neon } from "@neondatabase/serverless";
import { hashToken } from "../lib/security/tokens";

const connection = process.env.SALON_TEST_DATABASE_URL;
test("Salon managers can revoke their own invitations; owners can revoke all", { skip: !connection }, async () => {
  assert.equal(new URL(connection!).hostname, "ep-billowing-hill-a7v4eaar-pooler.ap-southeast-2.aws.neon.tech");
  const sql = neon(connection!), calendarId = randomUUID(), owner = randomUUID(), manager = randomUUID();
  const invitation = () => JSON.stringify({ role: "practitioner", displayName: "Synthetic invitation", kind: "contractor", codeHash: hashToken(randomUUID()), codeHint: "TEST", expiresAt: new Date(Date.now() + 86400000).toISOString() });
  const fixture = await sql.transaction([
    sql`INSERT INTO calendars(id,name,calendar_type) VALUES(${calendarId},'Synthetic Salon invitation revocation','salon_bookings')`,
    sql`INSERT INTO calendar_memberships(calendar_id,user_id,permission) VALUES(${calendarId},${owner},'owner'),(${calendarId},${manager},'editor')`,
    sql`INSERT INTO salon_practitioners(calendar_id,user_id,role,display_name) VALUES(${calendarId},${manager},'manager','Synthetic manager')`,
    sql`SELECT salon_mutate(${calendarId}::uuid,${owner}::uuid,'createInvite',${invitation()}::jsonb) AS result`,
    sql`SELECT salon_mutate(${calendarId}::uuid,${manager}::uuid,'createInvite',${invitation()}::jsonb) AS result`,
  ]);
  const ownerInvite = fixture[3][0].result.id, managerInvite = fixture[4][0].result.id;
  await assert.rejects(sql`SELECT salon_mutate(${calendarId}::uuid,${manager}::uuid,'revokeInvite',${JSON.stringify({ id: ownerInvite })}::jsonb)`, (error: unknown) => !!error && typeof error === "object" && "constraint" in error && error.constraint === "salon_invite_access");
  assert.equal((await sql`SELECT revoked_at FROM calendar_invites WHERE id=${ownerInvite}`)[0].revoked_at, null);
  const own = await sql`SELECT salon_mutate(${calendarId}::uuid,${manager}::uuid,'revokeInvite',${JSON.stringify({ id: managerInvite })}::jsonb) AS result`;
  assert.equal(own[0].result.ok, true);
  const ownerRevocation = await sql`SELECT salon_mutate(${calendarId}::uuid,${owner}::uuid,'revokeInvite',${JSON.stringify({ id: ownerInvite })}::jsonb) AS result`;
  assert.equal(ownerRevocation[0].result.ok, true);
  assert.equal((await sql`SELECT count(*)::int AS n FROM calendar_invites WHERE calendar_id=${calendarId} AND revoked_at IS NOT NULL`)[0].n, 2);
  assert.equal((await sql`SELECT count(*)::int AS n FROM participants WHERE calendar_id=${calendarId}`)[0].n, 0);
});
