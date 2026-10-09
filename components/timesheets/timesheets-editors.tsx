"use client";

import { useState, type ReactNode } from "react";
import { CovieButton, CovieDialog, CovieInput, CovieNotice, CovieSelect, CovieTextarea } from "@/components/ui/covie";
import { TIMESHEETS_INCREMENTS, type TimesheetsData, type TimesheetsEntry, type TimesheetsStaff, type TimesheetsClient, type TimesheetsProject } from "@/lib/timesheets/contracts";
import { timesheetsLocalTime, timesheetsDisambiguationForInstant, resolveTimesheetsLocalTime } from "@/lib/timesheets/model";
import { TimesheetsHistory } from "./timesheets-history";
import type { TimesheetsSave } from "./use-timesheets-resource";
import styles from "./timesheets.module.css";

export function TimesheetsField({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}{hint ? <span className={styles.fieldHint}>{hint}</span> : null}</label>;
}
const Field = TimesheetsField;
export function minutesLabel(minutes: number) { return `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
export function timesheetsRoleLabel(role: string) { return role === "member" ? "Staff" : role === "manager" ? "Manager" : "Owner"; }

export function TimesheetsEntryEditor({ data, entry, date, defaultStaffId, busy, save, onClose, onUnavailable }: { onUnavailable: () => void; data: TimesheetsData; entry?: TimesheetsEntry; date: string; defaultStaffId: string; busy: boolean; save: TimesheetsSave; onClose: () => void }) {
  const zone = data.organisation.timezone;
  const [staffId, setStaffId] = useState(entry?.staffId ?? defaultStaffId);
  const [clientId, setClientId] = useState(entry?.clientId ?? "");
  const [projectId, setProjectId] = useState(entry?.projectId ?? "");
  const [startLocal, setStart] = useState(entry ? timesheetsLocalTime(entry.start, zone) : `${date}T09:00`);
  const [endLocal, setEnd] = useState(entry ? timesheetsLocalTime(entry.end, zone) : `${date}T10:00`);
  const [startDisambiguation, setStartDisambiguation] = useState(entry ? timesheetsDisambiguationForInstant(entry.start, zone) ?? "" : "");
  const [endDisambiguation, setEndDisambiguation] = useState(entry ? timesheetsDisambiguationForInstant(entry.end, zone) ?? "" : "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [billable, setBillable] = useState(entry?.billable ?? false);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState("");
  const others = staffId !== data.ownStaffId;
  let increment: number = data.organisation.incrementMinutes;
  let timingError = "", preview = 0;
  try {
    const start = resolveTimesheetsLocalTime(startLocal, zone, startDisambiguation === "earlier" || startDisambiguation === "later" ? startDisambiguation : undefined);
    const end = resolveTimesheetsLocalTime(endLocal, zone, endDisambiguation === "earlier" || endDisambiguation === "later" ? endDisambiguation : undefined);
    if (entry && Date.parse(start) === Date.parse(entry.start) && Date.parse(end) === Date.parse(entry.end)) increment = entry.incrementMinutes;
    preview = (Date.parse(end) - Date.parse(start)) / 60000;
    if (preview <= 0 || preview > 1440) timingError = "Choose an end after the start, up to 24 elapsed hours.";
    else if (!Number.isInteger(preview) || preview % increment !== 0) timingError = `Duration must be an exact multiple of ${increment} minutes. Time is never rounded.`;
  } catch (caught) { timingError = caught instanceof RangeError ? caught.message : "Choose valid whole-minute start and end times."; }
  const availableStaff = data.staff.filter(person => person.active || person.id === entry?.staffId);
  const activeClients = data.clients.filter(client => client.active || client.id === clientId);
  const projects = data.projects.filter(project => project.clientId === clientId && (project.active || project.id === projectId));
  return <CovieDialog id="timesheets-entry" title={deleting ? "Delete this work block?" : entry ? "Edit work block" : "Add work block"} description={`Times are in ${zone}.`} busy={busy} onClose={onClose}>
    <form className={styles.form} onSubmit={async event => {
      event.preventDefault(); setError("");
      if (busy) return;
      if (others && reason.trim().length < 3) { setError("Add a reason of at least 3 characters when recording or changing another person’s work."); return; }
      if (deleting && entry) { await save("deleteEntry", { id: entry.id, version: entry.version, ...(reason.trim() ? { reason: reason.trim() } : {}) }); return; }
      if (timingError) { setError(timingError); return; }
      await save("saveEntry", { organisationVersion: data.organisation.version, ...(entry ? { id: entry.id, version: entry.version } : {}), staffId, clientId: clientId || null, projectId: projectId || null, startLocal, endLocal, ...(startDisambiguation ? { startDisambiguation } : {}), ...(endDisambiguation ? { endDisambiguation } : {}), notes, billable, ...(reason.trim() ? { reason: reason.trim() } : {}) });
    }}>
      <fieldset disabled={busy} className={styles.form}>
        {deleting ? <p className={styles.muted}>This removes the work block from the timesheet and totals. A record of the correction is retained.</p> : <>
          <Field label="Staff member"><CovieSelect value={staffId} required disabled={Boolean(entry) || data.role === "member"} onChange={event => setStaffId(event.target.value)}>{availableStaff.map(person => <option key={person.id} value={person.id}>{person.displayName}{person.own ? " (you)" : ""}</option>)}</CovieSelect></Field>
          <div className={styles.formGrid}>
            <Field label="Start"><CovieInput type="datetime-local" step={60} value={startLocal} onChange={event => setStart(event.target.value)} required /></Field>
            <Field label="End"><CovieInput type="datetime-local" step={60} value={endLocal} onChange={event => setEnd(event.target.value)} required /></Field>
          </div>
          <details><summary className={styles.muted}>Daylight-saving repeated hour</summary><p className={styles.muted}>If a clock time occurs twice, choose its first or second occurrence. Nonexistent clock times cannot be saved.</p><div className={styles.formGrid}>
            <Field label="Start occurrence"><CovieSelect value={startDisambiguation} onChange={event => setStartDisambiguation(event.target.value as "" | "earlier" | "later")}><option value="">Choose only if repeated</option><option value="earlier">First occurrence</option><option value="later">Second occurrence</option></CovieSelect></Field>
            <Field label="End occurrence"><CovieSelect value={endDisambiguation} onChange={event => setEndDisambiguation(event.target.value as "" | "earlier" | "later")}><option value="">Choose only if repeated</option><option value="earlier">First occurrence</option><option value="later">Second occurrence</option></CovieSelect></Field>
          </div></details>
          <p className={styles.muted} aria-live="polite">{timingError || `${minutesLabel(preview)} elapsed. ${increment}-minute increments; no rounding.`}</p>
          <div className={styles.formGrid}>
            <Field label="Client"><CovieSelect value={clientId} onChange={event => { setClientId(event.target.value); setProjectId(""); }}><option value="">No client</option>{activeClients.map(client => <option key={client.id} value={client.id}>{client.name}{client.active ? "" : " (inactive)"}</option>)}</CovieSelect></Field>
            <Field label="Project"><CovieSelect value={projectId} disabled={!clientId} onChange={event => setProjectId(event.target.value)}><option value="">No project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}{project.active ? "" : " (inactive)"}</option>)}</CovieSelect></Field>
          </div>
          <Field label="Work notes"><CovieTextarea value={notes} rows={4} maxLength={4000} onChange={event => setNotes(event.target.value)} placeholder="What did you work on?" /></Field>
          <label className={styles.check}><input type="checkbox" checked={billable} onChange={event => setBillable(event.target.checked)} />Billable work</label>
          <p className={styles.muted}>Use whole-minute times with an exact elapsed duration in {increment}-minute multiples. Existing entries keep their recorded timezone and increment unless their timing changes.</p>
        </>}
        {entry && !deleting ? <><CovieButton tone="neutral" disabled={busy} onClick={() => setHistoryOpen(value => !value)} aria-expanded={historyOpen}>{historyOpen ? "Hide change history" : "View change history"}</CovieButton>{historyOpen ? <TimesheetsHistory data={data} entryId={entry.id} onUnavailable={onUnavailable} /> : null}</> : null}
        {others ? <Field label="Reason for this correction" hint="Required for work recorded or changed on behalf of someone else."><CovieTextarea required minLength={3} rows={2} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></Field> : null}
        {error ? <CovieNotice tone="danger" role="alert">{error}</CovieNotice> : null}
        <div className={styles.actions}><CovieButton type="submit" tone={deleting ? "danger" : "teal"} disabled={busy || (!deleting && Boolean(timingError))}>{busy ? "Saving…" : deleting ? "Delete work block" : "Save work block"}</CovieButton><CovieButton tone="neutral" disabled={busy} onClick={deleting ? () => setDeleting(false) : onClose}>{deleting ? "Keep work block" : "Cancel"}</CovieButton>{entry && !deleting ? <CovieButton tone="neutral" disabled={busy} onClick={() => setDeleting(true)}>Delete</CovieButton> : null}</div>
      </fieldset>
    </form>
  </CovieDialog>;
}

export function TimesheetsStaffEditor({ data, staff, busy, save, onClose }: { data: TimesheetsData; staff?: TimesheetsStaff; busy: boolean; save: TimesheetsSave; onClose: () => void }) {
  const [displayName, setName] = useState(staff?.displayName ?? "");
  const [email, setEmail] = useState(staff?.email ?? "");
  const [role, setRole] = useState(staff?.role === "manager" ? "manager" : "member");
  const [active, setActive] = useState(staff?.active ?? true);
  return <CovieDialog id="timesheets-staff" title={staff ? "Edit staff profile" : "Add staff profile"} busy={busy} onClose={onClose} description="An invitation is tied to this person’s email. No email is sent automatically."><form className={styles.form} onSubmit={async event => { event.preventDefault(); await save("saveStaff", { ...(staff ? { id: staff.id, version: staff.version } : {}), displayName, email, role, active }); }}><fieldset disabled={busy} className={styles.form}>
    <Field label="Name"><CovieInput value={displayName} maxLength={100} onChange={event => setName(event.target.value)} required /></Field>
    <Field label="Email" hint={staff?.linked ? "This profile is linked to an account. Its email cannot be changed here." : "The staff member must sign in with this email to accept their invitation."}><CovieInput type="email" value={email} maxLength={254} disabled={staff?.linked} onChange={event => setEmail(event.target.value)} required /></Field>
    <Field label="Role"><CovieSelect value={role} disabled={data.role !== "owner"} onChange={event => setRole(event.target.value)}><option value="member">Staff</option><option value="manager">Manager</option></CovieSelect></Field>
    {role === "manager" ? <p className={styles.muted}>Managers see their own work and the staff assigned to them by the owner.</p> : null}
    {staff ? <label className={styles.check}><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />Active staff member</label> : null}
    <div className={styles.actions}><CovieButton type="submit" tone="teal" disabled={busy}>{busy ? "Saving…" : "Save staff profile"}</CovieButton><CovieButton tone="neutral" disabled={busy} onClick={onClose}>Cancel</CovieButton></div>
  </fieldset></form></CovieDialog>;
}

export function TimesheetsClassificationEditor({ kind, record, data, busy, save, onClose }: { kind: "client" | "project"; record?: TimesheetsClient | TimesheetsProject; data: TimesheetsData; busy: boolean; save: TimesheetsSave; onClose: () => void }) {
  const [name, setName] = useState(record?.name ?? "");
  const [active, setActive] = useState(record?.active ?? true);
  const [clientId, setClientId] = useState(record && "clientId" in record ? record.clientId : data.clients.find(client => client.active)?.id ?? "");
  return <CovieDialog id="timesheets-classification" title={`${record ? "Edit" : "Add"} ${kind}`} busy={busy} onClose={onClose}><form className={styles.form} onSubmit={async event => { event.preventDefault(); await save(kind === "client" ? "saveClient" : "saveProject", { ...(record ? { id: record.id, version: record.version } : {}), name, active, ...(kind === "project" ? { clientId } : {}) }); }}><fieldset disabled={busy} className={styles.form}>
    <Field label={kind === "client" ? "Client name" : "Project name"}><CovieInput value={name} maxLength={120} onChange={event => setName(event.target.value)} required /></Field>
    {kind === "project" ? <Field label="Client" hint={record ? "The client of an existing project cannot change; create a new project for another client." : undefined}><CovieSelect required disabled={Boolean(record)} value={clientId} onChange={event => setClientId(event.target.value)}><option value="">Choose a client</option>{data.clients.filter(client => client.active || client.id === clientId).map(client => <option value={client.id} key={client.id}>{client.name}</option>)}</CovieSelect></Field> : null}
    {record ? <label className={styles.check}><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />Active {kind}</label> : null}
    <p className={styles.muted}>Making this {kind} inactive preserves existing work records.</p>
    <div className={styles.actions}><CovieButton type="submit" tone="teal" disabled={busy}>{busy ? "Saving…" : `Save ${kind}`}</CovieButton><CovieButton tone="neutral" disabled={busy} onClick={onClose}>Cancel</CovieButton></div>
  </fieldset></form></CovieDialog>;
}

export function TimesheetsSettings({ data, busy, save }: { data: TimesheetsData; busy: boolean; save: TimesheetsSave }) {
  const [name, setName] = useState(data.organisation.name);
  const [timezone, setTimezone] = useState(data.organisation.timezone);
  const [increment, setIncrement] = useState<number>(data.organisation.incrementMinutes);
  return <form className={styles.form} onSubmit={async event => { event.preventDefault(); await save("saveSettings", { name, timezone, incrementMinutes: increment, version: data.organisation.version }); }}><fieldset disabled={busy} className={styles.form}>
    <Field label="Organisation name"><CovieInput value={name} required maxLength={120} onChange={event => setName(event.target.value)} /></Field>
    <Field label="Organisation timezone" hint="Use an IANA timezone, for example Pacific/Auckland, Europe/London or America/New_York."><CovieInput required value={timezone} maxLength={100} onChange={event => setTimezone(event.target.value)} /></Field>
    <Field label="Time increment" hint="15 minutes by default. Durations must be exact elapsed-time multiples; no rounding."><CovieSelect value={increment} onChange={event => setIncrement(Number(event.target.value))}>{TIMESHEETS_INCREMENTS.map(value => <option key={value} value={value}>{value} minutes</option>)}</CovieSelect></Field>
    <CovieNotice>Changing these settings leaves existing entries unchanged. New work blocks and timing changes use the configured increment; each entry keeps its recorded timezone and increment.</CovieNotice>
    <div className={styles.actions}><CovieButton type="submit" tone="teal" disabled={busy}>{busy ? "Saving…" : "Save settings"}</CovieButton></div>
  </fieldset></form>;
}
