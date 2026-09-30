import { localDateInTimeZone } from "@/lib/calendar/time";
import { resolveParentingScheduleAssignments } from "@/lib/parenting-schedules/resolver";
import type { PersonalItem } from "./contracts";

export function personalWindow(month: string) {
  if (!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Choose a valid month between 1900 and 2099.");
  const first = `${month}-01`, next = new Date(`${first}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = new Date(next); last.setUTCDate(0);
  return { first, next: next.toISOString().slice(0, 10), last: last.toISOString().slice(0, 10) };
}
export function personalTimezone(value: string) {
  if (!value || value.length > 100) throw new Error("Choose a valid timezone.");
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(0); } catch { throw new Error("Choose a valid timezone."); }
  return value;
}
export function normalisePersonalItem(row: Omit<PersonalItem, "id">): PersonalItem {
  return { ...row, id: `${row.calendarId}:${row.kind}:${row.sourceId}`, start: row.start ? new Date(row.start).toISOString() : null, end: row.end ? new Date(row.end).toISOString() : null };
}
export function itemInPersonalMonth(item: PersonalItem, month: string, timezone: string) {
  const { first, next } = personalWindow(month);
  if (item.start && item.end) {
    const date = localDateInTimeZone(timezone, new Date(item.start));
    const endDate = localDateInTimeZone(timezone, new Date(Date.parse(item.end) - 1));
    return date < next && endDate >= first;
  }
  return item.date < next && item.endDate >= first;
}
export function canonicalPersonalItems(items: PersonalItem[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()].sort((a, b) => (a.start || a.date).localeCompare(b.start || b.date) || a.id.localeCompare(b.id));
}
export type CareProjection = {
  calendarId: string;
  timezone: string;
  participantId: string;
  children: { id: string; name: string }[];
} & Omit<Parameters<typeof resolveParentingScheduleAssignments>[0], "from" | "to">;
export function personalCareItems(row: CareProjection, month: string): PersonalItem[] {
  const { first, last } = personalWindow(month);
  const names = new Map(row.children.map((child) => [child.id, child.name]));
  const items: PersonalItem[] = [];
  for (const assignment of resolveParentingScheduleAssignments({ ...row, from: first, to: last }).values()) {
    const morning = assignment.morningParentId === row.participantId;
    const afternoon = assignment.afternoonParentId === row.participantId;
    if ((!morning && !afternoon) || !names.has(assignment.childId)) continue;
    const base = { calendarId: row.calendarId, sourceId: `${assignment.childId}:${assignment.date}`, date: assignment.date, endDate: assignment.date, timezone: row.timezone, sourceTarget: "calendar" as const };
    items.push(normalisePersonalItem({ ...base, kind: "care", state: "background", title: `Care for ${names.get(assignment.childId)}`, detail: morning && afternoon ? "With you all day" : morning ? "With you in the morning" : "With you in the afternoon", start: null, end: null }));
    if (assignment.morningParentId && assignment.afternoonParentId && assignment.morningParentId !== assignment.afternoonParentId) {
      const time = assignment.handoverTime?.slice(0, 5);
      items.push(normalisePersonalItem({ ...base, kind: "handover", state: "confirmed", title: `Handover for ${names.get(assignment.childId)}`, detail: time ? `Handover at ${time} (${row.timezone}). Check the source for details.` : "Time not specified. Check the source calendar.", start: null, end: null }));
    }
  }
  return items;
}
