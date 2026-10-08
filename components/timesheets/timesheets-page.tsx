"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { CovieButton, CovieEmptyState, CovieIconButton, CovieInput, CovieNotice, CovieSelect, CovieStatusBadge } from "@/components/ui/covie";
import type { TimesheetsClient, TimesheetsData, TimesheetsEntry, TimesheetsProject, TimesheetsStaff } from "@/lib/timesheets/contracts";
import { splitTimesheetsEntryByDay, timesheetsDateRange, timesheetsLocalTime } from "@/lib/timesheets/model";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { TimesheetsClassificationEditor, TimesheetsEntryEditor, TimesheetsField, TimesheetsSettings, TimesheetsStaffEditor, minutesLabel, timesheetsRoleLabel } from "./timesheets-editors";
import { useTimesheetsResource, type TimesheetsSave } from "./use-timesheets-resource";
import styles from "./timesheets.module.css";

type Props = { calendarId: string; section: "calendar" | "updates" | "organiser"; tool?: string; initialDate?: string };
type Editor = { kind: "entry"; entry?: TimesheetsEntry; date: string; staffId: string } | { kind: "staff"; staff?: TimesheetsStaff } | { kind: "client" | "project"; record?: TimesheetsClient | TimesheetsProject };
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) => new Intl.DateTimeFormat("en-NZ", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
function shiftDate(date: string, amount: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); }

export function TimesheetsPage(props: Props) { return <TimesheetsResourcePage key={`${props.calendarId}:${props.section}:${props.tool ?? ""}:${props.initialDate ?? ""}`} {...props} />; }
function TimesheetsResourcePage({ calendarId, section, tool, initialDate = "" }: Props) {
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : "");
  const [view, setView] = useState<"day" | "week">("week");
  const [staffFilter, setStaffFilter] = useState("");
  const resource = useTimesheetsResource(calendarId, date, view);
  const data = resource.data;
  return <div className={styles.stack}>
    {resource.error ? <CovieNotice tone="danger" role="alert">{resource.error}<div className={styles.actions}><CovieButton tone="neutral" onClick={() => void resource.refresh()}>Try again</CovieButton></div></CovieNotice> : null}
    {resource.feedback?.error ? <CovieNotice tone="danger" role="alert">{resource.feedback.error}</CovieNotice> : null}
    {resource.loading ? <p className={styles.muted} role="status">Loading timesheets…</p> : null}
    {data ? <>
      {resource.feedback?.notice ? <CovieNotice tone="teal" role="status">{resource.feedback.notice}</CovieNotice> : null}
      {resource.feedback?.invitationUrl ? <TimesheetsField label="Personal invitation link" hint="Only the named staff member can accept this link using their profile email. It is shown only after creation."><CovieInput readOnly value={resource.feedback.invitationUrl} onFocus={event => event.target.select()} /></TimesheetsField> : null}
      <TimesheetsWorkspace key={resource.generation} staffFilter={data.role === "member" ? data.ownStaffId ?? "all" : staffFilter === "all" || data.staff.some(person => person.id === staffFilter) ? staffFilter : data.ownStaffId ?? "all"} setStaffFilter={setStaffFilter} data={data} section={section} tool={tool} busy={resource.busy} save={resource.save} refresh={() => void resource.refresh()} setDate={setDate} setView={setView} />
    </> : null}
  </div>;
}

function TimesheetsWorkspace({ data, section, tool, busy, save, refresh, setDate, setView, staffFilter, setStaffFilter }: { staffFilter: string; setStaffFilter: (value: string) => void; data: TimesheetsData; section: Props["section"]; tool?: string; busy: boolean; save: TimesheetsSave; refresh: () => void; setDate: (date: string) => void; setView: (view: "day" | "week") => void }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const owner = data.role === "owner", manager = data.role === "manager";
  const own = data.staff.find(person => person.id === data.ownStaffId);
  const staff = data.staff.filter(person => staffFilter === "all" || person.id === staffFilter);
  const staffIds = new Set(staff.map(person => person.id));
  const entries = data.entries.filter(entry => staffIds.has(entry.staffId));
  const total = data.totals.filter(value => staffIds.has(value.staffId)).reduce((sum, item) => ({ total: sum.total + item.totalMinutes, billable: sum.billable + item.billableMinutes }), { total: 0, billable: 0 });
  const edit = (entry: TimesheetsEntry) => setEditor({ kind: "entry", entry, date: data.date, staffId: entry.staffId });
  const add = (date = data.date) => setEditor({ kind: "entry", date, staffId: staffFilter !== "all" ? staffFilter : data.ownStaffId ?? data.staff.find(person => person.active)?.id ?? "" });
  const selectedPerson = data.staff.find(person => person.id === staffFilter);
  const canAdd = Boolean(staffFilter === "all" ? data.staff.some(person => person.active) : selectedPerson?.active);
  const canManage = (person: TimesheetsStaff) => person.role !== "owner" && (owner || (manager && person.role === "member" && data.assignments.some(assignment => assignment.managerStaffId === data.ownStaffId && assignment.staffId === person.id)));
  const actionsDisabled = busy;
  let content;
  if (section === "organiser" && tool === "settings") {
    content = owner ? <TimesheetsSettings data={data} busy={busy} save={save} /> : <CovieNotice>Only the organisation owner can change these settings.</CovieNotice>;
  } else if (section === "organiser" && tool === "clients-projects") {
    content = owner ? <div className={styles.stack}>
      <div className={styles.actions}><CovieButton tone="teal" disabled={busy} onClick={() => setEditor({ kind: "client" })}>Add client</CovieButton><CovieButton tone="neutral" disabled={busy || !data.clients.some(client => client.active)} onClick={() => setEditor({ kind: "project" })}>Add project</CovieButton></div>
      {!data.clients.length ? <CovieEmptyState icon={<Clock3 />} title="Organise your work" description="Add a client, then create projects for that client. Work blocks can also be recorded without either." /> : null}
      <div className={styles.cardGrid}>{data.clients.map(client => <article key={client.id} className={styles.card}>
        <div className={styles.toolbar}><h2 className={styles.cardTitle}>{client.name}</h2><CovieStatusBadge tone={client.active ? "teal" : "neutral"}>{client.active ? "Active" : "Inactive"}</CovieStatusBadge></div>
        <CovieButton tone="neutral" disabled={busy} onClick={() => setEditor({ kind: "client", record: client })}>Edit {client.name}</CovieButton>
        {data.projects.filter(project => project.clientId === client.id).map(project => <div className={styles.toolbar} key={project.id}><span>{project.name}{project.active ? "" : " (inactive)"}</span><CovieButton tone="neutral" disabled={busy} onClick={() => setEditor({ kind: "project", record: project })}>Edit {project.name}</CovieButton></div>)}
      </article>)}</div>
    </div> : <CovieNotice>Only the organisation owner can manage clients and projects.</CovieNotice>;
  } else if (section === "organiser" && tool === "team") {
    content = owner || manager ? <div className={styles.stack}>
      <div className={styles.toolbar}><p className={styles.muted}>{owner ? "Add profiles, assign managers and create personal invitation links. Invitations do not send email." : "You can manage member profiles and work for staff assigned to you. Only the owner assigns managers."}</p>{owner ? <CovieButton tone="teal" disabled={busy} onClick={() => setEditor({ kind: "staff" })}>Add staff member</CovieButton> : null}</div>
      <div className={styles.cardGrid}>{data.staff.map(person => <article key={person.id} className={styles.card}>
        <div className={styles.toolbar}><h2 className={styles.cardTitle}>{person.displayName}{person.own ? " (you)" : ""}</h2><CovieStatusBadge tone={person.active ? "teal" : "neutral"}>{timesheetsRoleLabel(person.role)}{person.active ? "" : " · inactive"}</CovieStatusBadge></div>
        <p className={styles.muted}>{person.email}<br />{person.linked ? "Account connected" : "Not yet connected"}</p>
        {canManage(person) ? <div className={styles.actions}><CovieButton tone="neutral" disabled={busy} onClick={() => setEditor({ kind: "staff", staff: person })}>Edit profile</CovieButton>{person.active && !person.linked ? <CovieButton tone="teal" disabled={busy} onClick={() => void save("createInvite", { staffId: person.id })}>Create invitation link</CovieButton> : null}</div> : null}
        {owner && person.role === "member" ? <fieldset disabled={busy}><legend className={styles.muted}>Assigned managers</legend>{data.staff.filter(candidate => candidate.role === "manager" && candidate.active).map(candidate => <label className={styles.check} key={candidate.id}><input type="checkbox" checked={data.assignments.some(assignment => assignment.managerStaffId === candidate.id && assignment.staffId === person.id)} onChange={event => void save("assignManager", { managerStaffId: candidate.id, staffId: person.id, assigned: event.target.checked })} />{candidate.displayName}</label>)}{!data.staff.some(candidate => candidate.role === "manager" && candidate.active) ? <p className={styles.muted}>Add a manager profile to assign oversight.</p> : null}</fieldset> : null}
        {canManage(person) ? data.invitations.filter(invite => invite.staffId === person.id).map(invite => <div className={styles.card} key={invite.id}><p className={styles.muted}>{invite.email}<br />{invite.used ? "Accepted" : invite.revoked ? "Revoked" : new Date(invite.expiresAt).getTime() <= Date.now() ? "Expired" : `Pending · expires ${dateLabel(invite.expiresAt.slice(0, 10))}`}</p>{!invite.used && !invite.revoked && new Date(invite.expiresAt).getTime() > Date.now() ? <CovieButton tone="neutral" disabled={busy} onClick={() => void save("revokeInvite", { id: invite.id })}>Revoke invitation</CovieButton> : null}</div>) : null}
      </article>)}</div>
    </div> : <CovieNotice>Your own work blocks are available on the calendar.</CovieNotice>;
  } else if (section === "updates") {
    content = <CovieNotice>Timesheets show saved work immediately. Open the calendar to review recorded hours and billable totals. A reason is required when someone changes another staff member’s work.<div className={styles.actions}><Link href="/calendar-types/timesheets" className={styles.link}>Open timesheet calendar</Link></div></CovieNotice>;
  } else {
    content = <div className={styles.stack}>
      <div className={styles.toolbar}><div><h1 className={styles.title}>Work calendar</h1><p className={styles.muted}>{data.organisation.name} · {data.organisation.timezone} · {timesheetsRoleLabel(data.role)}</p></div><div className={styles.actions}><CovieIconButton aria-label="Refresh timesheets" disabled={actionsDisabled} onClick={refresh}><RefreshCw size={18} /></CovieIconButton><CovieButton tone="teal" disabled={actionsDisabled || !canAdd} onClick={() => add()}><Plus size={18} aria-hidden="true" />Add work block</CovieButton></div></div>
      <div className={styles.toolbar}>
        <div className={styles.actions}><CovieIconButton aria-label={`Previous ${data.view}`} disabled={actionsDisabled} onClick={() => setDate(shiftDate(data.date, data.view === "day" ? -1 : -7))}><ChevronLeft size={18} /></CovieIconButton><TimesheetsField label="Selected date"><CovieInput type="date" aria-label="Selected date" value={data.date} disabled={actionsDisabled} onChange={event => { if (event.target.value) setDate(event.target.value); }} /></TimesheetsField><CovieIconButton aria-label={`Next ${data.view}`} disabled={actionsDisabled} onClick={() => setDate(shiftDate(data.date, data.view === "day" ? 1 : 7))}><ChevronRight size={18} /></CovieIconButton><CovieButton tone="neutral" disabled={actionsDisabled} onClick={() => setDate(localDateInTimeZone(data.organisation.timezone))}>Today</CovieButton></div>
        <div className={styles.actions} role="group" aria-label="Calendar view"><CovieButton tone={data.view === "day" ? "teal" : "neutral"} aria-pressed={data.view === "day"} disabled={actionsDisabled} onClick={() => setView("day")}>Day</CovieButton><CovieButton tone={data.view === "week" ? "teal" : "neutral"} aria-pressed={data.view === "week"} disabled={actionsDisabled} onClick={() => setView("week")}>Week</CovieButton></div>
      </div>
      {owner || manager ? <TimesheetsField label="Show work for"><CovieSelect value={staffFilter} disabled={actionsDisabled} onChange={event => setStaffFilter(event.target.value)}><option value="all">{owner ? "All staff" : "My assigned team and me"}</option>{data.staff.map(person => <option key={person.id} value={person.id}>{person.displayName}{person.own ? " (you)" : ""}{person.active ? "" : " (inactive)"}</option>)}</CovieSelect></TimesheetsField> : <p className={styles.muted}>{own?.displayName ?? "Your timesheet"} · Your own work only</p>}
      <section className={styles.metrics} aria-label="Selected period totals"><div className={styles.metric}><strong>{minutesLabel(total.total)}</strong><span>Total recorded</span></div><div className={styles.metric}><strong>{minutesLabel(total.billable)}</strong><span>Billable</span></div><div className={styles.metric}><strong>{minutesLabel(total.total - total.billable)}</strong><span>Non-billable</span></div></section>
      <p className={styles.muted}>{data.organisation.incrementMinutes}-minute increments · exact elapsed time, no rounding. {data.view === "week" ? "Scroll across the week on smaller screens, or choose Day." : "Choose a work block to see its details or make a correction."}</p>
      <TimesheetsCalendar data={data} entries={entries} disabled={actionsDisabled} edit={edit} add={canAdd ? add : undefined} />
      {owner || manager ? <table className={styles.summaryTable}><caption>{owner ? "Team totals" : "Assigned team totals"} · {data.view}</caption><thead><tr><th scope="col">Staff member</th><th scope="col">Recorded</th><th scope="col">Billable</th></tr></thead><tbody>{staff.map(person => { const item = data.totals.find(total => total.staffId === person.id); return <tr key={person.id}><th scope="row">{person.displayName}</th><td>{minutesLabel(item?.totalMinutes ?? 0)}</td><td>{minutesLabel(item?.billableMinutes ?? 0)}</td></tr>; })}</tbody></table> : null}
      <TimesheetsExport data={data} disabled={actionsDisabled} />
    </div>;
  }
  return <>{content}{editor?.kind === "entry" ? <TimesheetsEntryEditor onUnavailable={refresh} data={data} date={editor.date} defaultStaffId={editor.staffId} entry={editor.entry} busy={busy} save={save} onClose={() => setEditor(null)} /> : editor?.kind === "staff" ? <TimesheetsStaffEditor data={data} staff={editor.staff} busy={busy} save={save} onClose={() => setEditor(null)} /> : editor ? <TimesheetsClassificationEditor kind={editor.kind} record={editor.record} data={data} busy={busy} save={save} onClose={() => setEditor(null)} /> : null}</>;
}

function TimesheetsCalendar({ data, entries, disabled, edit, add }: { data: TimesheetsData; entries: TimesheetsEntry[]; disabled: boolean; edit: (entry: TimesheetsEntry) => void; add?: (date: string) => void }) {
  const dates = timesheetsDateRange(data.date, data.view).dates;
  const today = localDateInTimeZone(data.organisation.timezone);
  return <div className={styles.boardScroll} role="region" aria-label={`${data.view === "week" ? "Week" : "Day"} work calendar`} tabIndex={0}><div className={`${styles.board} ${data.view === "day" ? styles.dayBoard : ""}`}>
    {dates.map(date => {
      const blocks = entries.map(entry => ({ entry, segment: splitTimesheetsEntryByDay(entry, data.organisation.timezone).find(segment => segment.date === date) })).filter(value => value.segment).sort((a, b) => a.entry.start.localeCompare(b.entry.start));
      const total = blocks.reduce((sum, block) => sum + (block.segment?.totalMinutes ?? 0), 0);
      return <section className={styles.day} key={date} aria-label={dateLabel(date, { weekday: "long", day: "numeric", month: "long" })}><header className={styles.dayHeader} data-today={date === today}><strong>{dateLabel(date)}</strong><span>{minutesLabel(total)} recorded{date === today ? " · Today" : ""}</span></header><div className={styles.dayEntries}>
        {blocks.map(({ entry, segment }) => {
          const startLocal = timesheetsLocalTime(entry.start, data.organisation.timezone), endLocal = timesheetsLocalTime(entry.end, data.organisation.timezone);
          const time = `${startLocal.slice(0, 10) < date ? "00:00" : startLocal.slice(11)}–${endLocal.slice(0, 10) > date ? "24:00" : endLocal.slice(11)}`;
          const person = data.staff.find(person => person.id === entry.staffId);
          const client = data.clients.find(client => client.id === entry.clientId), project = data.projects.find(project => project.id === entry.projectId);
          return <button type="button" className={styles.block} data-billable={entry.billable} key={entry.id} disabled={disabled} onClick={() => edit(entry)} aria-label={`${person?.displayName ?? "Staff"}, ${dateLabel(date)}, ${time}, ${minutesLabel(segment!.totalMinutes)}, ${entry.billable ? "billable" : "non-billable"}${entry.notes ? `, ${entry.notes}` : ""}`}><span className={styles.blockTime}>{time}</span><strong className={styles.blockDetail}>{person?.displayName}</strong><span className={styles.blockDetail}>{minutesLabel(segment!.totalMinutes)} · {entry.billable ? "Billable" : "Non-billable"}</span>{client || project ? <span className={styles.blockDetail}>{[client?.name, project?.name].filter(Boolean).join(" · ")}</span> : null}{entry.notes ? <span className={styles.blockNote}>{entry.notes}</span> : null}</button>;
        })}
        {!blocks.length ? <p className={styles.emptyDay}>No work recorded</p> : null}
        {add ? <CovieButton tone="neutral" disabled={disabled} onClick={() => add(date)} aria-label={`Add work on ${dateLabel(date)}`}><Plus size={16} aria-hidden="true" /><span>Add</span></CovieButton> : null}
      </div></section>;
    })}
  </div></div>;
}

function TimesheetsExport({ data, disabled }: { data: TimesheetsData; disabled: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  // The component unmounts whenever a read is invalidated, so detached exports cannot complete.
  const element = useRef<HTMLDivElement>(null);
  const download = async () => {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/timesheets?${new URLSearchParams({ date: data.date, view: data.view, format: "csv" })}`, { credentials: "same-origin", cache: "no-store", headers: { "x-covie-calendar-id": data.calendarId } });
      if (!response.ok || !response.headers.get("content-type")?.includes("text/csv")) throw new Error("The export could not be confirmed. Refresh your timesheet and try again.");
      const blob = await response.blob();
      if (!element.current?.isConnected) return;
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `timesheets-${data.date}-${data.view}.csv`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) { if (element.current?.isConnected) setError(caught instanceof Error ? caught.message : "Unable to export timesheets."); }
    finally { lock.current = false; if (element.current?.isConnected) setBusy(false); }
  };
  return <div className={styles.stack} ref={element}><div className={styles.actions}><CovieButton tone="neutral" disabled={disabled || busy} onClick={() => void download()}>{busy ? "Exporting…" : "Export period CSV"}</CovieButton><span className={styles.muted}>Exports the selected period for everyone you’re authorised to see.</span></div>{error ? <CovieNotice tone="danger" role="alert">{error}</CovieNotice> : null}</div>;
}
