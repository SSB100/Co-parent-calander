export const ROSTER_SNAP_MINUTES = 15;
export const DEFAULT_DROP_SHIFT_MINUTES = 8 * 60;
export const LATEST_SHIFT_MINUTE = 23 * 60 + 45;

export function rosterMinutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function rosterTimeFromMinutes(value: number) {
  const safe = Math.max(0, Math.min(LATEST_SHIFT_MINUTE, value));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
}

export function snapRosterMinutes(value: number) {
  return Math.round(value / ROSTER_SNAP_MINUTES) * ROSTER_SNAP_MINUTES;
}

export function rosterShiftDuration(input: {
  startTime: string;
  endTime: string;
}) {
  return Math.max(
    0,
    rosterMinutesFromTime(input.endTime) -
      rosterMinutesFromTime(input.startTime),
  );
}

function usableTimelineEnd(visibleEndMinute: number) {
  return Math.min(visibleEndMinute, LATEST_SHIFT_MINUTE);
}

export function preferredDropDuration(recentDurationMinutes?: number | null) {
  if (
    recentDurationMinutes &&
    Number.isFinite(recentDurationMinutes) &&
    recentDurationMinutes >= ROSTER_SNAP_MINUTES
  ) {
    return Math.max(
      ROSTER_SNAP_MINUTES,
      snapRosterMinutes(recentDurationMinutes),
    );
  }

  return DEFAULT_DROP_SHIFT_MINUTES;
}

export function memberDropRange(input: {
  dropMinute: number;
  visibleStartMinute: number;
  visibleEndMinute: number;
  recentDurationMinutes?: number | null;
}) {
  const latestEnd = usableTimelineEnd(input.visibleEndMinute);
  const startMinute = Math.max(
    input.visibleStartMinute,
    Math.min(
      latestEnd - ROSTER_SNAP_MINUTES,
      snapRosterMinutes(input.dropMinute),
    ),
  );
  const endMinute = Math.min(
    latestEnd,
    startMinute + preferredDropDuration(input.recentDurationMinutes),
  );

  return {
    startMinute,
    endMinute: Math.max(
      startMinute + ROSTER_SNAP_MINUTES,
      endMinute,
    ),
  };
}

export function movedShiftRange(input: {
  dropMinute: number;
  durationMinutes: number;
  visibleStartMinute: number;
  visibleEndMinute: number;
}) {
  const latestEnd = usableTimelineEnd(input.visibleEndMinute);
  const durationMinutes = Math.max(
    ROSTER_SNAP_MINUTES,
    snapRosterMinutes(input.durationMinutes),
  );
  const maximumDuration = Math.max(
    ROSTER_SNAP_MINUTES,
    latestEnd - input.visibleStartMinute,
  );
  const boundedDuration = Math.min(durationMinutes, maximumDuration);
  const latestStart = Math.max(
    input.visibleStartMinute,
    latestEnd - boundedDuration,
  );
  const requestedStart = Math.max(
    input.visibleStartMinute,
    Math.min(
      latestEnd - ROSTER_SNAP_MINUTES,
      snapRosterMinutes(input.dropMinute),
    ),
  );
  const startMinute = Math.min(requestedStart, latestStart);

  return {
    startMinute,
    endMinute: startMinute + boundedDuration,
  };
}

export function resizedShiftRange(input: {
  originStartMinute: number;
  originEndMinute: number;
  deltaMinutes: number;
  edge: "start" | "end";
  visibleStartMinute: number;
  visibleEndMinute: number;
}) {
  const latestEnd = usableTimelineEnd(input.visibleEndMinute);
  const snappedDelta = snapRosterMinutes(input.deltaMinutes);

  if (input.edge === "start") {
    return {
      startMinute: Math.max(
        input.visibleStartMinute,
        Math.min(
          input.originEndMinute - ROSTER_SNAP_MINUTES,
          input.originStartMinute + snappedDelta,
        ),
      ),
      endMinute: input.originEndMinute,
    };
  }

  return {
    startMinute: input.originStartMinute,
    endMinute: Math.min(
      latestEnd,
      Math.max(
        input.originStartMinute + ROSTER_SNAP_MINUTES,
        input.originEndMinute + snappedDelta,
      ),
    ),
  };
}
