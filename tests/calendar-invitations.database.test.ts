import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { neon } from "@neondatabase/serverless";
import { getTemplateAccess, type TemplateSession } from "../lib/calendar-sharing/access";
import { redeemMemberInvitation } from "../lib/calendar-sharing/invitations";
import {
  changeTemplateMember,
  createTemplateInvite,
  loadTemplateMembers,
  revokeTemplateInvite,
  SharingError,
} from "../lib/calendar-sharing/service";
import { normalizeInviteCode } from "../lib/security/invites";
import { hashToken } from "../lib/security/tokens";

const connection = process.env.FACILITIES_TEST_DATABASE_URL;
const qualificationHost = "ep-weathered-sea-a763290t-pooler.ap-southeast-2.aws.neon.tech";
const denied = (error: unknown) => error instanceof SharingError && error.status === 403;
const unavailable = (error: unknown) => error instanceof SharingError && error.status === 409;
const inviteHash = (code: string) => hashToken(normalizeInviteCode(code));

/**
 * Explicitly opt-in, isolated database qualification. This file is intentionally
 * outside the normal unit-test script. Every fixture uses fresh random IDs.
 * Synthetic records are retained for inspection; no existing records are changed.
 */
test("calendar invitation revocation and role-transition database qualification", { skip: !connection, timeout: 1_800_000, concurrency: true }, async (t) => {
  const target = new URL(connection!);
  assert.ok(target.protocol === "postgres:" || target.protocol === "postgresql:");
  assert.equal(target.hostname, qualificationHost, "Only the designated isolated qualification branch is allowed");
  const originalAppUrl = process.env.APP_DATABASE_URL;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.APP_DATABASE_URL = connection;
  process.env.DATABASE_URL = connection;
  const sql = neon(connection!);

  async function fixture(calendarType: "social_groups" | "shared_facilities" = "social_groups") {
    const calendarId = randomUUID();
    const makeSession = (permission: "owner" | "editor" | "viewer"): TemplateSession => ({
      calendarId, membershipId: randomUUID(), userId: randomUUID(), permission,
      calendarType, calendarName: "Invitation qualification", calendarTimezone: "UTC",
      userName: "Synthetic qualification member", userEmail: "qualification@example.invalid",
      participantId: null, displayName: null, colorKey: null, profileSlot: null,
    });
    const owner = makeSession("owner"), organiser = makeSession("editor"), member = makeSession("editor"), viewer = makeSession("viewer");
    const resourceIds = calendarType === "shared_facilities" ? [randomUUID(), randomUUID()] : [];
    await sql.transaction([
      sql`INSERT INTO calendars(id,name,calendar_type,timezone)
        VALUES(${calendarId},${`Invitation synthetic qualification ${calendarId}`},${calendarType},'UTC')`,
      ...[owner, organiser, member, viewer].map((session) =>
        sql`INSERT INTO calendar_memberships(id,calendar_id,user_id,permission)
          VALUES(${session.membershipId},${calendarId},${session.userId},${session.permission}::calendar_permission)`),
      ...resourceIds.map((id) =>
        sql`INSERT INTO facility_resources(id,calendar_id,name)
          VALUES(${id},${calendarId},${`Qualification resource ${id}`})`),
      sql`INSERT INTO template_member_roles(calendar_id,user_id,role,resource_ids)
        VALUES(${calendarId},${organiser.userId},${calendarType === "social_groups" ? "admin" : "manager"},${resourceIds.slice(0, 1)}::uuid[])`,
    ]);
    return { calendarId, owner, organiser, member, viewer, resourceIds };
  }

  async function invitationState(calendarId: string, code: string) {
    const rows = await sql`SELECT id, use_count AS "useCount", max_uses AS "maxUses", revoked_at AS "revokedAt"
      FROM calendar_invites WHERE calendar_id=${calendarId} AND code_hash=${inviteHash(code)}`;
    assert.equal(rows.length, 1);
    return rows[0] as { id: string; useCount: number; maxUses: number; revokedAt: string | null };
  }

  async function membershipState(calendarId: string, userId: string) {
    return sql`SELECT m.permission,m.participant_id AS "participantId",r.role,r.resource_ids AS "resourceIds"
      FROM calendar_memberships m LEFT JOIN template_member_roles r
      ON r.calendar_id=m.calendar_id AND r.user_id=m.user_id
      WHERE m.calendar_id=${calendarId} AND m.user_id=${userId}`;
  }

  async function assertNewMember(calendarId: string, userId: string) {
    const rows = await membershipState(calendarId, userId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].permission, "editor");
    assert.equal(rows[0].role, "member");
    assert.equal(rows[0].participantId, null);
    assert.deepEqual(rows[0].resourceIds, []);
  }

  try {
    const scenarios: Promise<void>[] = [];
    scenarios.push(t.test("Social admin demotion revokes every unused invite and stale sessions cannot issue new ones", async () => {
      const f = await fixture();
      const memberInvite = await createTemplateInvite(f.organiser, "member", []);
      const viewerInvite = await createTemplateInvite(f.organiser, "viewer", []);
      await changeTemplateMember(f.owner, f.organiser.membershipId, "member");
      assert.deepEqual(await getTemplateAccess(f.organiser), { role: "member", resourceIds: [] });
      await assert.rejects(createTemplateInvite(f.organiser, "member", []), denied);
      for (const invite of [memberInvite, viewerInvite]) {
        const state = await invitationState(f.calendarId, invite.code);
        assert.ok(state.revokedAt, "An unused code issued by the demoted admin must be revoked");
        assert.equal(state.useCount, 0);
        const recipient = randomUUID();
        assert.equal(await redeemMemberInvitation(inviteHash(invite.code), recipient), undefined);
        assert.equal((await membershipState(f.calendarId, recipient)).length, 0);
      }
      // Restoring the role must not resurrect codes that were explicitly revoked.
      await changeTemplateMember(f.owner, f.organiser.membershipId, "admin");
      assert.equal(await redeemMemberInvitation(inviteHash(memberInvite.code), randomUUID()), undefined);
    }));

    scenarios.push(t.test("redemption checks current inviter authority even when a historical unused code was not revoked", async () => {
      const f = await fixture();
      const invite = await createTemplateInvite(f.organiser, "member", []);
      // Only this synthetic fixture is changed. This represents a historical role
      // transition that predates automatic invitation revocation.
      await sql`UPDATE template_member_roles SET role='member',resource_ids='{}'::uuid[]
        WHERE calendar_id=${f.calendarId} AND user_id=${f.organiser.userId}`;
      assert.equal((await invitationState(f.calendarId, invite.code)).revokedAt, null);
      const recipient = randomUUID();
      assert.equal(await redeemMemberInvitation(inviteHash(invite.code), recipient), undefined);
      assert.equal((await membershipState(f.calendarId, recipient)).length, 0);
      assert.equal((await invitationState(f.calendarId, invite.code)).useCount, 0);
    }));

    scenarios.push(t.test("a completed redemption remains valid when its inviter is subsequently demoted", async () => {
      const f = await fixture();
      const invite = await createTemplateInvite(f.organiser, "member", []);
      const recipient = randomUUID();
      assert.equal(await redeemMemberInvitation(inviteHash(invite.code), recipient), f.calendarId);
      await changeTemplateMember(f.owner, f.organiser.membershipId, "viewer");
      await assertNewMember(f.calendarId, recipient);
      assert.deepEqual(await getTemplateAccess({ ...f.organiser, permission: "viewer" }), { role: "viewer", resourceIds: [] });
      assert.equal((await invitationState(f.calendarId, invite.code)).useCount, 1);
      assert.equal(await redeemMemberInvitation(inviteHash(invite.code), randomUUID()), undefined);
    }));

    scenarios.push(t.test("concurrent demotion and redemption have a linearizable, atomic outcome", async () => {
      // Each attempt has a separate calendar, inviter, invitation and recipient.
      // A single start barrier launches the real service operations together.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const f = await fixture();
        const invite = await createTemplateInvite(f.organiser, "member", []);
        const recipient = randomUUID();
        let release!: () => void;
        const barrier = new Promise<void>((resolve) => { release = resolve; });
        async function timed<T>(operation: () => Promise<T>) {
          await barrier;
          const started = performance.now();
          const value = await operation();
          return { started, finished: performance.now(), value };
        }
        const demotion = timed(() => changeTemplateMember(f.owner, f.organiser.membershipId, "member"));
        const redemption = timed(() => redeemMemberInvitation(inviteHash(invite.code), recipient));
        release();
        // Unexpected errors, including deadlocks, fail qualification rather than
        // being misclassified as an acceptable denied redemption.
        const [demoted, redeemed] = await Promise.all([demotion, redemption]);
        assert.equal(demoted.value.ok, true);
        const joined = redeemed.value === f.calendarId;
        assert.ok(joined || redeemed.value === undefined);
        if (demoted.finished < redeemed.started) assert.equal(joined, false);
        if (redeemed.finished < demoted.started) assert.equal(joined, true);
        assert.deepEqual(await getTemplateAccess(f.organiser), { role: "member", resourceIds: [] });
        const state = await invitationState(f.calendarId, invite.code);
        if (joined) {
          await assertNewMember(f.calendarId, recipient);
          assert.equal(state.useCount, 1, "An admitted member consumes exactly one invitation use");
        } else {
          assert.equal((await membershipState(f.calendarId, recipient)).length, 0, "Denied redemption must leave no partial membership");
          assert.equal(state.useCount, 0, "Denied redemption must not consume the invite");
          assert.ok(state.revokedAt, "Demotion must revoke the losing unused invite");
        }
        assert.ok(state.useCount <= state.maxUses);
        const lateRecipient = randomUUID();
        assert.equal(await redeemMemberInvitation(inviteHash(invite.code), lateRecipient), undefined, "No invitation may be redeemed after demotion has completed");
        assert.equal((await membershipState(f.calendarId, lateRecipient)).length, 0);
      }
    }));

    scenarios.push(t.test("only the owner can grant, change or remove organiser privileges", async () => {
      const f = await fixture();
      for (const actor of [f.organiser, f.member, f.viewer]) {
        await assert.rejects(changeTemplateMember(actor, f.member.membershipId, "admin"), denied);
        await assert.rejects(changeTemplateMember(actor, f.organiser.membershipId, "viewer"), denied);
        await assert.rejects(createTemplateInvite(actor, "admin", []), denied);
      }
      assert.equal((await membershipState(f.calendarId, f.member.userId))[0].role, null);
      assert.equal((await getTemplateAccess(f.organiser)).role, "admin");
      await changeTemplateMember(f.owner, f.member.membershipId, "admin");
      assert.equal((await getTemplateAccess(f.member)).role, "admin");
      await changeTemplateMember(f.owner, f.member.membershipId, "viewer");
      const changed = await membershipState(f.calendarId, f.member.userId);
      assert.equal(changed[0].permission, "viewer");
      assert.equal(changed[0].role, "viewer");
      assert.deepEqual(changed[0].resourceIds, []);
      await assert.rejects(changeTemplateMember(f.owner, f.owner.membershipId, "member"), unavailable);
      assert.equal((await membershipState(f.calendarId, f.owner.userId))[0].permission, "owner");
    }));

    scenarios.push(t.test("scoped Facilities managers cannot inspect or administer calendar members or invitations", async () => {
      const f = await fixture("shared_facilities");
      assert.deepEqual(await getTemplateAccess(f.organiser), { role: "manager", resourceIds: [f.resourceIds[0]] });
      const memberView = await loadTemplateMembers(f.organiser);
      assert.equal(memberView.canInvite, false);
      assert.deepEqual(memberView.members, []);
      assert.deepEqual(memberView.invites, []);
      assert.deepEqual(memberView.resources, []);
      for (const role of ["member", "viewer", "manager"] as const) {
        await assert.rejects(createTemplateInvite(f.organiser, role, role === "manager" ? [f.resourceIds[0]] : []), denied);
      }
      await assert.rejects(changeTemplateMember(f.organiser, f.member.membershipId, "manager", [f.resourceIds[1]]), denied);
      const ownerInvite = await createTemplateInvite(f.owner, "member", []);
      const invite = await invitationState(f.calendarId, ownerInvite.code);
      await assert.rejects(revokeTemplateInvite(f.organiser, invite.id), denied);
      assert.equal((await invitationState(f.calendarId, ownerInvite.code)).revokedAt, null);
      assert.equal((await membershipState(f.calendarId, f.member.userId))[0].role, null);
      assert.deepEqual(await getTemplateAccess(f.organiser), { role: "manager", resourceIds: [f.resourceIds[0]] });
    }));
    // Wait for every independent fixture before restoring the shared service environment.
    await Promise.all(scenarios);
  } finally {
    if (originalAppUrl === undefined) delete process.env.APP_DATABASE_URL;
    else process.env.APP_DATABASE_URL = originalAppUrl;
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
});
