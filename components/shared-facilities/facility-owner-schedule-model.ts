import { localDateTimeInputInTimeZone } from "@/lib/calendar/time";
import type { FacilityBooking, FacilityData, FacilityResource } from "@/lib/shared-facilities/contracts";
import { facilityBookingsForView } from "./facilities-ui";
import { facilitySlotPlan, type FacilitySlot, type FacilitySlotPlan } from "./facility-slots";

type MinuteRange = { start: number; end: number };
export type FacilityOwnerHour = {
  minute: number;
  slots: FacilitySlot[];
  bookings: FacilityBooking[];
  occupied: MinuteRange[];
};
export type FacilityOwnerColumn = { resource: FacilityResource; plan: FacilitySlotPlan; hours: FacilityOwnerHour[] };

/** Wall-clock positions are presentation only. Availability always comes from facilitySlotPlan. */
function bookingRanges(booking: FacilityBooking, date: string, timezone: string): MinuteRange[] {
  const day = Date.parse(`${date}T00:00:00Z`);
  const start = Date.parse(booking.start), end = Date.parse(booking.end);
  const minute = (instant: number) => (Date.parse(`${localDateTimeInputInTimeZone(timezone, new Date(instant))}:00Z`) - day) / 60_000;
  const from = minute(start), to = minute(end);
  let ranges: MinuteRange[];
  if (to - from === (end - start) / 60_000) {
    ranges = [{ start: from, end: to }];
  } else {
    // A fold can make the end label earlier than the start; a gap skips labels.
    // Project real minutes only for transition-spanning records, retaining both
    // pieces instead of painting the nonexistent clock time as occupied.
    ranges = [];
    for (let instant = Math.max(start, day - 86_400_000); instant < Math.min(end, day + 172_800_000); instant += 60_000) {
      const local = minute(instant);
      const previous = ranges.at(-1);
      if (previous?.end === local) previous.end = local + 1;
      else ranges.push({ start: local, end: local + 1 });
    }
  }
  return ranges.map((range) => ({ start: Math.max(0, range.start), end: Math.min(1440, range.end) })).filter((range) => range.start < range.end);
}

export function facilityOwnerHourLabel(minute: number) {
  const hour = Math.floor(minute / 60) % 24;
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}

export function facilityOwnerScheduleModel(data: FacilityData, date: string, resourceId: string, duration: number, now = new Date()) {
  if (data.date !== date) return { columns: [] as FacilityOwnerColumn[], hours: [] as number[], message: "Waiting for this day’s latest schedule.", dstOmitted: false };
  const selectedResource = resourceId ? data.resources.find((resource) => resource.id === resourceId) : null;
  if (resourceId && !selectedResource?.active) return { columns: [] as FacilityOwnerColumn[], hours: [] as number[], message: selectedResource ? "This resource is archived. Its retained booking details are still available. Choose an active resource to find a new time." : "This resource is no longer available. Choose an active resource to see its schedule.", dstOmitted: false };
  const resources = data.resources.filter((resource) => resource.active && (!resourceId || resource.id === resourceId));
  const bookings = facilityBookingsForView(data, "availability", resourceId, now).filter((booking) => resources.some((resource) => resource.id === booking.resourceId));
  const ranges = new Map(bookings.map((booking) => [booking.id, bookingRanges(booking, date, data.timezone)]));
  // A rules edit must not hide an existing booking outside the new opening hours.
  const extents = [...ranges.values()].flat();
  const first = Math.floor(Math.min(data.rules.openMinute, ...extents.map((range) => range.start)) / 60) * 60;
  const last = Math.ceil(Math.max(data.rules.closeMinute, ...extents.map((range) => range.end)) / 60) * 60;
  const hours = Array.from({ length: (last - first) / 60 }, (_, index) => first + index * 60);
  const columns = resources.map((resource): FacilityOwnerColumn => {
    const plan = facilitySlotPlan(data, { calendarId: data.calendarId, date, resourceId: resource.id }, duration, now);
    const resourceBookings = bookings.filter((booking) => booking.resourceId === resource.id);
    return { resource, plan, hours: hours.map((minute) => {
      const current = resourceBookings.filter((booking) => ranges.get(booking.id)!.some((range) => range.start < minute + 60 && range.end > minute));
      return {
        minute,
        // Group the engine's exact immutable intents; never regenerate rounded starts.
        slots: plan.slots.filter((slot) => slot.available && Number(slot.start.slice(11, 13)) === minute / 60),
        bookings: current,
        occupied: current.filter((booking) => booking.status === "confirmed").flatMap((booking) => ranges.get(booking.id)!.filter((range) => range.start < minute + 60 && range.end > minute).map((range) => ({ start: Math.max(minute, range.start), end: Math.min(minute + 60, range.end) }))),
      };
    }) };
  });
  const available = columns.some((column) => column.plan.slots.some((slot) => slot.available));
  const messages = [...new Set(columns.map((column) => column.plan.message).filter(Boolean))];
  return { columns, hours, dstOmitted: columns.some((column) => column.plan.dstOmitted), message: available ? "" : messages.length === 1 ? messages[0] : resources.length ? "No available starts for this booking length. Try another day or a shorter booking." : "Choose an active resource to see its schedule." };
}
