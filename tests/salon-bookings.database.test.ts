import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { neon } from "@neondatabase/serverless";
import { salonDefaults, type SalonPractitioner, type SalonSettings } from "../lib/salon/contracts";
import { bookPublicSalon, changeOwnAppointment, loadOwnAppointment, loadPublicSalon, loadSalon, loadSalonAppointmentSlots, loadSalonSlots, mutateSalon, redeemSalonInvitation, type SalonSession } from "../lib/salon/service";
import { hashToken } from "../lib/security/tokens";
import { normalizeInviteCode } from "../lib/security/invites";

const connection = process.env.SALON_TEST_DATABASE_URL;
const EXPECTED_HOST = "ep-billowing-hill-a7v4eaar-pooler.ap-southeast-2.aws.neon.tech";
test("Salon isolated database qualification: authority, privacy, timing, invitations and concurrency", { skip: !connection }, async t => {
  assert.equal(new URL(connection!).hostname, EXPECTED_HOST, "Salon database tests run only on the isolated 0035 qualification branch");
  process.env.APP_DATABASE_URL = connection;
  const sql = neon(connection!);
  const calendarId = randomUUID(), foreignId = randomUUID();
  const makeSession = (permission: "owner" | "editor" | "viewer", calendar = calendarId, userId = randomUUID()): SalonSession => ({ calendarId: calendar, membershipId: randomUUID(), userId, calendarName: "Synthetic Salon qualification", calendarType: "salon_bookings", calendarTimezone: "Pacific/Auckland", permission, userName: "Synthetic", userEmail: "salon-test@example.invalid", participantId: null, displayName: null, colorKey: null, profileSlot: null });
  const owner = makeSession("owner"), foreign = makeSession("owner", foreignId), stray = makeSession("editor"), viewer = makeSession("viewer");
  const client = { id: randomUUID() }, otherClient = { id: randomUUID() };
  const parentFingerprint = async () => sql`SELECT 'calendars' AS source,count(*)::int AS count,md5(COALESCE(string_agg(row_to_json(c)::text,'' ORDER BY c.id),'')) AS fingerprint FROM calendars c WHERE calendar_type='co_parenting'
    UNION ALL SELECT 'memberships',count(*)::int,md5(COALESCE(string_agg(row_to_json(m)::text,'' ORDER BY m.id),'')) FROM calendar_memberships m JOIN calendars c ON c.id=m.calendar_id WHERE c.calendar_type='co_parenting'
    UNION ALL SELECT 'participants',count(*)::int,md5(COALESCE(string_agg(row_to_json(p)::text,'' ORDER BY p.id),'')) FROM participants p JOIN calendars c ON c.id=p.calendar_id WHERE c.calendar_type='co_parenting'`;
  const coParentBefore = await parentFingerprint();
  await sql.transaction([
    sql`INSERT INTO calendars(id,name,calendar_type,timezone) VALUES(${calendarId},'Synthetic Salon qualification','salon_bookings','Pacific/Auckland'),(${foreignId},'Synthetic foreign Salon','salon_bookings','Pacific/Auckland')`,
    ...[owner, foreign, stray, viewer].map(s => sql`INSERT INTO calendar_memberships(id,calendar_id,user_id,permission) VALUES(${s.membershipId},${s.calendarId},${s.userId},${s.permission}::calendar_permission)`),
  ]);
  let settings: SalonSettings = { ...salonDefaults, businessName: "Synthetic Salon", leadMinutes: 0, cancellationHours: 0 };
  await mutateSalon(owner, "saveSettings", settings);
  const ownerProfile = await mutateSalon(owner, "addSelf", { displayName: "Synthetic owner", bio: "Business owner", kind: "staff" });
  const ownerPractitionerId = ownerProfile.id!;
  async function invite(role: "manager" | "practitioner", actor = owner, kind: "staff" | "contractor" = "staff") {
    const result = await mutateSalon(actor, "createInvite", { role, displayName: `Synthetic ${role}`, kind });
    const userId = randomUUID();
    assert.equal(await redeemSalonInvitation(hashToken(normalizeInviteCode(result.code!)), userId), calendarId);
    const session = makeSession("editor", calendarId, userId);
    const memberships = await sql`SELECT id FROM calendar_memberships WHERE calendar_id=${calendarId} AND user_id=${userId}`;
    session.membershipId = memberships[0].id;
    return session;
  }
  const manager = await invite("manager"), practitioner = await invite("practitioner", manager, "contractor"), otherPractitioner = await invite("practitioner");
  let team = (await loadSalon(owner)).practitioners;
  const practitionerId = team.find(p => p.id !== ownerPractitionerId && p.kind === "contractor")!.id;
  const otherPractitionerId = (await loadSalon(otherPractitioner)).ownPractitionerId!;
  const profileData = (p: SalonPractitioner, changes: Partial<SalonPractitioner> = {}) => ({ id: p.id, displayName: p.displayName, bio: p.bio, kind: p.kind, role: p.role, active: p.active, bookable: p.bookable, ...changes });
  const serviceInput = { name: "Synthetic cut", description: "A synthetic one-hour service", durationMinutes: 60, bufferBeforeMinutes: 15, bufferAfterMinutes: 15, priceMinor: 7500, currency: "NZD", active: true, bookable: true };
  const serviceId = (await mutateSalon(owner, "saveService", serviceInput)).id!;
  const hours = Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 18 * 60 }));
  for (const id of [ownerPractitionerId, practitionerId, otherPractitionerId]) {
    await mutateSalon(owner, "saveEligibility", { practitionerId: id, serviceIds: [serviceId] });
    await mutateSalon(owner, "saveHours", { practitionerId: id, hours });
    await mutateSalon(owner, "savePractitioner", profileData(team.find(p => p.id === id)!, { bookable: true }));
  }
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const laterDate = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
  const bookInput = (start: string, provider = practitionerId, key = randomUUID()) => ({ requestId: key, practitionerId: provider, serviceId, start, clientName: "Synthetic client", clientEmail: "client@example.invalid", clientPhone: "+64000000000", expectedTerms: { serviceName: serviceInput.name, durationMinutes: serviceInput.durationMinutes, priceMinor: serviceInput.priceMinor, currency: serviceInput.currency, cancellationHours: settings.cancellationHours } });
  const firstSlot = async (provider = practitionerId, day = date) => (await loadSalonSlots(owner, day, serviceId, provider))[0].start;
  const successCount = (results: PromiseSettledResult<unknown>[]) => results.filter(result => result.status === "fulfilled").length;
  let ownBookingId = "";

  await t.test("publication defaults off; generic editor/viewer/stale owner cannot self-grant or organise", async () => {
    await assert.rejects(loadPublicSalon(calendarId));
    await assert.rejects(loadSalon(stray)); await assert.rejects(loadSalon(viewer));
    await assert.rejects(mutateSalon(stray, "addSelf", { displayName: "Forged" }));
    await assert.rejects(mutateSalon({ ...stray, permission: "owner" }, "saveSettings", settings));
    await assert.rejects(mutateSalon(practitioner, "saveService", serviceInput));
    await assert.rejects(mutateSalon(manager, "createInvite", { role: "manager", displayName: "No authority" }));
    await assert.rejects(mutateSalon(manager, "saveSettings", { ...settings, publicEnabled: true }));
    await assert.rejects(mutateSalon(manager, "savePractitioner", profileData(team.find(p => p.id === practitionerId)!, { role: "manager" })));
    const outside = await mutateSalon(foreign, "addSelf", { displayName: "Other salon" });
    await assert.rejects(mutateSalon(owner, "saveEligibility", { practitionerId: outside.id, serviceIds: [serviceId] }));
    await assert.rejects(mutateSalon(practitioner, "saveHours", { practitionerId: otherPractitionerId, hours }));
    assert.equal((await loadSalon(practitioner)).practitioners.length, 1);
    settings = { ...settings, publicEnabled: true }; await mutateSalon(owner, "saveSettings", settings);
  });

  await t.test("anonymous projection exposes only allowlisted names/services/slots, never clients or contacts", async () => {
    const page = await loadPublicSalon(calendarId, date, serviceId, practitionerId);
    assert.ok(page.slots.length > 0);
    assert.deepEqual(Object.keys(page).sort(), ["calendarId", "businessName", "description", "location", "timezone", "date", "cancellationHours", "leadMinutes", "advanceDays", "services", "practitioners", "slots"].sort());
    assert.deepEqual(Object.keys(page.practitioners[0]).sort(), ["id", "displayName", "bio", "serviceIds"].sort());
    assert.ok(!JSON.stringify(page).includes("userId")); assert.ok(!JSON.stringify(page).includes("email")); assert.ok(!JSON.stringify(page).includes("membership"));
    const created = await bookPublicSalon(client, calendarId, bookInput(page.slots[0].start)); ownBookingId = created.id!;
    assert.equal((await sql`SELECT count(*)::int AS n FROM calendar_memberships WHERE calendar_id=${calendarId} AND user_id=${client.id}`)[0].n, 0);
    const own = await loadOwnAppointment(client.id, ownBookingId, date);
    assert.equal(own.businessName, "Synthetic Salon"); assert.notEqual(own.businessName, owner.calendarName);
    assert.equal(typeof own.appointment.start, "string"); assert.equal(typeof own.appointment.end, "string");
    assert.equal(own.appointment.ownClient, true); assert.equal("notes" in own.appointment, false);
    await assert.rejects(loadOwnAppointment(otherClient.id, ownBookingId));
    await assert.rejects(changeOwnAppointment(otherClient, "cancel", { id: ownBookingId, version: 1 }));
    assert.ok((await loadSalon(owner, date)).appointments.some(a => a.id === ownBookingId && a.clientEmail === "client@example.invalid"));
    assert.ok((await loadSalon(manager, date)).appointments.some(a => a.id === ownBookingId));
    assert.ok((await loadSalon(practitioner, date)).appointments.some(a => a.id === ownBookingId));
    assert.ok(!(await loadSalon(otherPractitioner, date)).appointments.some(a => a.id === ownBookingId));
  });

  await t.test("manual email matching never claims a guest; client payload cannot inject identity", async () => {
    const input = { ...bookInput(await firstSlot(otherPractitionerId), otherPractitionerId), notes: "Private manual appointment note" };
    const created = await mutateSalon(owner, "book", input);
    assert.equal((await sql`SELECT client_user_id FROM salon_appointments WHERE id=${created.id}`)[0].client_user_id, null);
    await assert.rejects(loadOwnAppointment(client.id, created.id!));
    await assert.rejects(bookPublicSalon(client, calendarId, { ...bookInput(await firstSlot()), clientUserId: otherClient.id }));
    await assert.rejects(mutateSalon(owner, "book", { ...input, requestId: randomUUID(), clientUserId: client.id }));
    await assert.rejects(mutateSalon(otherPractitioner, "cancel", { id: ownBookingId, version: 1 }));
  });

  await t.test("table guards reject raw overlapping appointments, forged changes and conflicting time blocks", async () => {
    await assert.rejects(sql`INSERT INTO salon_appointments SELECT (jsonb_populate_record(NULL::salon_appointments,
      to_jsonb(a)||jsonb_build_object('id',${randomUUID()}::uuid,'request_key',${randomUUID()}::uuid))).*
      FROM salon_appointments a WHERE a.id=${ownBookingId}`);
    await assert.rejects(sql`UPDATE salon_appointments SET status='cancelled',version=version+1,updated_by_user_id=${otherClient.id} WHERE id=${ownBookingId}`);
    await assert.rejects(sql`UPDATE salon_appointments SET service_name='Rewritten history',version=version+1,updated_by_user_id=${owner.userId} WHERE id=${ownBookingId}`);
    await assert.rejects(sql`INSERT INTO salon_time_blocks(calendar_id,practitioner_id,start_at,end_at,created_by_user_id,updated_by_user_id)
      SELECT calendar_id,practitioner_id,start_at,end_at,${owner.userId},${owner.userId} FROM salon_appointments WHERE id=${ownBookingId}`);
    assert.equal((await loadOwnAppointment(client.id, ownBookingId)).appointment.version, 1);
  });

  await t.test("idempotent create retries return one immutable appointment; reused key with changed terms fails", async () => {
    const input = bookInput(await firstSlot());
    const retries = await Promise.all([bookPublicSalon(client, calendarId, input), bookPublicSalon(client, calendarId, input)]);
    assert.equal(retries[0].id, retries[1].id);
    await assert.rejects(bookPublicSalon(client, calendarId, { ...input, clientName: "Changed client" }));
    assert.equal((await sql`SELECT count(*)::int AS n FROM salon_appointments WHERE calendar_id=${calendarId} AND request_key=${input.requestId}`)[0].n, 1);
  });

  await t.test("concurrent reservations have one winner; busy buffers and cross-practitioner independence hold", async () => {
    const start = await firstSlot();
    const results = await Promise.allSettled([bookPublicSalon(client, calendarId, bookInput(start)), bookPublicSalon(otherClient, calendarId, bookInput(start))]);
    assert.equal(successCount(results), 1);
    await assert.rejects(bookPublicSalon(client, calendarId, bookInput(new Date(Date.parse(start) + 60 * 60000).toISOString())));
    await bookPublicSalon(client, calendarId, bookInput(start, ownerPractitionerId));
    const slots = await loadPublicSalon(calendarId, date, serviceId, practitionerId);
    assert.ok(!slots.slots.some(slot => slot.start === start));
  });

  await t.test("failed reschedule retains original slot; concurrent stale-version edits have one winner", async () => {
    const own = await loadOwnAppointment(client.id, ownBookingId, laterDate);
    const originalStart = own.appointment.start;
    const taken = await firstSlot(ownerPractitionerId, laterDate);
    await bookPublicSalon(otherClient, calendarId, bookInput(taken));
    await assert.rejects(changeOwnAppointment(client, "reschedule", { id: ownBookingId, version: 1, start: taken }));
    assert.equal((await loadOwnAppointment(client.id, ownBookingId)).appointment.start, originalStart);
    const available = (await loadOwnAppointment(client.id, ownBookingId, laterDate)).slots[0].start;
    assert.equal(successCount(await Promise.allSettled([changeOwnAppointment(client, "reschedule", { id: ownBookingId, version: 1, start: available }), changeOwnAppointment(client, "cancel", { id: ownBookingId, version: 1 })])), 1);
    const latest = await loadOwnAppointment(client.id, ownBookingId);
    assert.equal(latest.appointment.version, 2);
  });

  await t.test("menu edits retain booked duration, buffers, price, service name and cancellation policy", async () => {
    const created = await bookPublicSalon(client, calendarId, bookInput(await firstSlot(otherPractitionerId, laterDate), otherPractitionerId));
    await mutateSalon(owner, "saveService", { ...serviceInput, id: serviceId, name: "New menu name", durationMinutes: 90, bufferBeforeMinutes: 30, priceMinor: 9900 });
    const existing = await loadOwnAppointment(client.id, created.id!, laterDate);
    assert.equal(existing.appointment.serviceName, "Synthetic cut"); assert.equal(existing.appointment.durationMinutes, 60); assert.equal(existing.appointment.bufferBeforeMinutes, 15); assert.equal(existing.appointment.priceMinor, 7500);
    const slots = await loadSalonAppointmentSlots(owner, created.id!, laterDate);
    assert.ok(slots.length); assert.equal(Date.parse(slots[0].end) - Date.parse(slots[0].start), 60 * 60000);
    const changed = await changeOwnAppointment(client, "reschedule", { id: created.id, version: 1, start: existing.slots.find(slot => Date.parse(slot.start) !== Date.parse(existing.appointment.start))!.start });
    assert.equal(changed.version, 2);
    assert.equal((await loadOwnAppointment(client.id, created.id!)).appointment.durationMinutes, 60);
    await mutateSalon(owner, "saveService", { ...serviceInput, id: serviceId });
  });

  await t.test("confirmation terms cannot silently change, and original idempotent retries survive later menu edits", async () => {
    const proposal = bookInput(await firstSlot(ownerPractitionerId, laterDate), ownerPractitionerId);
    await mutateSalon(owner, "saveService", { ...serviceInput, id: serviceId, durationMinutes: 90, priceMinor: 9900 });
    await assert.rejects(bookPublicSalon(client, calendarId, proposal), (error: unknown) => !!error && typeof error === "object" && "constraint" in error && error.constraint === "salon_terms");
    await assert.rejects(mutateSalon(owner, "book", { ...proposal, notes: "Synthetic confirmation" }));
    await mutateSalon(owner, "saveService", { ...serviceInput, id: serviceId });
    await mutateSalon(owner, "saveSettings", { ...settings, cancellationHours: 48 });
    await assert.rejects(bookPublicSalon(client, calendarId, proposal), (error: unknown) => !!error && typeof error === "object" && "constraint" in error && error.constraint === "salon_terms");
    await mutateSalon(owner, "saveSettings", settings);
    const created = await bookPublicSalon(client, calendarId, proposal);
    await mutateSalon(owner, "saveService", { ...serviceInput, id: serviceId, name: "Changed after booking", priceMinor: 9900 });
    const retry = await bookPublicSalon(client, calendarId, proposal);
    assert.equal(retry.id, created.id);
    const stored = await loadOwnAppointment(client.id, created.id!);
    assert.equal(stored.appointment.serviceName, proposal.expectedTerms.serviceName);
    assert.equal(stored.appointment.priceMinor, proposal.expectedTerms.priceMinor);
    await mutateSalon(owner, "saveService", { ...serviceInput, id: serviceId });
    await changeOwnAppointment(client, "cancel", { id: created.id, version: 1 });
  });

  await t.test("public disabled hides new booking, while existing authenticated own booking remains manageable", async () => {
    const created = await bookPublicSalon(client, calendarId, bookInput(await firstSlot(ownerPractitionerId, laterDate), ownerPractitionerId));
    await mutateSalon(owner, "saveSettings", { ...settings, publicEnabled: false });
    await assert.rejects(loadPublicSalon(calendarId, date, serviceId));
    await assert.rejects(bookPublicSalon(otherClient, calendarId, bookInput(await firstSlot())));
    const existing = await loadOwnAppointment(client.id, created.id!, laterDate);
    assert.ok(existing.slots.length > 0);
    await changeOwnAppointment(client, "reschedule", { id: created.id, version: 1, start: existing.slots.find(slot => Date.parse(slot.start) !== Date.parse(existing.appointment.start))!.start });
    await changeOwnAppointment(client, "cancel", { id: created.id, version: 2 });
    assert.equal((await loadOwnAppointment(client.id, created.id!)).appointment.status, "cancelled");
    await mutateSalon(owner, "saveSettings", settings);
  });

  await t.test("client cancellation cutoff is snapshotted, cannot be bypassed by settings edits; staff can manage", async () => {
    await mutateSalon(owner, "saveSettings", { ...settings, cancellationHours: 720 });
    const proposal = bookInput(await firstSlot(ownerPractitionerId, laterDate), ownerPractitionerId);
    const created = await bookPublicSalon(client, calendarId, { ...proposal, expectedTerms: { ...proposal.expectedTerms, cancellationHours: 720 } });
    await mutateSalon(owner, "saveSettings", settings);
    assert.equal((await loadOwnAppointment(client.id, created.id!)).appointment.canCancel, false);
    await assert.rejects(changeOwnAppointment(client, "cancel", { id: created.id, version: 1 }));
    await mutateSalon(owner, "cancel", { id: created.id, version: 1 });
  });

  await t.test("time off cannot overlap confirmed visits; scope and concurrent reservation rechecks are serialized", async () => {
    const start = await firstSlot(ownerPractitionerId, laterDate);
    const end = new Date(Date.parse(start) + 60 * 60000).toISOString();
    const outcomes = await Promise.allSettled([bookPublicSalon(client, calendarId, bookInput(start, ownerPractitionerId)), mutateSalon(owner, "saveTimeBlock", { practitionerId: ownerPractitionerId, start, end, reason: "Private synthetic time off", active: true })]);
    assert.equal(successCount(outcomes), 1);
    const published = await loadPublicSalon(calendarId, laterDate, serviceId, ownerPractitionerId);
    assert.ok(!JSON.stringify(published).includes("Private synthetic")); assert.ok(!published.slots.some(slot => slot.start === start));
    await assert.rejects(mutateSalon(practitioner, "saveTimeBlock", { practitionerId: ownerPractitionerId, start, end, active: true }));
  });

  await t.test("revoked and demoted-inviter invitations cannot redeem; redemption and revocation are atomic", async () => {
    const revoked = await mutateSalon(owner, "createInvite", { role: "practitioner", displayName: "Revoked synthetic" });
    await mutateSalon(owner, "revokeInvite", { id: revoked.id });
    assert.equal(await redeemSalonInvitation(hashToken(normalizeInviteCode(revoked.code!)), randomUUID()), undefined);
    const pending = await mutateSalon(manager, "createInvite", { role: "practitioner", displayName: "Old manager invitation" });
    team = (await loadSalon(owner)).practitioners;
    const managerProfile = team.find(p => p.role === "manager")!;
    await mutateSalon(owner, "savePractitioner", profileData(managerProfile, { role: "practitioner" }));
    assert.equal(await redeemSalonInvitation(hashToken(normalizeInviteCode(pending.code!)), randomUUID()), undefined);
    await assert.rejects(mutateSalon({ ...manager, permission: "owner" }, "saveSettings", settings));
    const concurrent = await mutateSalon(owner, "createInvite", { role: "practitioner", displayName: "Racing invitation" });
    const newUser = randomUUID();
    await Promise.allSettled([redeemSalonInvitation(hashToken(normalizeInviteCode(concurrent.code!)), newUser), mutateSalon(owner, "revokeInvite", { id: concurrent.id })]);
    const status = (await sql`SELECT use_count,revoked_at FROM calendar_invites WHERE id=${concurrent.id}`)[0];
    const joined = (await sql`SELECT count(*)::int AS n FROM calendar_memberships WHERE calendar_id=${calendarId} AND user_id=${newUser}`)[0].n;
    assert.equal(joined, status.use_count); assert.ok(status.use_count === 0 || status.use_count === 1);
    assert.equal(await redeemSalonInvitation(hashToken(normalizeInviteCode(concurrent.code!)), randomUUID()), undefined);
  });

  await t.test("membership downgrade immediately removes staff authority and public bookability without erasing history", async () => {
    await sql`UPDATE calendar_memberships SET permission='viewer' WHERE id=${practitioner.membershipId} AND calendar_id=${calendarId}`;
    await assert.rejects(loadSalon(practitioner));
    await assert.rejects(mutateSalon(practitioner, "saveHours", { practitionerId, hours }));
    assert.ok(!(await loadPublicSalon(calendarId, date, serviceId)).practitioners.some(p => p.id === practitionerId));
    await assert.rejects(bookPublicSalon(client, calendarId, bookInput(new Date(Date.now() + 9 * 86400000).toISOString())));
    assert.ok((await loadSalon(owner, date)).appointments.some(a => a.practitionerId === practitionerId));
  });

  await t.test("new tables inherit existing app privileges and live co-parent records are unchanged", async () => {
    const grants = await sql`SELECT table_name FROM information_schema.role_table_grants WHERE grantee='covie_app' AND table_name LIKE 'salon_%' AND privilege_type='SELECT' ORDER BY table_name`;
    assert.equal(grants.length, 9);
    assert.deepEqual(await parentFingerprint(), coParentBefore);
    assert.equal((await sql`SELECT count(*)::int AS n FROM participants WHERE calendar_id IN (${calendarId},${foreignId})`)[0].n, 0);
  });

  await t.test("shared-table Salon triggers leave fresh synthetic co-parent calendar/profile/child/sync records unchanged", async () => {
    const fixtureCalendar = randomUUID(), fixtureOwner = randomUUID(), fixtureMembership = randomUUID(), fixtureProfile = randomUUID(), fixtureChild = randomUUID(), fixtureSync = randomUUID();
    const fixtureGuest = randomUUID(), fixtureGuestMembership = randomUUID(), fixtureInvite = randomUUID();
    await sql.transaction([
      sql`INSERT INTO calendars(id,name,calendar_type,timezone) VALUES(${fixtureCalendar},'Synthetic Salon co-parent trigger qualification','co_parenting','Pacific/Auckland')`,
      sql`INSERT INTO participants(id,calendar_id,display_name,color_key,profile_slot) VALUES(${fixtureProfile},${fixtureCalendar},'Synthetic parent','coral','parent_one')`,
      sql`INSERT INTO calendar_memberships(id,calendar_id,user_id,participant_id,permission) VALUES(${fixtureMembership},${fixtureCalendar},${fixtureOwner},${fixtureProfile},'owner')`,
      sql`INSERT INTO children(id,calendar_id,display_name) VALUES(${fixtureChild},${fixtureCalendar},'Synthetic child')`,
      sql`INSERT INTO google_calendar_connections(id,calendar_id,membership_id,status,sync_parenting,sync_handovers,sync_shared_events) VALUES(${fixtureSync},${fixtureCalendar},${fixtureMembership},'reconnect_required',false,false,false)`,
    ]);
    const snapshot = async () => (await sql`SELECT jsonb_build_object(
      'calendar',(SELECT to_jsonb(c) FROM calendars c WHERE id=${fixtureCalendar}),
      'profile',(SELECT to_jsonb(p) FROM participants p WHERE id=${fixtureProfile}),
      'child',(SELECT to_jsonb(c) FROM children c WHERE id=${fixtureChild}),
      'sync',(SELECT to_jsonb(g) FROM google_calendar_connections g WHERE id=${fixtureSync}),
      'owner',(SELECT to_jsonb(m) FROM calendar_memberships m WHERE id=${fixtureMembership})
    ) AS value`)[0].value;
    const before = await snapshot();
    await sql.transaction([
      sql`INSERT INTO calendar_memberships(id,calendar_id,user_id,permission) VALUES(${fixtureGuestMembership},${fixtureCalendar},${fixtureGuest},'editor')`,
      sql`UPDATE calendar_memberships SET permission='viewer',updated_at=now() WHERE id=${fixtureGuestMembership} AND calendar_id=${fixtureCalendar}`,
      sql`INSERT INTO calendar_invites(id,calendar_id,code_hash,code_hint,permission,created_by_user_id,expires_at) VALUES(${fixtureInvite},${fixtureCalendar},${hashToken(randomUUID())},'TEST','editor',${fixtureOwner},now()+interval '1 day')`,
      sql`UPDATE calendar_invites SET revoked_at=now() WHERE id=${fixtureInvite} AND calendar_id=${fixtureCalendar}`,
    ]);
    assert.deepEqual(await snapshot(), before);
    const unchanged = await sql`SELECT (SELECT count(*)::int FROM participants WHERE calendar_id=${fixtureCalendar}) AS profiles,
      (SELECT count(*)::int FROM children WHERE calendar_id=${fixtureCalendar}) AS children,
      (SELECT count(*)::int FROM salon_practitioners WHERE calendar_id=${fixtureCalendar}) AS salon_profiles,
      (SELECT count(*)::int FROM salon_settings WHERE calendar_id=${fixtureCalendar}) AS salon_settings,
      (SELECT count(*)::int FROM salon_invite_roles WHERE calendar_id=${fixtureCalendar}) AS salon_invites`;
    assert.deepEqual(unchanged[0], { profiles: 1, children: 1, salon_profiles: 0, salon_settings: 0, salon_invites: 0 });
    assert.equal((await sql`SELECT participant_id FROM calendar_memberships WHERE id=${fixtureGuestMembership}`)[0].participant_id, null);
  });

});
