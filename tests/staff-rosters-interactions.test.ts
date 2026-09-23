import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DROP_SHIFT_MINUTES,
  ROSTER_SNAP_MINUTES,
  memberDropRange,
  movedShiftRange,
  preferredDropDuration,
  resizedShiftRange,
  rosterShiftDuration,
} from "../lib/staff-rosters/roster-interactions";

test("direct Staff drops use an eight-hour default when no recent pattern exists", () => {
  assert.equal(DEFAULT_DROP_SHIFT_MINUTES, 8 * 60);
  assert.equal(preferredDropDuration(null), 8 * 60);

  assert.deepEqual(
    memberDropRange({
      dropMinute: 9 * 60,
      visibleStartMinute: 0,
      visibleEndMinute: 24 * 60,
    }),
    {
      startMinute: 9 * 60,
      endMinute: 17 * 60,
    },
  );
});

test("direct Staff drops reuse the most recent shift duration", () => {
  assert.equal(preferredDropDuration(6 * 60), 6 * 60);

  assert.deepEqual(
    memberDropRange({
      dropMinute: 10 * 60,
      visibleStartMinute: 8 * 60,
      visibleEndMinute: 20 * 60,
      recentDurationMinutes: 6 * 60,
    }),
    {
      startMinute: 10 * 60,
      endMinute: 16 * 60,
    },
  );
});

test("drop and resize interactions stay on fifteen-minute increments", () => {
  assert.equal(ROSTER_SNAP_MINUTES, 15);

  assert.deepEqual(
    memberDropRange({
      dropMinute: 9 * 60 + 8,
      visibleStartMinute: 8 * 60,
      visibleEndMinute: 18 * 60,
      recentDurationMinutes: 7 * 60 + 30,
    }),
    {
      startMinute: 9 * 60 + 15,
      endMinute: 16 * 60 + 45,
    },
  );

  assert.deepEqual(
    resizedShiftRange({
      originStartMinute: 9 * 60,
      originEndMinute: 17 * 60,
      deltaMinutes: 38,
      edge: "start",
      visibleStartMinute: 8 * 60,
      visibleEndMinute: 20 * 60,
    }),
    {
      startMinute: 9 * 60 + 45,
      endMinute: 17 * 60,
    },
  );

  assert.deepEqual(
    resizedShiftRange({
      originStartMinute: 9 * 60,
      originEndMinute: 17 * 60,
      deltaMinutes: -22,
      edge: "end",
      visibleStartMinute: 8 * 60,
      visibleEndMinute: 20 * 60,
    }),
    {
      startMinute: 9 * 60,
      endMinute: 16 * 60 + 45,
    },
  );
});

test("moving a shift preserves its duration while clamping it into the visible timeline", () => {
  assert.deepEqual(
    movedShiftRange({
      dropMinute: 15 * 60,
      durationMinutes: 8 * 60,
      visibleStartMinute: 8 * 60,
      visibleEndMinute: 18 * 60,
    }),
    {
      startMinute: 10 * 60,
      endMinute: 18 * 60,
    },
  );
});

test("long shifts keep their duration even when operational hours are narrower", () => {
  assert.deepEqual(
    movedShiftRange({
      dropMinute: 15 * 60,
      durationMinutes: 12 * 60,
      visibleStartMinute: 8 * 60,
      visibleEndMinute: 18 * 60,
    }),
    {
      startMinute: 8 * 60,
      endMinute: 20 * 60,
    },
  );
});

test("drop creation near the end of the day stays valid instead of creating a zero-length shift", () => {
  const range = memberDropRange({
    dropMinute: 17 * 60 + 55,
    visibleStartMinute: 8 * 60,
    visibleEndMinute: 18 * 60,
  });

  assert.equal(range.startMinute, 17 * 60 + 45);
  assert.equal(range.endMinute, 18 * 60);
  assert.equal(range.endMinute - range.startMinute, ROSTER_SNAP_MINUTES);
});

test("shift duration helper remains deterministic", () => {
  assert.equal(
    rosterShiftDuration({ startTime: "09:00", endTime: "17:00" }),
    8 * 60,
  );
  assert.equal(
    rosterShiftDuration({ startTime: "12:15", endTime: "12:30" }),
    ROSTER_SNAP_MINUTES,
  );
});
