"use client";

import { CalendarDays, MapPin, UsersRound } from "lucide-react";
import { useState } from "react";
import { CovieButton, CovieDialog, CovieInput, CovieNotice, CovieStatusBadge, CovieTextarea } from "@/components/ui/covie";
import { socialEventSchema, type SocialData, type SocialEvent } from "@/lib/social-groups/contracts";
import { canEditSocialEvent, canRespondToSocialEvent, newSocialEventLocalFields, socialEventIsFull, socialEventLocalFields, socialResponses, socialTimestamp, type SocialSave } from "./social-ui";
import styles from "./social-groups.module.css";

export function SocialEventEditor({ data, event, date, busy, blocked = false, error, onSave, onSaved, onClose }: { data: SocialData; event?: SocialEvent; date: string; busy: boolean; blocked?: boolean; error: string; onSave: SocialSave; onSaved: (date: string) => void; onClose: () => void }) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [fields, setFields] = useState(() => ({ title: event?.title ?? "", location: event?.location ?? "", notes: event?.notes ?? "", capacity: event?.capacity?.toString() ?? "", ...(event ? socialEventLocalFields(event, data.timezone) : newSocialEventLocalFields(date, data.timezone)) }));
  const [validation, setValidation] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy || blocked) return;
    const parsed = socialEventSchema.safeParse({ ...fields, capacity: fields.capacity === "" ? null : Number(fields.capacity), ...(event ? { id: event.id, version: event.version } : { requestId }) });
    if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? "Check the event details."); return; }
    if (fields.end <= fields.start) { setValidation("End time must be after start time."); return; }
    setValidation(""); if (await onSave("event", parsed.data)) onSaved(fields.start.slice(0, 10));
  }
  return <CovieDialog id="social-event-editor" title={event ? "Edit event" : "Create event"} description={`All dates and times use ${data.timezone}.`} icon={<CalendarDays aria-hidden="true" />} iconTone="coral" busy={busy} onClose={onClose} footer={<><CovieButton tone="neutral" disabled={busy} onClick={onClose}>Close</CovieButton><CovieButton type="submit" form="social-event-form" disabled={busy || blocked}>{busy ? "Saving…" : event ? "Save changes" : "Create event"}</CovieButton></>}>
    <form id="social-event-form" onSubmit={submit} className={styles.form}>
      {validation || error ? <CovieNotice tone="danger">{validation || error}</CovieNotice> : null}
      <fieldset className={styles.form} disabled={busy}>
        <label className={styles.field}><span>Event title</span><CovieInput required maxLength={120} value={fields.title} onChange={(e) => setFields({ ...fields, title: e.target.value })} /></label>
        <div className={styles.formColumns}><label className={styles.field}><span>Start · {data.timezone}</span><CovieInput type="datetime-local" required value={fields.start} onChange={(e) => setFields({ ...fields, start: e.target.value })} /></label><label className={styles.field}><span>End · {data.timezone}</span><CovieInput type="datetime-local" required value={fields.end} onChange={(e) => setFields({ ...fields, end: e.target.value })} /></label></div>
        <label className={styles.field}><span>Location <small>(optional)</small></span><CovieInput maxLength={200} value={fields.location} onChange={(e) => setFields({ ...fields, location: e.target.value })} /></label>
        <label className={styles.field}><span>Capacity <small>(optional)</small></span><CovieInput type="number" min={1} max={10000} step={1} value={fields.capacity} onChange={(e) => setFields({ ...fields, capacity: e.target.value })} /><span className={styles.help}>Leave blank for no limit. Capacity counts people who respond Going.{event ? ` ${event.going} currently going.` : ""}</span></label>
        <label className={styles.field}><span>Notes <small>(optional)</small></span><CovieTextarea rows={3} maxLength={3000} value={fields.notes} onChange={(e) => setFields({ ...fields, notes: e.target.value })} /></label>
      </fieldset>
      <p className={styles.help}>Events can overlap. Covie lets members know when their Going responses overlap.</p>
    </form>
  </CovieDialog>;
}

export function SocialEventDetail({ data, event, busy, loading, blocked, error, notice, onClose, onEdit, onCancel, onSave, onReload }: { data: SocialData; event: SocialEvent; busy: boolean; loading: boolean; blocked: boolean; error: string; notice: string; onClose: () => void; onEdit: () => void; onCancel: () => void; onSave: SocialSave; onReload: () => void }) {
  const canRespond = canRespondToSocialEvent(data, event);
  const canEdit = canEditSocialEvent(data, event);
  const full = socialEventIsFull(event);
  return <CovieDialog id="social-event-detail" title={event.title} description={`Times use ${data.timezone}.`} icon={<CalendarDays aria-hidden="true" />} iconTone="coral" busy={busy} onClose={onClose} footer={<><CovieButton tone="neutral" disabled={busy} onClick={onClose}>Close</CovieButton>{canEdit ? <><CovieButton tone="neutral" disabled={busy || loading || blocked} onClick={onCancel}>Cancel event</CovieButton><CovieButton disabled={busy || loading || blocked} onClick={onEdit}>Edit event</CovieButton></> : null}</>}>
    <div className={styles.stack}>
      {event.cancelled ? <CovieNotice>This event was cancelled. Its details and responses are kept for reference.</CovieNotice> : null}
      {error ? <CovieNotice tone="danger">{error}<div className={styles.actions}><CovieButton tone="neutral" disabled={busy || loading} onClick={onReload}>Reload event</CovieButton></div></CovieNotice> : null}
      {notice ? <CovieNotice tone="teal">{notice}</CovieNotice> : null}
      {loading ? <p className={styles.help} role="status">Refreshing responses…</p> : null}
      <p className={styles.eventTime}>{socialTimestamp(event.start, data.timezone)} to {socialTimestamp(event.end, data.timezone)}</p>
      {event.location ? <p className={styles.location}><MapPin size={17} aria-hidden="true" />{event.location}</p> : null}
      {event.notes ? <p className={styles.notes}>{event.notes}</p> : null}
      <div className={styles.attendanceSummary}><UsersRound size={18} aria-hidden="true" /><strong>{event.going} going</strong>{event.capacity !== null ? <span>of {event.capacity} places</span> : <span>No capacity limit</span>}{full && !event.cancelled ? <CovieStatusBadge tone="sunshine">Full</CovieStatusBadge> : null}</div>
      {canRespond ? <section className={styles.stack} aria-label="Your response"><h3 className={styles.subheading}>Can you make it?</h3><div className={styles.responses} role="group" aria-label="Your RSVP">{socialResponses.map((response) => <button type="button" key={response.value} aria-pressed={event.myResponse === response.value} disabled={busy || loading || blocked || (response.value === "going" && full && event.myResponse !== "going")} onClick={() => void onSave("rsvp", { eventId: event.id, response: response.value })}>{response.label}</button>)}</div>{full && event.myResponse !== "going" ? <p className={styles.help}>This event is full. You can choose Maybe or Cannot make it.</p> : null}</section> : !event.cancelled ? <p className={styles.help}>{data.role === "viewer" ? "You have view-only access. Ask the organiser for member access to respond." : "Responses are closed for this event."}</p> : null}
      <section className={styles.stack} aria-label="Group responses"><h3 className={styles.subheading}>Who is coming?</h3>{event.attendees.length ? <div className={styles.attendees}>{socialResponses.map((response) => {
        const attendees = event.attendees.filter((attendee) => attendee.response === response.value);
        return attendees.length ? <div key={response.value}><strong>{response.label} · {attendees.length}</strong><ul>{attendees.map((attendee, index) => <li key={`${attendee.name}-${index}`}>{attendee.name}</li>)}</ul></div> : null;
      })}</div> : <p className={styles.help}>No responses yet.</p>}</section>
    </div>
  </CovieDialog>;
}
