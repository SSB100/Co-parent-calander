import assert from "node:assert/strict";
import test from "node:test";
import { expandEventOccurrences } from "../lib/events/recurrence";

const event = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Football training",
  description: null,
  category: "sport",
  startDate: "2026-09-14",
  endDate: null,
  recurrence: "weekly" as const,
  recurrenceEndDate: null,
};

test("weekly event series expands only inside the requested range", () => {
  const rows = expandEventOccurrences({
    events: [event],
    from: "2026-09-18",
    to: "2026-10-05",
  });

  assert.deepEqual(
    rows.map((row) => row.startDate),
    ["2026-09-21", "2026-09-28", "2026-10-05"],
  );
  assert.deepEqual(
    rows.map((row) => row.occurrenceKey),
    [
      `${event.id}:2026-09-21`,
      `${event.id}:2026-09-28`,
      `${event.id}:2026-10-05`,
    ],
  );
  assert.ok(rows.every((row) => row.seriesId === event.id));
});

test("repeat-until date prevents later occurrences", () => {
  const rows = expandEventOccurrences({
    events: [{ ...event, recurrenceEndDate: "2026-09-28" }],
    from: "2026-09-14",
    to: "2026-10-31",
  });

  assert.deepEqual(
    rows.map((row) => row.startDate),
    ["2026-09-14", "2026-09-21", "2026-09-28"],
  );
});

test("fortnightly and monthly series stay anchored to the original start date", () => {
  const fortnightly = expandEventOccurrences({
    events: [{ ...event, recurrence: "fortnightly" as const }],
    from: "2026-09-01",
    to: "2026-10-31",
  });
  assert.deepEqual(
    fortnightly.map((row) => row.startDate),
    ["2026-09-14", "2026-09-28", "2026-10-12", "2026-10-26"],
  );

  const monthly = expandEventOccurrences({
    events: [{
      ...event,
      recurrence: "monthly" as const,
      startDate: "2026-01-31",
    }],
    from: "2026-01-01",
    to: "2026-04-30",
  });
  assert.deepEqual(
    monthly.map((row) => row.startDate),
    ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"],
  );
});

test("multi-day recurring events preserve each occurrence duration", () => {
  const rows = expandEventOccurrences({
    events: [{
      ...event,
      startDate: "2026-09-14",
      endDate: "2026-09-16",
      recurrence: "fortnightly" as const,
    }],
    from: "2026-09-01",
    to: "2026-10-15",
  });

  assert.deepEqual(
    rows.map((row) => [row.startDate, row.endDate]),
    [
      ["2026-09-14", "2026-09-16"],
      ["2026-09-28", "2026-09-30"],
      ["2026-10-12", "2026-10-14"],
    ],
  );
});

test("one-off events preserve their original Google/local identity", () => {
  const rows = expandEventOccurrences({
    events: [{
      ...event,
      recurrence: "none" as const,
      startDate: "2026-09-20",
    }],
    from: "2026-09-18",
    to: "2026-09-25",
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].occurrenceKey, event.id);
  assert.equal(rows[0].seriesId, null);
});
