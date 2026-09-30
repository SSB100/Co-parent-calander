import { calendarPathForType, type CalendarTemplateId } from "@/lib/templates/calendar-templates";
export function safeSourceDate(value: unknown) {
  if (typeof value !== "string" || !/^(19|20)\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}
export function safeSourceRecord(value: unknown) {
  return typeof value === "string" && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value) ? value : "";
}
export function sourceDestination(type: CalendarTemplateId, target: string, sourceId: string, date: string) {
  const routes = { tasks: "/responsibilities", expenses: "/expenses", approvals: "/home" };
  if (target !== "calendar" && (!(target in routes) || type !== "co_parenting")) return null;
  const base = target === "calendar" ? calendarPathForType(type) : routes[target as keyof typeof routes];
  const record = safeSourceRecord(sourceId);
  const params = new URLSearchParams();
  if (safeSourceDate(date)) params.set("date", date);
  if (record) params.set("record", record);
  const query = params.toString();
  return `${base}${query ? `?${query}` : ""}${record ? `#record-${record}` : ""}`;
}
