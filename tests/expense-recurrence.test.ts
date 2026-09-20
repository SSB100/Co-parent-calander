import assert from "node:assert/strict";
import test from "node:test";
import { recurringExpenseDates } from "@/lib/expenses/recurrence";

test("weekly Shared Costs generate from the agreed start date without duplicates", () => {
  assert.deepEqual(
    recurringExpenseDates({
      startDate: "2026-09-21",
      lastGeneratedDate: "2026-09-21",
      frequency: "weekly",
      endDate: null,
      throughDate: "2026-10-12",
    }),
    ["2026-09-28", "2026-10-05", "2026-10-12"],
  );
});

test("fortnightly Shared Costs generate every two weeks", () => {
  assert.deepEqual(
    recurringExpenseDates({
      startDate: "2026-09-21",
      lastGeneratedDate: "2026-09-21",
      frequency: "fortnightly",
      endDate: null,
      throughDate: "2026-11-02",
    }),
    ["2026-10-05", "2026-10-19", "2026-11-02"],
  );
});

test("monthly Shared Costs stay anchored to the original calendar date", () => {
  assert.deepEqual(
    recurringExpenseDates({
      startDate: "2026-01-31",
      lastGeneratedDate: "2026-01-31",
      frequency: "monthly",
      endDate: null,
      throughDate: "2026-04-30",
    }),
    ["2026-02-28", "2026-03-31", "2026-04-30"],
  );
});

test("recurring Shared Costs respect an end date", () => {
  assert.deepEqual(
    recurringExpenseDates({
      startDate: "2026-09-21",
      lastGeneratedDate: "2026-09-21",
      frequency: "weekly",
      endDate: "2026-10-06",
      throughDate: "2026-11-30",
    }),
    ["2026-09-28", "2026-10-05"],
  );
});
