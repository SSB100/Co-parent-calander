import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { PersonalData, PersonalItem } from "../lib/personal/contracts";
import { PersonalLoader } from "../components/personal/personal-loader";
import { isPersonalMonth, personalItemDates, personalItemTime, personalItemsByDay, personalMonthDays, personalQueryKey, personalTimezoneOptions, scopePersonalData, shiftPersonalDate, shiftPersonalMonth } from "../components/personal/personal-ui";

const item: PersonalItem = { id: "cal-a:booking-a", calendarId: "cal-a", sourceId: "booking-a", kind: "facility", state: "confirmed", title: "Court booking", detail: "Your confirmed booking", date: "2026-10-01", endDate: "2026-10-01", start: "2026-10-01T10:00:00Z", end: "2026-10-01T11:00:00Z", timezone: "Pacific/Auckland", sourceTarget: "calendar" };
const data: PersonalData = { month: "2026-10", timezone: "Pacific/Auckland", today: "2026-10-01", sources: [{ id: "cal-a", name: "Courts", type: "shared_facilities", timezone: "Pacific/Auckland" }], items: [item], attention: [], warnings: [] };
const query = { month: data.month, timezone: data.timezone, source: "" };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

test("Personal month selection handles Monday-first grids, years and leap days", () => {
  const days = personalMonthDays("2026-10");
  assert.equal(days[0], "2026-09-28");
  assert.equal(days.at(-1), "2026-11-01");
  assert.equal(days.length, 35);
  assert.equal(personalMonthDays("2026-02").length, 35);
  assert.ok(personalMonthDays("2028-02").includes("2028-02-29"));
  assert.equal(shiftPersonalMonth("2026-12", 1), "2027-01");
  assert.equal(shiftPersonalMonth("2026-01", -1), "2025-12");
  assert.equal(shiftPersonalDate("2028-03-01", -1), "2028-02-29");
  assert.equal(isPersonalMonth("1900-01"), true);
  assert.equal(isPersonalMonth("2099-12"), true);
  assert.equal(isPersonalMonth("1899-12"), false);
  assert.equal(isPersonalMonth("2100-01"), false);
  assert.equal(isPersonalMonth("2026-13"), false);
});

test("timed plans shift across overview days and use exclusive end instants", () => {
  const crossing = { ...item, start: "2026-10-01T10:30:00Z", end: "2026-10-01T11:30:00Z" };
  assert.deepEqual(personalItemDates(crossing, "Pacific/Auckland"), { first: "2026-10-01", last: "2026-10-02" });
  assert.deepEqual(personalItemDates(crossing, "UTC"), { first: "2026-10-01", last: "2026-10-01" });
  assert.deepEqual(personalItemDates(item, "Pacific/Auckland"), { first: "2026-10-01", last: "2026-10-01" });
  const dst = { ...item, start: "2026-11-01T05:30:00Z", end: "2026-11-01T06:30:00Z" };
  assert.deepEqual(personalItemDates(dst, "America/New_York"), { first: "2026-11-01", last: "2026-11-01" });
});

test("all-day care and due dates remain source-local with inclusive last date", () => {
  const care = { ...item, kind: "care" as const, state: "background" as const, start: null, end: null, date: "2026-10-01", endDate: "2026-10-03" };
  const days = ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
  const byDay = personalItemsByDay([care], days, "America/Los_Angeles");
  assert.deepEqual(days.map((day) => byDay.get(day)?.length), [0, 1, 1, 1, 0]);
  assert.match(personalItemTime(care, "America/Los_Angeles"), /Pacific\/Auckland \(calendar date\)/);
  assert.doesNotMatch(personalItemTime(care, "America/Los_Angeles"), /America\/Los_Angeles/);
});

test("agenda keeps tentative and care status and excludes attention from booked days", () => {
  const items = [item, { ...item, id: "maybe", state: "tentative" as const }, { ...item, id: "care", state: "background" as const, start: null, end: null }, { ...item, id: "review", state: "attention" as const }];
  const shown = personalItemsByDay(items, ["2026-10-01"], "UTC").get("2026-10-01")!;
  assert.equal(shown.length, 3);
  assert.deepEqual(new Set(shown.map((entry) => entry.state)), new Set(["confirmed", "tentative", "background"]));
});

test("display scoping drops unavailable calendars and preserves source identity", () => {
  const other = { ...item, id: "cal-b:booking-a", calendarId: "cal-b" };
  const review = { ...item, id: "cal-a:review", state: "attention" as const };
  const scoped = scopePersonalData({ ...data, items: [item, other, review], attention: [review, { ...review, calendarId: "cal-b" }] }, "cal-a");
  assert.deepEqual(scoped.items, [item]);
  assert.deepEqual(scoped.attention, [review]);
  assert.deepEqual(scopePersonalData(data, "removed").items, []);
  assert.deepEqual(scopePersonalData({ ...data, sources: [] }, "").items, []);
});

test("timezone choices keep current, source, device and UTC zones without duplicates", () => {
  assert.deepEqual(personalTimezoneOptions("Pacific/Auckland", data.sources, "America/New_York"), ["Pacific/Auckland", "America/New_York", "UTC"]);
  assert.deepEqual(personalTimezoneOptions("UTC", [], "UTC"), ["UTC"]);
});

test("Personal requests include server-enforced source and explicit month/timezone without account IDs", async () => {
  let seenUrl = "";
  let seenOptions: RequestInit | undefined;
  const loader = new PersonalLoader(async (url, options) => { seenUrl = url; seenOptions = options; return response(data); });
  assert.deepEqual(await loader.load({ ...query, source: "cal-a" }), data);
  assert.equal(seenUrl, `/api/personal?${personalQueryKey({ ...query, source: "cal-a" })}`);
  assert.equal(seenOptions?.cache, "no-store");
  assert.equal(seenOptions?.credentials, "same-origin");
  assert.equal(seenOptions?.method, undefined);
  assert.doesNotMatch(seenUrl, /userId|accountId/);
});

test("newer scope wins even if an aborted response completes after it", async () => {
  let finishFirst!: (value: Response) => void;
  const signals: AbortSignal[] = [];
  const loader = new PersonalLoader(async (_, options) => {
    signals.push(options.signal as AbortSignal);
    if (signals.length === 1) return new Promise<Response>((resolve) => { finishFirst = resolve; });
    return response({ ...data, month: "2026-11", items: [] });
  });
  const first = loader.load(query);
  const second = loader.load({ ...query, month: "2026-11" });
  assert.equal(signals[0].aborted, true);
  assert.equal((await second)?.month, "2026-11");
  finishFirst(response(data));
  assert.equal(await first, null);
});

test("interrupted requests cannot restore records or surface stale errors", async () => {
  let rejectRequest!: (error: Error) => void;
  const loader = new PersonalLoader(async () => new Promise<Response>((_, reject) => { rejectRequest = reject; }));
  const request = loader.load(query);
  loader.cancel();
  rejectRequest(new Error("Delayed network failure"));
  assert.equal(await request, null);
});

test("failed membership, unavailable source, malformed and wrong-scope responses fail closed", async () => {
  for (const status of [401, 403, 404, 500]) {
    const loader = new PersonalLoader(async () => response({ error: "unavailable" }, status));
    await assert.rejects(loader.load(query));
  }
  const missingSource = new PersonalLoader(async () => response({ ...data, sources: [] }));
  await assert.rejects(missingSource.load({ ...query, source: "cal-a" }), /no longer available/);
  for (const invalid of [{}, { ...data, month: "2026-11" }, { ...data, timezone: "UTC" }]) {
    const loader = new PersonalLoader(async () => response(invalid));
    await assert.rejects(loader.load(query), /could not be verified/);
  }
});

test("the Personal surface exposes keyboard dates, private refresh and checked source navigation", async () => {
  const [page, calendar, hook, css, switcher] = await Promise.all(["components/personal/personal-calendar.tsx", "components/personal/personal-month-calendar.tsx", "components/personal/use-personal-calendar.ts", "components/personal/personal.module.css", "components/calendars/calendar-switcher.tsx"].map((file) => readFile(file, "utf8")));
  assert.match(page, /action=\{openPersonalSource\}/);
  for (const field of ["calendarId", "target", "sourceId", "date"]) assert.match(page, new RegExp(`name="${field}"`));
  assert.match(page, /Only visible to you/);
  assert.match(page, /Needs your attention/);
  assert.match(page, /href="\/onboarding"/);
  assert.match(switcher, /href="\/personal" prefetch=\{false\}/);
  assert.match(calendar, /ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7/);
  assert.match(calendar, /tabIndex=\{date === selectedDate \? 0 : -1\}/);
  assert.match(hook, /snapshot\?\.key === key \? snapshot.data : null/);
  assert.match(hook, /setSnapshot\(null\)/);
  assert.match(hook, /current !== revision.current/);
  assert.match(hook, /loader.current\?\.cancel\(\)/);
  assert.match(hook, /visibilitychange/);
  assert.doesNotMatch(page + hook, /localStorage|sessionStorage|indexedDB/);
  assert.match(css, /repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(css, /min-height: 44px/);
  assert.doesNotMatch(css, /gradient|backdrop-filter/);
});
