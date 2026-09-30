import test from "node:test";
import assert from "node:assert/strict";
import { canonicalPersonalItems, itemInPersonalMonth, normalisePersonalItem, personalCareItems, personalTimezone, personalWindow, type CareProjection } from "../lib/personal/model";
import { personalQueries, personalSourcesSql } from "../lib/personal/queries";
import { loadPersonalData, PersonalAccessError, type PersonalQuery } from "../lib/personal/service";
import { safeSourceDate, safeSourceRecord, sourceDestination } from "../lib/personal/source-navigation";
import type { PersonalItem } from "../lib/personal/contracts";

const calendarId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sourceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const source = { id: calendarId, name: "QA", type: "shared_facilities", timezone: "Pacific/Auckland" };
function item(overrides: Partial<PersonalItem> = {}): PersonalItem {
  return normalisePersonalItem({ calendarId, sourceId, kind: "facility", state: "confirmed", title: "QA booking", detail: "Room", date: "2026-10-01", endDate: "2026-10-01", start: "2026-09-30T23:00:00Z", end: "2026-10-01T00:00:00Z", timezone: "Pacific/Auckland", sourceTarget: "calendar", ...overrides });
}
test("month and timezone validation reject malformed and unbounded ranges", () => {
  assert.deepEqual(personalWindow("2028-02"), { first: "2028-02-01", next: "2028-03-01", last: "2028-02-29" });
  for (const month of ["2026-13", "0000-01", "2026-1", "2026-10;DROP"]) assert.throws(() => personalWindow(month));
  assert.equal(personalTimezone("Pacific/Auckland"), "Pacific/Auckland");
  assert.throws(() => personalTimezone("Nowhere/Invalid"));
});
test("timed projections use overview timezone and half-open midnight boundaries", () => {
  assert.equal(itemInPersonalMonth(item(), "2026-10", "Pacific/Auckland"), true);
  assert.equal(itemInPersonalMonth(item(), "2026-10", "America/Los_Angeles"), false);
  assert.equal(itemInPersonalMonth(item({ start: "2026-09-30T23:00:00Z", end: "2026-10-01T00:00:00Z" }), "2026-10", "UTC"), false);
  assert.equal(itemInPersonalMonth(item({ start: "2026-10-01T00:00:00Z", end: "2026-10-01T01:00:00Z" }), "2026-10", "UTC"), true);
});
test("date-only care remains source-local across UTC and overview timezone", () => {
  const care = item({ kind: "care", state: "background", start: null, end: null });
  assert.equal(itemInPersonalMonth(care, "2026-10", "America/Los_Angeles"), true);
});
test("canonical identity deduplicates source occurrences without collapsing similar events", () => {
  const a = item(), otherCalendar = item({ calendarId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
  assert.equal(canonicalPersonalItems([a, a, otherCalendar]).length, 2);
});
const care: CareProjection = { calendarId, timezone: "Pacific/Auckland", participantId: "parent-a", children: [{ id: "child", name: "Child" }], schedules: [], slots: [], scheduleChildren: [], manualAssignments: [{ id: "day", childId: "child", date: "2026-10-02", morningParentId: "parent-a", afternoonParentId: "parent-b", handoverTime: "15:30:00", handoverLocation: "private location", note: "private note" }] };
test("care is tied to own parent profile, handover time is explicit and private notes stay at source", () => {
  const result = personalCareItems(care, "2026-10");
  assert.equal(result.length, 2);
  assert.equal(result[0].state, "background");
  assert.equal(result[1].kind, "handover");
  assert.match(result[1].detail, /15:30/);
  assert.equal(result[1].end, null);
  assert.doesNotMatch(JSON.stringify(result), /private location|private note/);
  assert.deepEqual(personalCareItems({ ...care, participantId: "parent-c" }, "2026-10"), []);
  assert.deepEqual(personalCareItems({ ...care, children: [] }, "2026-10"), []);
});
test("recurring care keeps existing override precedence", () => {
  const result = personalCareItems({ ...care, schedules: [{ id: "rule", anchorDate: "2026-10-01", endDate: "2026-10-03" }], slots: Array.from({ length: 14 }, (_, slotIndex) => ({ scheduleId: "rule", slotIndex, morningParentId: "parent-b", afternoonParentId: "parent-b" })), scheduleChildren: [{ scheduleId: "rule", childId: "child" }] }, "2026-10");
  assert.equal(result.filter(row => row.kind === "care").length, 1);
  assert.equal(result[0].date, "2026-10-02");
});
test("empty account does not issue any source-domain reads or create memberships", async () => {
  let calls = 0;
  const data = await loadPersonalData("user", {}, async () => { calls++; return []; });
  assert.equal(calls, 1); assert.deepEqual(data.items, []); assert.deepEqual(data.sources, []);
});
test("a requested source outside current membership is rejected before domain reads", async () => {
  let calls = 0;
  await assert.rejects(() => loadPersonalData("user", { source: "foreign" }, async () => { calls++; return [source]; }), PersonalAccessError);
  assert.equal(calls, 1);
});
test("removed membership discards already-read items and never returns stale source data", async () => {
  let reads = 0;
  const query: PersonalQuery = async (statement) => statement === personalSourcesSql ? (++reads === 1 ? [source] : []) : statement === personalQueries.facilities ? [item()] : [];
  const data = await loadPersonalData("user", { month: "2026-10" }, query);
  assert.deepEqual(data.sources, []); assert.deepEqual(data.items, []);
});
test("role or parent link changes discard the in-flight projection", async () => {
  let reads = 0;
  const query: PersonalQuery = async (statement) => statement === personalSourcesSql ? [{ ...source, accessKey: ++reads === 1 ? "before" : "after" }] : statement === personalQueries.facilities ? [item()] : [];
  const data = await loadPersonalData("user", { month: "2026-10" }, query);
  assert.deepEqual(data.items, []); assert.equal(data.warnings.length, 1);
  assert.equal("accessKey" in data.sources[0], false);
});
test("source scope is passed to every adapter and tentative/attention never become confirmed", async () => {
  const query: PersonalQuery = async (statement, params) => {
    if (statement === personalSourcesSql) return [source];
    assert.deepEqual(params, ["user", "2026-10-01", "2026-11-01", calendarId]);
    if (statement === personalQueries.facilities) return [item({ state: "tentative" })];
    if (statement === personalQueries.tasks) return [item({ kind: "task", state: "attention", start: null, end: null })];
    return [];
  };
  const data = await loadPersonalData("user", { month: "2026-10", source: calendarId }, query);
  assert.equal(data.items[0].state, "tentative"); assert.equal(data.attention[0].kind, "task");
});
test("limits are disclosed and deduplication is by source identity", async () => {
  const query: PersonalQuery = async (statement) => statement === personalSourcesSql ? [source] : statement === personalQueries.facilities ? Array.from({ length: 1001 }, (_, i) => item({ sourceId: String(i) })) : [];
  const data = await loadPersonalData("user", { month: "2026-10" }, query);
  assert.equal(data.items.length, 1000); assert.equal(data.warnings.length, 1);
});
test("care expansion has an explicit disclosed output cap", async () => {
  const children = Array.from({length:1001},(_,i)=>({id:`child-${i}`,name:`Synthetic ${i}`}));
  const huge = { ...care, children, manualAssignments: children.map(c=>({...care.manualAssignments[0],id:c.id,childId:c.id,afternoonParentId:care.participantId})) };
  const query: PersonalQuery = async statement => statement===personalSourcesSql?[{...source,type:"co_parenting"}]:statement===personalQueries.care?[huge]:[];
  const data=await loadPersonalData("user",{month:"2026-10"},query);
  assert.equal(data.items.length,1000);assert.match(data.warnings[0],/Care context/);
});
test("adapter SQL preserves explicit assignment, publication, tenancy and read-only boundaries", () => {
  for (const query of Object.values(personalQueries)) {
    assert.match(query, /m.user_id=\$1::uuid/); assert.match(query, /c.archived_at IS NULL/);
    assert.match(query, /c.id=\$4::uuid/); assert.doesNotMatch(query, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i);
  }
  assert.match(personalQueries.shifts, /staff_roster_published_shifts/); assert.doesNotMatch(personalQueries.shifts, /JOIN staff_roster_shifts\b/);
  assert.match(personalQueries.shifts, /member.membership_id=p.membership_id/);
  assert.match(personalQueries.facilities, /b.user_id=\$1::uuid/);
  assert.match(personalQueries.social, /response.user_id=\$1::uuid/); assert.match(personalQueries.social, /response IN \('going','maybe'\)/);
  assert.match(personalQueries.tasks, /responsible_participant_id=p.participant_id/);
  assert.match(personalQueries.expenses, /share.share_cents>share.paid_cents/); assert.match(personalQueries.expenses, /paid_by_participant_id<>p.participant_id/);
  assert.match(personalQueries.approvals, /approver_membership_id=p.membership_id/);
});
test("source destinations use an allowlist, real dates and safe records", () => {
  assert.equal(sourceDestination("shared_facilities", "expenses", sourceId, "2026-10-01"), null);
  assert.equal(sourceDestination("co_parenting", "https://evil.test", sourceId, "2026-10-01"), null);
  assert.equal(safeSourceDate("2026-02-30"), "");
  assert.equal(safeSourceRecord(sourceId), sourceId);
  assert.equal(safeSourceRecord("//evil"), "");
  assert.equal(sourceDestination("social_groups", "calendar", "//evil", "junk"), "/calendar-types/social-groups");
  assert.equal(sourceDestination("shared_facilities", "calendar", sourceId, "2026-10-01"), `/calendar-types/shared-facilities?date=2026-10-01&record=${sourceId}#record-${sourceId}`);
});
