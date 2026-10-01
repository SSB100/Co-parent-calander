"use client";
import { useEffect, useState } from "react";
import { PersonalCalendar } from "@/components/personal/personal-calendar";
import { SocialGroupsPage } from "@/components/social-groups/social-groups-page";
import { FacilitiesPage } from "@/components/shared-facilities/facilities-page";
import { SalonPage } from "@/components/salon/salon-page";
import { PublicBookingPage } from "@/components/salon/public-booking-page";
import { OwnAppointmentPage } from "@/components/salon/own-appointment-page";
import { TemplateWorkspaceNav } from "@/components/templates/template-workspace-nav";
import { CoviePage } from "@/components/ui/covie";
import { calendarId, date, personalFixture, socialFixture, facilitiesFixture, salonFixture } from "./fixtures";
import styles from "@/components/workspace/owner-calendar-workspace.module.css";

export default function Canvas() {
  const [config, setConfig] = useState<{ kind: string; state: string } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search), kind = params.get("kind") || "personal", state = params.get("state") || "populated";
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.origin), day = url.searchParams.get("date") || date;
      if (!url.pathname.startsWith("/api/")) throw new Error("No external requests in synthetic QA");
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      if (init?.method === "POST") return json({ error: "Synthetic QA does not save live changes. Your form stays available." }, 409);
      if (state === "loading") return new Promise<Response>(() => {});
      if (state === "error" || state === "denied") return json({ error: state === "denied" ? "Your calendar access changed. Reload this page." : "The calendar could not be refreshed. Try again." }, state === "denied" ? 403 : 503);
      if (url.pathname === "/api/personal") {
        const data = personalFixture(); data.month = url.searchParams.get("month") || data.month; data.timezone = url.searchParams.get("timezone") || data.timezone;
        if (state === "empty" || data.month !== "2026-10") { data.items = []; data.attention = []; }
        return json(data);
      }
      if (url.pathname === "/api/social-groups") {
        const data = socialFixture(); data.month = url.searchParams.get("month") || data.month;
        if (kind !== "social") { data.role = kind === "social-viewer" ? "viewer" : "member"; data.canOrganise = false; data.canCreate = false; data.canRespond = data.role !== "viewer"; data.events = data.events.map(event => ({ ...event, own: false, canEdit: false })); }
        if (state === "empty" || data.month !== "2026-10") data.events = [];
        return json(data);
      }
      if (url.pathname === "/api/shared-facilities") {
        const data = facilitiesFixture(); data.date = day;
        if (kind === "facilities-member") { data.owner = false; data.role = "member"; }
        if (state === "empty") { data.resources = []; data.bookings = []; }
        if (state === "stress") data.resources = Array.from({ length: 9 }, (_, i) => ({ ...data.resources[0], id: `20000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`, name: `Meeting room ${i+1} with a very long resource name` }));
        return json(data);
      }
      const salon = salonFixture(day);
      if (state === "empty") salon.appointments = [];
      if (state === "stress") {
        salon.practitioners = Array.from({ length: 9 }, (_, i) => ({ ...salon.practitioners[0], id: `20000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`, displayName: `Practitioner ${i+1} Alexandra Longname-Synthetic` }));
        salon.appointments = Array.from({ length: 12 }, (_, i) => ({ ...salon.appointments[0], id: `40000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`, clientName: `Synthetic client ${i+1} with a long name`, notes: "Long synthetic appointment notes. ".repeat(90) }));
      }
      const slots = state === "empty" ? [] : Array.from({ length: 30 }, (_, i) => ({ practitionerId: salon.practitioners[i%2].id, start: `${day}T${String(9+Math.floor(i/3)).padStart(2,"0")}:${String((i%3)*15).padStart(2,"0")}:00Z`, end: `${day}T${String(9+Math.floor(i/3)).padStart(2,"0")}:${String((i%3)*15+30).padStart(2,"0")}:00Z` })).map(slot => ({ ...slot, end: new Date(Date.parse(slot.start)+30*60000).toISOString() }));
      if (url.pathname.startsWith("/api/booking/")) return json({ ...salon.settings, calendarId, timezone: "UTC", date: day, businessName: "Willow Salon", services: salon.services, practitioners: salon.practitioners, slots });
      if (url.pathname.startsWith("/api/appointments/")) return json({ calendarId, businessName: "Willow Salon", location: "Synthetic studio", timezone: "UTC", date: day, appointment: salon.appointments[0] || salonFixture(day).appointments[0], slots });
      if (url.pathname === "/api/salon") return json(url.searchParams.has("serviceId") ? { ...salon, slots } : salon);
      return json({ error: "This auxiliary endpoint is not part of the layout fixture." }, 404);
    };
    setConfig({ kind, state });
    return () => { window.fetch = original; };
  }, []);
  if (!config) return <p>Loading synthetic QA…</p>;
  const { kind } = config;
  const personal = personalFixture();
  if (config.state === "empty") { personal.items = []; personal.attention = []; }
  const content = kind === "personal" ? <PersonalCalendar initialData={personal} /> : kind === "salon-customer" ? <PublicBookingPage calendarId={calendarId} signedIn defaultName="Synthetic Client" initialDate={date} initialService="30000000-0000-4000-8000-000000000001" /> : kind === "appointment" ? <OwnAppointmentPage appointmentId="40000000-0000-4000-8000-000000000001" /> : kind.startsWith("social") ? <SocialGroupsPage calendarId={calendarId} section="calendar" initialDate={date} /> : kind.startsWith("facilities") ? <FacilitiesPage calendarId={calendarId} section="calendar" initialDate={date} /> : <SalonPage calendarId={calendarId} section="calendar" initialDate={date} />;
  const standalone = ["personal", "salon-customer", "appointment"].includes(kind);
  const basePath = `/calendar-types/${kind.startsWith("social") ? "social-groups" : kind.startsWith("facilities") ? "shared-facilities" : "salon-bookings"}`;
  return <div onClickCapture={event => { if (event.target instanceof HTMLElement && event.target.closest("a")) event.preventDefault(); }} onSubmitCapture={event => { if (kind === "personal") event.preventDefault(); }} className={standalone ? "min-h-screen bg-[#FFF9F2]" : "min-h-screen bg-[#FFF9F2] lg:pl-[252px]"}>
    {standalone ? content : <><TemplateWorkspaceNav basePath={basePath} organiserItems={[]} activeSection="calendar" /><CoviePage width="wide" className={`${styles.page} pb-[calc(104px+env(safe-area-inset-bottom))] lg:pb-6`}><div className={styles.calendarHeader}><h1 className="text-2xl font-semibold">{kind.startsWith("social") ? "Neighbourhood group" : kind.startsWith("facilities") ? "Community spaces" : "Willow Salon"}</h1></div><section className={styles.calendarSection}>{content}</section></CoviePage></>}
  </div>;
}
