import { test } from "node:test";
import assert from "node:assert/strict";
import { comingUp } from "../lib/workspace/coming-up";

test("Your Events sorts calendar events and split-day handovers chronologically", () => {
  const result = comingUp(
    [
      { id: "event-b", title: "School show", startDate: "2026-09-21" },
      { id: "event-a", title: "Football", startDate: "2026-09-20" },
    ],
    [
      { id: "handover-a", title: "Handover · Steven → Jess", date: "2026-09-20" },
    ],
    "2026-09-19",
  );

  assert.equal(result.total, 3);
  assert.deepEqual(
    result.items.map((item) => [item.kind, item.title]),
    [
      ["Event", "Football"],
      ["Handover", "Handover · Steven → Jess"],
      ["Event", "School show"],
    ],
  );
  assert.equal(result.items[0]?.href, "/calendar?date=2026-09-20");
});

test("Your Events excludes past items and limits the next six entries", () => {
  const events = Array.from({ length: 8 }, (_, index) => ({
    id: String(index),
    title: `Event ${index}`,
    startDate: `2026-09-${String(18 + index).padStart(2, "0")}`,
  }));
  const result = comingUp(events, [], "2026-09-19");

  assert.equal(result.total, 7);
  assert.equal(result.items.length, 6);
  assert.equal(result.items[0]?.date, "2026-09-19");
});
