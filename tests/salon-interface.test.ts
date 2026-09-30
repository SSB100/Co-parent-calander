import test from "node:test";
import assert from "node:assert/strict";
import { SalonLoader } from "../components/salon/salon-loader";
import {
  salonDays,
  salonTime,
  salonTimeBlockInstant,
  shiftSalonMonth,
} from "../components/salon/salon-ui";
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
test("Salon calendar dates stay Monday-first and timezone-labelled", () => {
  assert.equal(salonDays("2026-10-01")[0], "2026-09-28");
  assert.equal(shiftSalonMonth("2026-12-20", 1), "2027-01-01");
  assert.notEqual(
    salonTime("2026-04-04T13:15:00Z", "Pacific/Auckland"),
    salonTime("2026-04-04T14:15:00Z", "Pacific/Auckland"),
  );
});
test("time-off local inputs reject gaps/folds instead of silently selecting an offset", () => {
  assert.throws(() =>
    salonTimeBlockInstant("2026-09-27", "02:30", "Pacific/Auckland"),
  );
  assert.throws(() =>
    salonTimeBlockInstant("2026-04-05", "02:30", "Pacific/Auckland"),
  );
  assert.equal(
    salonTimeBlockInstant("2026-10-02", "09:00", "Pacific/Auckland"),
    "2026-10-01T20:00:00.000Z",
  );
});
test("Salon loader discards late responses after day changes", async () => {
  const pending: { resolve: (r: Response) => void; signal: AbortSignal }[] = [];
  const loader = new SalonLoader(
    (url, init) =>
      new Promise((resolve) =>
        pending.push({ resolve, signal: init.signal as AbortSignal }),
      ),
  );
  const first = loader.load("/first", { calendarId: "a", date: "2026-10-01" }),
    second = loader.load("/next", { calendarId: "a", date: "2026-10-02" });
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve(response({ calendarId: "a", date: "2026-10-02" }));
  assert.deepEqual(await second, { calendarId: "a", date: "2026-10-02" });
  pending[0].resolve(response({ calendarId: "a", date: "2026-10-01" }));
  assert.equal(await first, null);
});
test("Salon loader binds private headers and rejects mismatched source identities", async () => {
  let header: HeadersInit | undefined;
  const loader = new SalonLoader(async (url, init) => {
    header = init.headers;
    return response({ calendarId: "other", date: "2026-10-01" });
  });
  await assert.rejects(
    loader.load("/api/salon", { calendarId: "a", date: "2026-10-01" }, "a"),
    /selected calendar/,
  );
  assert.deepEqual(header, { "x-covie-calendar-id": "a" });
  const client = new SalonLoader(async () =>
    response({ appointment: { id: "someone-else" } }),
  );
  await assert.rejects(
    client.load("/api/appointments/own", { appointmentId: "own" }),
    /selected calendar/,
  );
});
test("Salon native transport never receives an object-method receiver", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async function (this: unknown) {
    assert.ok(this === undefined || this === globalThis);
    return response({ calendarId: "a" });
  };
  try {
    assert.deepEqual(
      await new SalonLoader().load("/api/salon", { calendarId: "a" }),
      { calendarId: "a" },
    );
  } finally {
    globalThis.fetch = original;
  }
});
