"use client";

import { Building2, CalendarDays } from "lucide-react";
import { useState } from "react";
import { CovieButton, CovieDialog, CovieInput, CovieNotice, CovieSelect, CovieTextarea } from "@/components/ui/covie";
import { facilityBookingSchema, facilityResourceSchema, type FacilityBooking, type FacilityData, type FacilityResource, type FacilityRules } from "@/lib/shared-facilities/contracts";
import { bookingLocalFields, bookingResourceOptions, facilityWeekdays, minuteInput, newBookingLocalFields } from "./facilities-ui";
import styles from "./facilities.module.css";

export type FacilitySave = (action: "booking" | "resource" | "rules" | "decision", data: unknown) => Promise<boolean>;
type DialogProps = { busy: boolean; error: string; onClose: () => void; onSave: FacilitySave };

export function FacilityRulesSummary({ rules, timezone }: { rules: FacilityRules; timezone: string }) {
  return (
    <details className={styles.rulesSummary}>
      <summary>Booking rules · {timezone}</summary>
      <ul>
        <li>{rules.openDays.map((day) => facilityWeekdays[day].slice(0, 3)).join(", ")} · {minuteInput(rules.openMinute)} to {minuteInput(rules.closeMinute)}</li>
        <li>Bookings last {rules.minDuration} to {rules.maxDuration} minutes, with at least {rules.minNoticeHours} hours’ notice, up to {rules.advanceDays} days ahead.</li>
        <li>Cancel at least {rules.cancellationHours} hours before the start. Members may have up to {rules.maxActiveBookings} active bookings.</li>
        <li>{rules.requireApproval ? "Member bookings need organiser approval. Pending requests do not hold the time slot." : "Bookings are confirmed when saved, if the resource is still available."}</li>
        <li>{rules.shareTitles ? "Booking titles are shared with calendar members. Notes stay private to you and the people managing the resource." : "Other members see occupied times. Your title and notes are visible to you and the people managing the resource."}</li>
      </ul>
    </details>
  );
}

export function FacilityBookingDialog({ data, booking, resourceId, busy, error, onClose, onSave }: DialogProps & { data: FacilityData; booking?: FacilityBooking; resourceId: string }) {
  const resources = bookingResourceOptions(data, booking);
  const [requestId] = useState(() => crypto.randomUUID());
  const [fields, setFields] = useState(() => ({
    resourceId: booking?.resourceId ?? (resources.some((resource) => resource.id === resourceId) ? resourceId : resources[0]?.id ?? ""),
    title: booking?.title ?? "", notes: booking?.notes ?? "",
    ...(booking ? bookingLocalFields(booking, data.timezone) : newBookingLocalFields(data.date, data.rules)),
  }));
  const [validation, setValidation] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = facilityBookingSchema.safeParse({ ...fields, ...(booking ? { id: booking.id, version: booking.version } : { requestId }) });
    if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? "Check the booking details."); return; }
    if (fields.end <= fields.start) { setValidation("End time must be after start time."); return; }
    setValidation("");
    if (await onSave("booking", parsed.data)) onClose();
  }
  return (
    <CovieDialog id="facility-booking-dialog" title={booking ? "Edit booking" : "Book a resource"} description={`All dates and times use ${data.timezone}.`} icon={<CalendarDays aria-hidden="true" />} busy={busy} onClose={onClose}
      footer={<><CovieButton tone="neutral" disabled={busy} onClick={onClose}>Close</CovieButton><CovieButton type="submit" form="facility-booking-form" disabled={busy || resources.length === 0}>{busy ? "Saving…" : booking ? "Save changes" : "Save booking"}</CovieButton></>}>
      <form id="facility-booking-form" onSubmit={submit} className={styles.form}>
        {validation || error ? <CovieNotice tone="danger">{validation || error}</CovieNotice> : null}
        <fieldset disabled={busy} className={styles.form}>
          <label className={styles.field}><span>Resource</span><CovieSelect value={fields.resourceId} required onChange={(event) => setFields({ ...fields, resourceId: event.target.value })}>
            <option value="" disabled>Choose a resource</option>
            {booking && !resources.some((resource) => resource.id === booking.resourceId) ? <option value={booking.resourceId} disabled>{data.resources.find((resource) => resource.id === booking.resourceId)?.name ?? "Archived resource"} · unavailable</option> : null}
            {resources.map((resource) => <option value={resource.id} key={resource.id}>{resource.name}</option>)}
          </CovieSelect></label>
          <div className={styles.formColumns}>
            <label className={styles.field}><span>Start · {data.timezone}</span><CovieInput type="datetime-local" required value={fields.start} onChange={(event) => setFields({ ...fields, start: event.target.value })} /></label>
            <label className={styles.field}><span>End · {data.timezone}</span><CovieInput type="datetime-local" required value={fields.end} onChange={(event) => setFields({ ...fields, end: event.target.value })} /></label>
          </div>
          <label className={styles.field}><span>Booking title <small>(optional)</small></span><CovieInput value={fields.title} maxLength={120} onChange={(event) => setFields({ ...fields, title: event.target.value })} /></label>
          <label className={styles.field}><span>Notes <small>(optional)</small></span><CovieTextarea rows={3} value={fields.notes} maxLength={2000} onChange={(event) => setFields({ ...fields, notes: event.target.value })} /></label>
        </fieldset>
        <FacilityRulesSummary rules={data.rules} timezone={data.timezone} />
        <p className={styles.help}>Availability is checked when you save. {booking && data.rules.requireApproval && !data.owner ? "Changes may need approval again." : ""}</p>
      </form>
    </CovieDialog>
  );
}

export function FacilityResourceDialog({ resource, busy, error, onClose, onSave }: DialogProps & { resource?: FacilityResource }) {
  const [name, setName] = useState(resource?.name ?? "");
  const [description, setDescription] = useState(resource?.description ?? "");
  const [location, setLocation] = useState(resource?.location ?? "");
  const [capacity, setCapacity] = useState(resource?.capacity?.toString() ?? "");
  const [validation, setValidation] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    const parsed = facilityResourceSchema.safeParse({ id: resource?.id, name, description, location, capacity: capacity === "" ? null : Number(capacity), active: resource?.active ?? true });
    if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? "Check the resource details."); return; }
    setValidation(""); if (await onSave("resource", parsed.data)) onClose();
  }
  return (
    <CovieDialog id="facility-resource-dialog" title={resource ? "Edit resource" : "Add resource"} description="Add the details people need before they book." icon={<Building2 aria-hidden="true" />} busy={busy} onClose={onClose}
      footer={<><CovieButton tone="neutral" disabled={busy} onClick={onClose}>Close</CovieButton><CovieButton type="submit" form="facility-resource-form" disabled={busy}>{busy ? "Saving…" : "Save resource"}</CovieButton></>}>
      <form id="facility-resource-form" onSubmit={submit} className={styles.form}>
        {validation || error ? <CovieNotice tone="danger">{validation || error}</CovieNotice> : null}
        <fieldset disabled={busy} className={styles.form}>
          <label className={styles.field}><span>Name</span><CovieInput value={name} required maxLength={100} onChange={(event) => setName(event.target.value)} /></label>
          <label className={styles.field}><span>Location <small>(optional)</small></span><CovieInput value={location} maxLength={160} onChange={(event) => setLocation(event.target.value)} /></label>
          <label className={styles.field}><span>Capacity <small>(optional)</small></span><CovieInput type="number" min={1} max={10000} step={1} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>
          <label className={styles.field}><span>Description <small>(optional)</small></span><CovieTextarea rows={3} value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} /></label>
        </fieldset>
      </form>
    </CovieDialog>
  );
}
