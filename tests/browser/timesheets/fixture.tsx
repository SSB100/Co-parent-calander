import { createRoot } from "react-dom/client";
import { TemplateShell } from "../../../components/templates/template-shell";

// Real shell, components and styles; every API boundary is intercepted by the runner.
const query = new URLSearchParams(window.location.search);
const variant = query.get("fixture") ?? "staff-calendar";
const role = variant.startsWith("owner-") ? "owner" : variant.startsWith("manager-") ? "manager" : "member";
const calendarId = "10000000-0000-4000-8000-000000000001";
const tool = variant === "owner-team" ? "team" : variant === "owner-settings" ? "settings" : variant === "owner-clients" ? "clients-projects" : variant === "owner-work-types" ? "work-types" : undefined;
createRoot(document.getElementById("root")!).render(<TemplateShell slug="timesheets" calendars={[{ id: calendarId, name: "Synthetic studio work calendar", calendarType: "timesheets", permission: role === "owner" ? "owner" : "editor", displayName: "Synthetic staff" }]} archivedCalendars={[]} currentCalendarId={calendarId} defaultName="Synthetic studio" section={tool ? "organiser" : "calendar"} activeToolKey={tool} workspaceRole={role} initialDate="2026-10-08" />);
