import { localDateInTimeZone, localDateTimeInputInTimeZone } from "@/lib/calendar/time";
import type { FacilityBooking, FacilityData, FacilityResource, FacilityRules } from "@/lib/shared-facilities/contracts";

export type FacilityView = "availability" | "mine";
export function canEditFacilityResource(data: Pick<FacilityData, "owner" | "role" | "managedResourceIds">, id: string) {
  return data.owner || (data.role === "manager" && data.managedResourceIds.includes(id));
}
export function canReviewFacilityBooking(data: Pick<FacilityData, "owner" | "role" | "managedResourceIds">, booking: FacilityBooking, now = new Date()) {
  return booking.canManage && booking.status === "pending" && new Date(booking.start) > now && canEditFacilityResource(data, booking.resourceId);
}
export function canChangeFacilityBooking(data: Pick<FacilityData, "canBook">, booking: FacilityBooking, now = new Date()) {
  return data.canBook && booking.canManage && (booking.status === "pending" || booking.status === "confirmed") && new Date(booking.start) > now;
}
export function bookingResourceOptions(data: FacilityData, booking?: FacilityBooking): FacilityResource[] {
  return data.resources.filter((resource) => resource.active && (!booking || booking.own || data.owner || canEditFacilityResource(data, resource.id)));
}
export function facilityBookingsForView(data: FacilityData, view: FacilityView, resourceId: string, now = new Date()) {
  return data.bookings.filter((booking) => {
    if (resourceId && booking.resourceId !== resourceId) return false;
    if (booking.status !== "pending" && booking.status !== "confirmed") return false;
    if (view === "mine") return booking.own && new Date(booking.end) > now;
    const first = localDateInTimeZone(data.timezone, new Date(booking.start));
    // A booking ending exactly at midnight does not occupy the following day.
    const last = localDateInTimeZone(data.timezone, new Date(new Date(booking.end).getTime() - 1));
    return first <= data.date && last >= data.date;
  }).sort((a, b) => a.start.localeCompare(b.start));
}
export function shiftFacilityDate(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
export function minuteInput(minute: number) {
  if (!Number.isFinite(minute)) return "";
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
export function inputMinute(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
export function bookingLocalFields(booking: FacilityBooking, timezone: string) {
  return { start: localDateTimeInputInTimeZone(timezone, booking.start), end: localDateTimeInputInTimeZone(timezone, booking.end) };
}
export function newBookingLocalFields(date: string, rules: FacilityRules) {
  const end = rules.openMinute + rules.minDuration;
  return {
    start: `${date}T${minuteInput(rules.openMinute)}`,
    end: end === 1440 ? `${shiftFacilityDate(date, 1)}T00:00` : `${date}T${minuteInput(end)}`,
  };
}
export function facilityTime(value: string, timezone: string, includeDate = false) {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: timezone,
    ...(includeDate ? { day: "numeric", month: "short" } as const : {}),
    hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}
export const facilityWeekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const facilityUpdateLabels: Record<string, string> = {
  created: "Booking created", confirmed: "Booking confirmed", pending: "Awaiting approval",
  updated: "Booking changed", cancelled: "Booking cancelled", declined: "Booking declined",
};
