import type { CalendarTemplateId } from "@/lib/templates/calendar-templates";

export type PersonalKind = "shift" | "facility" | "social" | "care" | "handover" | "task" | "expense" | "approval" | "organising";
export type PersonalState = "confirmed" | "tentative" | "background" | "attention";
export type PersonalSource = { id: string; name: string; type: CalendarTemplateId; timezone: string };
export type PersonalItem = {
  id: string;
  calendarId: string;
  sourceId: string;
  kind: PersonalKind;
  state: PersonalState;
  title: string;
  detail: string;
  date: string;
  endDate: string;
  start: string | null;
  end: string | null;
  timezone: string;
  /** Opaque source identity; source navigation rechecks membership server-side. */
  sourceTarget: "calendar" | "tasks" | "expenses" | "approvals";
};
export type PersonalData = {
  month: string;
  timezone: string;
  today: string;
  sources: PersonalSource[];
  items: PersonalItem[];
  attention: PersonalItem[];
  warnings: string[];
};
