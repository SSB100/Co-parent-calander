import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { loadPersonalData } from "../lib/personal/service";
import {
  bookPublicSalon,
  changeOwnAppointment,
  loadSalon,
  mutateSalon,
  redeemSalonInvitation,
  type SalonSession,
} from "../lib/salon/service";
import { normalizeInviteCode } from "../lib/security/invites";
import { hashToken } from "../lib/security/tokens";
const connection = process.env.PERSONAL_SALON_TEST_DATABASE_URL;
test(
  "Personal Salon projection follows client and assigned-practitioner ownership",
  { skip: !connection, timeout: 900000 },
  async (t) => {
    assert.equal(
      new URL(connection!).hostname,
      "ep-billowing-hill-a7v4eaar-pooler.ap-southeast-2.aws.neon.tech",
    );
    process.env.APP_DATABASE_URL = connection;
    const sql = neon(connection!),
      calendarId = randomUUID(),
      ownerId = randomUUID(),
      ownerMembership = randomUUID(),
      practitionerUser = randomUUID(),
      client = randomUUID(),
      otherClient = randomUUID(),
      outsider = randomUUID();
    const session: SalonSession = {
      calendarId,
      calendarType: "salon_bookings",
      calendarName: "Private internal workspace",
      calendarTimezone: "UTC",
      membershipId: ownerMembership,
      userId: ownerId,
      userName: "Synthetic owner",
      userEmail: "owner@example.invalid",
      participantId: null,
      permission: "owner",
      displayName: null,
      colorKey: null,
      profileSlot: null,
    };
    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      month = date.slice(0, 7);
    const settings = {
      businessName: "Published salon name",
      description: "Synthetic qualification only",
      location: "",
      publicEnabled: true,
      leadMinutes: 0,
      advanceDays: 30,
      slotMinutes: 15,
      cancellationHours: 0,
    };
    const menu = {
      name: "Synthetic cut",
      description: "",
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      priceMinor: 5000,
      currency: "NZD",
      active: true,
      bookable: true,
    };
    await sql.transaction([
      sql`INSERT INTO calendars(id,name,calendar_type,timezone) VALUES(${calendarId},'Private internal workspace','salon_bookings','UTC')`,
      sql`INSERT INTO calendar_memberships(id,calendar_id,user_id,permission) VALUES(${ownerMembership},${calendarId},${ownerId},'owner')`,
    ]);
    await mutateSalon(session, "saveSettings", settings);
    const ownerProfile = await mutateSalon(session, "addSelf", {
      displayName: "Synthetic owner practitioner",
      bio: "",
      kind: "staff",
    });
    const invite = await mutateSalon(session, "createInvite", {
      role: "practitioner",
      displayName: "Synthetic assigned practitioner",
      kind: "contractor",
    });
    assert.equal(
      await redeemSalonInvitation(
        hashToken(normalizeInviteCode(invite.code!)),
        practitionerUser,
      ),
      calendarId,
    );
    const service = await mutateSalon(session, "saveService", menu);
    const loaded = await loadSalon(session, date),
      assigned = loaded.practitioners.find((p) => p.id !== ownerProfile.id)!;
    for (const profile of loaded.practitioners) {
      await mutateSalon(session, "savePractitioner", {
        id: profile.id,
        displayName: profile.displayName,
        bio: profile.bio,
        kind: profile.kind,
        role: profile.role,
        active: true,
        bookable: true,
      });
      await mutateSalon(session, "saveEligibility", {
        practitionerId: profile.id,
        serviceIds: [service.id!],
      });
      await mutateSalon(session, "saveHours", {
        practitionerId: profile.id,
        hours: [
          {
            weekday: new Date(date + "T12:00:00Z").getUTCDay(),
            startMinute: 0,
            endMinute: 1440,
          },
        ],
      });
    }
    const expectedTerms = {
      serviceName: menu.name,
      durationMinutes: menu.durationMinutes,
      priceMinor: menu.priceMinor,
      currency: menu.currency,
      cancellationHours: settings.cancellationHours,
    };
    const payload = (provider: string, hour: number) => ({
      requestId: randomUUID(),
      practitionerId: provider,
      serviceId: service.id!,
      start: `${date}T${String(hour).padStart(2, "0")}:00:00Z`,
      clientName: "Synthetic client",
      clientEmail: "client@example.invalid",
      clientPhone: "",
      expectedTerms,
    });
    const own = await bookPublicSalon(
      { id: client },
      calendarId,
      payload(assigned.id, 9),
    );
    const manual = await mutateSalon(session, "book", {
      ...payload(assigned.id, 11),
      notes: "Private salon note",
    });
    const other = await bookPublicSalon(
      { id: otherClient },
      calendarId,
      payload(ownerProfile.id!, 14),
    );
    const load = (user: string) =>
      loadPersonalData(user, { month, timezone: "UTC" }, (query, parameters) =>
        sql.query(query, parameters),
      );
    await t.test(
      "client-only access projects own appointment and published business identity",
      async () => {
        const data = await load(client);
        assert.deepEqual(
          data.items.map((i) => i.sourceId),
          [own.id],
        );
        assert.equal(data.sources[0].name, "Published salon name");
        assert.equal(data.items[0].sourceTarget, "appointment");
        assert.doesNotMatch(
          JSON.stringify(data),
          /Private internal workspace|client@example.invalid|Private salon note/,
        );
        const memberships =
          await sql`SELECT count(*)::int AS count FROM calendar_memberships WHERE user_id=${client}`;
        assert.equal(memberships[0].count, 0);
      },
    );
    await t.test(
      "assigned practitioner sees own appointments while authorship never implies participation",
      async () => {
        const data = await load(practitionerUser);
        assert.deepEqual(
          data.items.map((i) => i.sourceId).sort(),
          [own.id, manual.id].sort(),
        );
        const ownerData = await load(ownerId);
        assert.deepEqual(
          ownerData.items.map((i) => i.sourceId),
          [other.id],
        );
        assert.deepEqual((await load(outsider)).sources, []);
      },
    );
    await t.test(
      "public withdrawal does not remove private existing-client management",
      async () => {
        await mutateSalon(session, "saveSettings", {
          ...settings,
          publicEnabled: false,
        });
        assert.deepEqual(
          (await load(client)).items.map((i) => i.sourceId),
          [own.id],
        );
        await changeOwnAppointment({ id: client }, "cancel", {
          id: own.id!,
          version: 1,
        });
        assert.deepEqual((await load(client)).items, []);
      },
    );
  },
);
