import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CalendarContextChangedError, calendarContextHeaders, requireCalendarContext, throwIfCalendarContextChanged } from "../components/calendar-sharing/calendar-context";

const calendarA = "b0a5dd29-f3c5-405f-89cf-b889be63f501";
const calendarB = "4cf1ed54-a023-45eb-bbaf-3efbd6bba09a";

test("retrying a GET after another tab switches calendars cannot rebind a page or its draft", () => {
  const routeCalendarId = calendarA;
  let loaded = requireCalendarContext({ calendarId: calendarA, rules: { openMinute: 480 } }, routeCalendarId);
  const draft = { openMinute: 600 };
  assert.equal(calendarContextHeaders(routeCalendarId)["x-covie-calendar-id"], calendarA);
  // The other tab now selects B. Even a successful-but-wrong server payload
  // must be rejected before it can replace A's data under A's page heading.
  assert.throws(() => {
    loaded = requireCalendarContext({ calendarId: calendarB, rules: { openMinute: 480 } }, routeCalendarId);
  }, /selected calendar changed/);
  assert.equal(loaded.calendarId, calendarA);
  assert.deepEqual(draft, { openMinute: 600 });
  const retryGet = calendarContextHeaders(routeCalendarId);
  const post = { headers: { "content-type": "application/json", ...calendarContextHeaders(routeCalendarId) }, body: draft };
  assert.equal(retryGet["x-covie-calendar-id"], calendarA);
  assert.equal(post.headers["x-covie-calendar-id"], calendarA, "A retained draft can never target B through a response-derived header");
  assert.throws(() => calendarContextHeaders(""), /Reload/);
});

test("only a route-level calendar change permits a different response context", () => {
  const payload = { calendarId: calendarB, events: [] };
  assert.throws(() => requireCalendarContext(payload, calendarA), /selected calendar changed/);
  assert.equal(requireCalendarContext(payload, calendarB), payload);
  assert.equal(calendarContextHeaders(calendarB)["x-covie-calendar-id"], calendarB);
});

test("Facilities and Members bind both read and write requests to required route props", async () => {
  const files = [
    "components/shared-facilities/facilities-page.tsx",
    "components/calendar-sharing/members-page.tsx",
  ];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.match(source, /calendarId\s*:\s*string/, file);
    assert.match(source, /cache:\s*"no-store",\s*headers:\s*calendarContextHeaders\(calendarId\)/, file);
    assert.match(source, /"content-type":\s*"application\/json",\s*\.\.\.calendarContextHeaders\(calendarId\)/, file);
    assert.match(source, /requireCalendarContext\((?:body|result),\s*calendarId\)/, file);
    assert.doesNotMatch(source, /"x-covie-calendar-id"\s*:\s*data\??\./, file);
  }
  for (const file of files) {
    assert.match(await readFile(file, "utf8"), /window.location.reload\(\)/, `${file} offers a full-page recovery path`);
  }
});


test("calendar mismatch409 clears context while ordinary version conflicts preserve the editor", () => {
  assert.throws(() => throwIfCalendarContextChanged(409, { error: "Your selected calendar changed. Reload this page." }), CalendarContextChangedError);
  assert.throws(() => throwIfCalendarContextChanged(409, { code: "calendar_changed" }), CalendarContextChangedError);
  assert.doesNotThrow(() => throwIfCalendarContextChanged(409, { error: "This booking changed. Reload before trying again." }));
  assert.doesNotThrow(() => throwIfCalendarContextChanged(200, { calendarId: calendarA }));
});

test("all clients discard stale records on a mismatched read or write", async () => {
  for (const file of ["components/shared-facilities/facilities-page.tsx", "components/calendar-sharing/members-page.tsx"]) {
    const source = await readFile(file, "utf8");
    assert.equal((source.match(/throwIfCalendarContextChanged\(response.status,/g) ?? []).length, 2, `${file} checks both read and write responses`);
    assert.match(source, /instanceof CalendarContextChangedError/, file);
    assert.match(source, /(?:setData|acceptSnapshot)\(null\)/, file);
  }
});
