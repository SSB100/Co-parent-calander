import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { neon } from "@neondatabase/serverless";
import { loadPersonalData } from "../lib/personal/service";

const connection = process.env.PERSONAL_TEST_DATABASE_URL;
/** Synthetic, fresh fixtures on the designated isolated branch only. No deletion. */
test("Personal source isolation and actual database projection", { skip: !connection, timeout: 600000 }, async (t) => {
  assert.equal(new URL(connection!).hostname, "ep-billowing-hill-a7v4eaar-pooler.ap-southeast-2.aws.neon.tech");
  const sql = neon(connection!);
  const user = randomUUID(), other = randomUUID(), missing = randomUUID();
  const cp = randomUUID(), staff = randomUUID(), fac = randomUUID(), social = randomUUID(), archived = randomUUID();
  const cpMember = randomUUID(), staffMember = randomUUID(), facMember = randomUUID(), socialMember = randomUUID();
  const parent = randomUUID(), otherParent = randomUUID(), child = randomUUID();
  const employee = randomUUID(), otherEmployee = randomUUID(), publication = randomUUID();
  const resource = randomUUID(), ownBooking = randomUUID(), otherBooking = randomUUID();
  const going = randomUUID(), maybe = randomUUID(), unassigned = randomUUID(), cancelled = randomUUID();
  const task = randomUUID(), foreignTask = randomUUID(), expense = randomUUID(), paidExpense = randomUUID();
  const date = new Date(Date.now() + 7*86400000).toISOString().slice(0,10), month = date.slice(0,7);
  await sql.transaction([
    sql`INSERT INTO calendars(id,name,calendar_type,timezone) VALUES(${cp},'Personal synthetic parenting','co_parenting','UTC'),(${staff},'Personal synthetic staff','staff_rosters','UTC'),(${fac},'Personal synthetic facilities','shared_facilities','UTC'),(${social},'Personal synthetic group','social_groups','UTC'),(${archived},'Personal synthetic archived','social_groups','UTC')`,
    sql`INSERT INTO participants(id,calendar_id,display_name,color_key,profile_slot) VALUES(${parent},${cp},'Synthetic A','coral','parent_one'),(${otherParent},${cp},'Synthetic B','teal','parent_two')`,
    sql`INSERT INTO calendar_memberships(id,calendar_id,user_id,permission,participant_id) VALUES(${cpMember},${cp},${user},'owner',${parent}),(${randomUUID()},${cp},${other},'editor',${otherParent}),(${staffMember},${staff},${user},'owner',NULL),(${randomUUID()},${staff},${other},'viewer',NULL),(${facMember},${fac},${user},'owner',NULL),(${randomUUID()},${fac},${other},'editor',NULL),(${socialMember},${social},${user},'owner',NULL),(${randomUUID()},${social},${other},'editor',NULL),(${randomUUID()},${archived},${user},'owner',NULL)`,
    sql`INSERT INTO children(id,calendar_id,display_name) VALUES(${child},${cp},'Synthetic child')`,
    sql`INSERT INTO parenting_assignments(calendar_id,child_id,assignment_date,parent_id,afternoon_parent_id,handover_time) VALUES(${cp},${child},${date},${parent},${otherParent},'15:00')`,
    sql`INSERT INTO responsibilities(id,calendar_id,series_id,title,responsible_participant_id,due_date,due_time,created_by) VALUES(${task},${cp},${randomUUID()},'Own task',${parent},${date},'09:30',${parent}),(${foreignTask},${cp},${randomUUID()},'Other task',${otherParent},${date},NULL,${otherParent})`,
    sql`INSERT INTO expenses(id,calendar_id,expense_date,title,amount_cents,paid_by_participant_id,due_date,settlement_status) VALUES(${expense},${cp},${date},'Review own recorded share',1000,${otherParent},${date},'outstanding'),(${paidExpense},${cp},${date},'Already paid share',1000,${otherParent},${date},'outstanding')`,
    sql`INSERT INTO expense_shares(expense_id,participant_id,share_cents,paid_cents) VALUES(${expense},${parent},500,0),(${paidExpense},${parent},500,500)`,
    sql`INSERT INTO staff_roster_members(id,calendar_id,membership_id,display_name,access_role) VALUES(${employee},${staff},${staffMember},'Synthetic own employee','owner'),(${otherEmployee},${staff},NULL,'Synthetic other employee','staff')`,
    sql`INSERT INTO staff_roster_week_publications(id,calendar_id,week_start) VALUES(${publication},${staff},${date})`,
    sql`INSERT INTO staff_roster_published_shifts(publication_id,member_id,shift_date,start_time,end_time) VALUES(${publication},${employee},${date},'10:00','11:00'),(${publication},${otherEmployee},${date},'12:00','13:00')`,
    sql`INSERT INTO staff_roster_shifts(calendar_id,member_id,shift_date,start_time,end_time) VALUES(${staff},${employee},${date},'14:00','15:00')`,
    sql`INSERT INTO facility_resources(id,calendar_id,name) VALUES(${resource},${fac},'QA resource')`,
    sql`INSERT INTO facility_bookings(id,calendar_id,resource_id,user_id,updated_by_user_id,request_key,title,start_at,end_at,status) VALUES(${ownBooking},${fac},${resource},${user},${user},${randomUUID()},'Own booking',${date+'T10:00:00Z'},${date+'T11:00:00Z'},'confirmed'),(${otherBooking},${fac},${resource},${other},${other},${randomUUID()},'Other booking',${date+'T12:00:00Z'},${date+'T13:00:00Z'},'confirmed')`,
    sql`INSERT INTO social_events(id,calendar_id,created_by_user_id,updated_by_user_id,title,start_at,end_at,cancelled) VALUES(${going},${social},${other},${other},'Going event',${date+'T15:00:00Z'},${date+'T16:00:00Z'},false),(${maybe},${social},${other},${other},'Maybe event',${date+'T17:00:00Z'},${date+'T18:00:00Z'},false),(${unassigned},${social},${other},${other},'Other event',${date+'T19:00:00Z'},${date+'T20:00:00Z'},false),(${cancelled},${social},${other},${other},'Cancelled event',${date+'T21:00:00Z'},${date+'T22:00:00Z'},false)`,
    sql`INSERT INTO social_rsvps(calendar_id,event_id,user_id,response) VALUES(${social},${going},${user},'going'),(${social},${maybe},${user},'maybe'),(${social},${cancelled},${user},'going')`,
    sql`UPDATE social_events SET cancelled=true WHERE id=${cancelled}`,
    sql`UPDATE calendars SET archived_at=now() WHERE id=${archived}`,
  ]);
  const load = (source?: string, account = user) => loadPersonalData(account, { month, timezone: 'UTC', source }, (query, parameters) => sql.query(query, parameters));
  await t.test("only assigned published shifts and own facility bookings appear", async () => {
    const data = await load();
    assert.equal(data.items.filter(i=>i.kind==='shift').length,1);
    assert.deepEqual(data.items.filter(i=>i.kind==='facility').map(i=>i.sourceId),[ownBooking]);
    assert.equal(data.sources.some(s=>s.id===archived),false);
    assert.equal(data.items.some(i=>i.sourceId===otherBooking),false);
  });
  await t.test("Going and Maybe are distinct, unrelated and cancelled events stay out", async () => {
    const data=await load(social);
    assert.deepEqual(data.items.map(i=>[i.sourceId,i.state]).sort(),[[going,'confirmed'],[maybe,'tentative']].sort());
    assert.equal(data.attention.length,0,'Membership/ownership alone does not imply organising every event');
  });
  await t.test("care, assigned deadlines and unpaid personal share stay scoped to parent link", async () => {
    const data=await load(cp);
    assert.equal(data.items.filter(i=>i.kind==='care').length,1);assert.equal(data.items.filter(i=>i.kind==='handover').length,1);
    assert.deepEqual(data.attention.map(i=>i.sourceId).sort(),[task,expense].sort());
    assert.match(data.attention.find(i=>i.sourceId===task)!.detail,/09:30/);
  });
  await t.test("unrelated identity and archived calendar cannot project data", async () => {
    assert.deepEqual((await load(undefined,missing)).items,[]);
    await assert.rejects(load(archived));
    await assert.rejects(load(randomUUID()));
  });
  await t.test("deactivated staff and cancelled bookings disappear without source copies", async () => {
    await sql.transaction([sql`UPDATE staff_roster_members SET active=false WHERE id=${employee}`,sql`UPDATE facility_bookings SET status='cancelled',updated_by_user_id=${user} WHERE id=${ownBooking}`]);
    const data=await load();assert.equal(data.items.filter(i=>i.kind==='shift'||i.kind==='facility').length,0);
  });
  await t.test("removed membership and unlinked parent disappear on refresh", async () => {
    // Reversible changes affect only these freshly created synthetic fixtures.
    await sql`UPDATE calendar_memberships SET participant_id=NULL WHERE id=${cpMember}`;
    assert.deepEqual((await load(cp)).items,[]);assert.deepEqual((await load(cp)).attention,[]);
    await sql`UPDATE calendars SET archived_at=now() WHERE id=${social}`;
    await assert.rejects(load(social));
  });
});
