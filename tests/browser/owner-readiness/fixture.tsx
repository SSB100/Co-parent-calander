import { createRoot } from "react-dom/client";
import { TemplateShell } from "../../../components/templates/template-shell";
import { StaffRosterSetupPage } from "../../../components/staff-rosters/setup-page";
import type { AdditionalCalendarTemplateSlug, CalendarTemplateId } from "../../../lib/templates/calendar-templates";

// Render the real shell and feature UI; the runner intercepts every API request.
const query = new URLSearchParams(window.location.search);
const variant = query.get("fixture") ?? "salon";
const slug = ({ salon: "salon-bookings", social: "social-groups", facilities: "shared-facilities", staff: "staff-rosters", "legacy-staff": "staff-rosters" } as const)[variant as "salon" | "social" | "facilities" | "staff" | "legacy-staff"];
const type = slug.replaceAll("-", "_") as CalendarTemplateId;
const calendarId = "10000000-0000-4000-8000-000000000001";
const calendars = [{ id: calendarId, name: "Synthetic neighbourhood calendar with a deliberately long name", calendarType: type, permission: "owner" as const, displayName: "Synthetic owner" }];
createRoot(document.getElementById("root")!).render(variant === "legacy-staff"
  ? <StaffRosterSetupPage calendars={calendars} archivedCalendars={[]} currentCalendarId={calendarId} defaultName="Synthetic owner" />
  : <TemplateShell slug={slug as AdditionalCalendarTemplateSlug} calendars={calendars} archivedCalendars={[]} currentCalendarId={calendarId} defaultName="Synthetic owner" section={variant === "staff" ? "organiser" : "calendar"} activeToolKey={variant === "staff" ? "team" : undefined} staffAccessRole={variant === "staff" ? "owner" : undefined} workspaceRole="owner" initialDate="2026-10-09" />);
