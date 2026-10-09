"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { CovieButton, CovieEmptyState, CovieIconButton, CovieInput, CovieNotice, CovieSelect, CovieStatusBadge } from "@/components/ui/covie";
import type { TimesheetsClient, TimesheetsData, TimesheetsEntry, TimesheetsProject, TimesheetsStaff, TimesheetsWorkType } from "@/lib/timesheets/contracts";
import { resolveTimesheetsLocalTime, splitTimesheetsEntryByDay, timesheetsDateRange, timesheetsLocalTime } from "@/lib/timesheets/model";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { TimesheetsClassificationEditor, TimesheetsEntryEditor, TimesheetsField, TimesheetsSettings, TimesheetsStaffEditor, TimesheetsWorkTypeEditor, minutesLabel, timesheetsRoleLabel } from "./timesheets-editors";
import { useTimesheetsResource, type TimesheetsSave } from "./use-timesheets-resource";
import styles from "./timesheets.module.css";

type Props = { calendarId: string; section: "calendar" | "updates" | "organiser"; tool?: string; initialDate?: string };
type Editor = { kind: "entry"; entry?: TimesheetsEntry; date: string; startTime?: string; staffId: string } | { kind: "staff"; staff?: TimesheetsStaff } | { kind: "work-type"; workType?: TimesheetsWorkType } | { kind: "client" | "project"; record?: TimesheetsClient | TimesheetsProject };
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) => new Intl.DateTimeFormat("en-NZ", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
function shiftDate(date: string, amount: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); }

export function TimesheetsPage(props: Props) { return <TimesheetsResourcePage key={`${props.calendarId}:${props.section}:${props.tool ?? ""}:${props.initialDate ?? ""}`} {...props} />; }
function TimesheetsResourcePage({ calendarId, section, tool, initialDate = "" }: Props) {
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : "");
  // The initial UI is a loading state on server and client. Choose once before the
  // first browser request; later resizing must not change the view or discard drafts.
  const [view, setView] = useState<"day" | "week">(() => typeof window !== "undefined" && window.innerWidth <= 640 ? "day" : "week");
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
  const entries = useMemo(() => data.entries.filter(entry => staffFilter === "all" || entry.staffId === staffFilter), [data.entries, staffFilter]);
  const total = data.totals.filter(value => staffIds.has(value.staffId)).reduce((sum, item) => ({ total: sum.total + item.totalMinutes, billable: sum.billable + item.billableMinutes }), { total: 0, billable: 0 });
  const edit = (entry: TimesheetsEntry) => setEditor({ kind: "entry", entry, date: data.date, staffId: entry.staffId });
  const add = (date = data.date, startTime = "09:00") => setEditor({ kind: "entry", date, startTime, staffId: staffFilter !== "all" ? staffFilter : data.ownStaffId ?? data.staff.find(person => person.active)?.id ?? "" });
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
  } else if (section === "organiser" && tool === "work-types") {
    content = owner ? <section className={styles.stack} aria-label="Work types">
      <div className={styles.toolbar}><div><h1 className={styles.title}>Work types</h1><p className={styles.muted}>Create optional labels that staff can choose when recording work.</p></div><CovieButton tone="teal" disabled={busy} onClick={() => setEditor({ kind: "work-type" })}>Add work type</CovieButton></div>
      <p className={styles.muted}>Use labels such as Lunch break, Meeting or General work. Renaming or archiving keeps saved labels and history. Billable status is set separately on each work block; work types do not change payroll.</p>
      {!data.workTypes.length ? <CovieEmptyState icon={<Clock3 />} title="Name the work your team does" description="Add your first work type. Staff can still record work without choosing one." /> : null}
      <div className={styles.cardGrid}>{data.workTypes.map(workType => <article key={workType.id} className={styles.card}>
        <div className={styles.toolbar}><h2 className={`${styles.cardTitle} ${styles.workTypeTitle}`}>{workType.name}</h2><CovieStatusBadge tone={workType.active ? "teal" : "neutral"}>{workType.active ? "Active" : "Archived"}</CovieStatusBadge></div>
        <p className={styles.muted}>{workType.active ? "Available for staff to select." : "Kept on existing work blocks. Restore to make it available again."}</p>
        <div className={styles.actions}><CovieButton tone="neutral" disabled={busy} onClick={() => setEditor({ kind: "work-type", workType })} aria-label={`Rename ${workType.name}`}>Rename</CovieButton><CovieButton tone="neutral" disabled={busy} onClick={() => void save("saveWorkType", { id: workType.id, name: workType.name, active: !workType.active, version: workType.version })} aria-label={`${workType.active ? "Archive" : "Restore"} ${workType.name}`}>{workType.active ? "Archive" : "Restore"}</CovieButton></div>
      </article>)}</div>
    </section> : <CovieNotice>Only the organisation owner can manage work types.</CovieNotice>;
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
    content = <div className={`${styles.stack} ${styles.calendarStack}`}>
      <div className={`${styles.toolbar} ${styles.calendarHeading}`}><div><h1 className={styles.title}>Work calendar</h1><p className={styles.muted}><span className={styles.organisationName}>{data.organisation.name} · </span>{data.organisation.timezone} · {timesheetsRoleLabel(data.role)}</p></div><CovieButton className={styles.createButton} aria-label="Add work block" tone="teal" disabled={actionsDisabled || !canAdd} onClick={() => add()}><Plus size={18} aria-hidden="true" /><span>Add work<span className={styles.desktopWord}> block</span></span></CovieButton></div>
      <div className={`${styles.toolbar} ${styles.calendarControls}`}>
        <div className={styles.dateNavigation}><CovieIconButton aria-label={`Previous ${data.view}`} disabled={actionsDisabled} onClick={() => setDate(shiftDate(data.date, data.view === "day" ? -1 : -7))}><ChevronLeft size={18} /></CovieIconButton><label className={styles.dateField}><span className={styles.dateLabel}>Selected date</span><CovieInput type="date" aria-label="Selected date" value={data.date} disabled={actionsDisabled} onChange={event => { if (event.target.value) setDate(event.target.value); }} /></label><CovieIconButton aria-label={`Next ${data.view}`} disabled={actionsDisabled} onClick={() => setDate(shiftDate(data.date, data.view === "day" ? 1 : 7))}><ChevronRight size={18} /></CovieIconButton></div>
        <div className={styles.periodTools}><CovieButton tone="neutral" disabled={actionsDisabled} onClick={() => setDate(localDateInTimeZone(data.organisation.timezone))}>Today</CovieButton><div className={styles.actions} role="group" aria-label="Calendar view"><CovieButton tone={data.view === "day" ? "teal" : "neutral"} aria-pressed={data.view === "day"} disabled={actionsDisabled} onClick={() => setView("day")}>Day</CovieButton><CovieButton tone={data.view === "week" ? "teal" : "neutral"} aria-pressed={data.view === "week"} disabled={actionsDisabled} onClick={() => setView("week")}>Week</CovieButton></div><CovieIconButton aria-label="Refresh timesheets" disabled={actionsDisabled} onClick={refresh}><RefreshCw size={18} /></CovieIconButton></div>
      </div>
      {owner || manager ? <div className={styles.staffFilter}><TimesheetsField label="Show work for"><CovieSelect value={staffFilter} disabled={actionsDisabled} onChange={event => setStaffFilter(event.target.value)}><option value="all">{owner ? "All staff" : "My assigned team and me"}</option>{data.staff.map(person => <option key={person.id} value={person.id}>{person.displayName}{person.own ? " (you)" : ""}{person.active ? "" : " (inactive)"}</option>)}</CovieSelect></TimesheetsField></div> : <p className={`${styles.muted} ${styles.memberScope}`}>{own?.displayName ?? "Your timesheet"} · Your own work only</p>}
      <section className={styles.metrics} aria-label="Selected period totals"><div className={styles.metric}><strong>{minutesLabel(total.total)}</strong><span>Total recorded</span></div><div className={styles.metric}><strong>{minutesLabel(total.billable)}</strong><span>Billable</span></div><div className={styles.metric}><strong>{minutesLabel(total.total - total.billable)}</strong><span>Non-billable</span></div></section>
      <p className={`${styles.muted} ${styles.periodHint}`}>{data.organisation.incrementMinutes}-minute increments · no rounding.<span className={styles.desktopHelp}> {data.view === "week" ? "Select an empty hour to add work. Scroll across the week on smaller screens, or choose Day." : "Select an empty hour to add work, or a saved block to edit it."}</span></p>
      <TimesheetsCalendar data={data} entries={entries} disabled={actionsDisabled} edit={edit} add={canAdd ? add : undefined} />
      {owner || manager ? <table className={styles.summaryTable}><caption>{owner ? "Team totals" : "Assigned team totals"} · {data.view}</caption><thead><tr><th scope="col">Staff member</th><th scope="col">Recorded</th><th scope="col">Billable</th></tr></thead><tbody>{staff.map(person => { const item = data.totals.find(total => total.staffId === person.id); return <tr key={person.id}><th scope="row">{person.displayName}</th><td>{minutesLabel(item?.totalMinutes ?? 0)}</td><td>{minutesLabel(item?.billableMinutes ?? 0)}</td></tr>; })}</tbody></table> : null}
      <TimesheetsExport data={data} disabled={actionsDisabled} />
    </div>;
  }
  return <>{content}{editor?.kind === "entry" ? <TimesheetsEntryEditor onUnavailable={refresh} data={data} date={editor.date} startTime={editor.startTime} defaultStaffId={editor.staffId} entry={editor.entry} busy={busy} save={save} onClose={() => setEditor(null)} /> : editor?.kind === "staff" ? <TimesheetsStaffEditor data={data} staff={editor.staff} busy={busy} save={save} onClose={() => setEditor(null)} /> : editor?.kind === "work-type" ? <TimesheetsWorkTypeEditor workType={editor.workType} busy={busy} save={save} onClose={() => setEditor(null)} /> : editor ? <TimesheetsClassificationEditor kind={editor.kind} record={editor.record} data={data} busy={busy} save={save} onClose={() => setEditor(null)} /> : null}</>;
}

function TimesheetsCalendar({ data, entries, disabled, edit, add }: { data: TimesheetsData; entries: TimesheetsEntry[]; disabled: boolean; edit: (entry: TimesheetsEntry) => void; add?: (date: string, startTime: string) => void }) {
  const scrollRegion = useRef<HTMLDivElement>(null), selectedDay = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const revealSelectedDay = () => {
      const region = scrollRegion.current, selected = selectedDay.current;
      if (data.view !== "week" || !region || !selected || region.scrollWidth <= region.clientWidth) return;
      const outer = region.getBoundingClientRect(), inner = selected.getBoundingClientRect();
      const gutterWidth = region.querySelector<HTMLElement>(`.${styles.hourGutter}`)?.getBoundingClientRect().width ?? 0;
      // Move only the calendar's horizontal scroll. Never move the page or keyboard focus.
      region.scrollLeft = Math.max(0, region.scrollLeft + inner.left - outer.left - gutterWidth - (region.clientWidth - gutterWidth - inner.width) / 2);
    };
    revealSelectedDay();
    const region = scrollRegion.current;
    const morning = region?.querySelector<HTMLElement>('[data-timesheets-hour="08:00"]');
    const header = region?.querySelector<HTMLElement>(`.${styles.dayHeader}`);
    if (region && morning) region.scrollTop = Math.max(0, morning.offsetTop - (header?.offsetHeight ?? 0));
    window.addEventListener("resize", revealSelectedDay);
    return () => window.removeEventListener("resize", revealSelectedDay);
  }, [data.date, data.view]);
  const days = useMemo(() => {
    type HourBlock = { entry: TimesheetsEntry; minutes: number; time: string; person: string; classification: string };
    const timezone = data.organisation.timezone;
    const people = new Map(data.staff.map(person => [person.id, person.displayName]));
    const clients = new Map(data.clients.map(client => [client.id, client.name]));
    const projects = new Map(data.projects.map(project => [project.id, project.name]));
    const days = timesheetsDateRange(data.date, data.view).dates.map(date => ({
      date, label: dateLabel(date), fullLabel: dateLabel(date, { weekday: "long", day: "numeric", month: "long" }), total: 0, hasWork: false,
      slots: Array.from({ length: 24 }, (_, index) => {
        const hour = `${String(index).padStart(2, "0")}:00`;
        let unavailable = "";
        // Resolve only to establish whether the hour exists. Repeated-hour drafts
        // still require an explicit occurrence in the editor.
        try { resolveTimesheetsLocalTime(`${date}T${hour}`, timezone, "earlier"); }
        catch (error) { unavailable = error instanceof Error ? error.message : "This local hour is unavailable."; }
        return { hour, unavailable, blocks: [] as HourBlock[] };
      }),
    }));
    const dayByDate = new Map(days.map(day => [day.date, day]));
    // Split each entry once, then index its card by day and starting hour. Avoid
    // expensive timezone work inside the 168-cell weekly render.
    for (const entry of entries) {
      const start = timesheetsLocalTime(entry.start, timezone), end = timesheetsLocalTime(entry.end, timezone);
      for (const segment of splitTimesheetsEntryByDay(entry, timezone)) {
        const day = dayByDate.get(segment.date);
        if (!day) continue;
        const startTime = start.slice(0, 10) < day.date ? "00:00" : start.slice(11);
        const endTime = end.slice(0, 10) > day.date ? "24:00" : end.slice(11);
        day.total += segment.totalMinutes; day.hasWork = true;
        day.slots[Number(startTime.slice(0, 2))].blocks.push({ entry, minutes: segment.totalMinutes, time: `${startTime}–${endTime}`, person: people.get(entry.staffId) ?? "Staff", classification: [clients.get(entry.clientId ?? ""), projects.get(entry.projectId ?? "")].filter(Boolean).join(" · ") });
      }
    }
    for (const day of days) for (const slot of day.slots) slot.blocks.sort((a, b) => a.entry.start.localeCompare(b.entry.start));
    return days;
  }, [data.date, data.view, data.organisation.timezone, data.staff, data.clients, data.projects, entries]);
  const today = localDateInTimeZone(data.organisation.timezone);
  return <div ref={scrollRegion} className={styles.boardScroll} role="region" aria-label={`${data.view === "week" ? "Week" : "Day"} work calendar`} tabIndex={0}><div className={`${styles.board} ${styles.hourBoard} ${data.view === "day" ? styles.dayBoard : ""}`}>
    <div className={styles.hourGutter} aria-label={`Hours in ${data.organisation.timezone}`}><div className={styles.hourGutterHeader}>Time</div>{days[0].slots.map(({ hour }) => <div key={hour} className={styles.hourLabel}>{hour}</div>)}</div>
    {days.map(day => <section ref={day.date === data.date ? selectedDay : undefined} data-timesheets-date={day.date} aria-current={day.date === data.date ? "date" : undefined} className={styles.day} key={day.date} aria-label={day.fullLabel}>
      <header className={styles.dayHeader} data-today={day.date === today}><strong>{day.label}</strong><span>{minutesLabel(day.total)} recorded{day.date === today ? " · Today" : ""}</span>{!day.hasWork ? <span>No work recorded</span> : null}</header>
      {day.slots.map(({ hour, unavailable, blocks }) => <div className={styles.hourSlot} key={hour} data-timesheets-hour={hour}>
        {add ? <button type="button" className={styles.hourAdd} disabled={disabled || Boolean(unavailable)} onClick={() => add(day.date, hour)} aria-label={unavailable ? `${hour} unavailable on ${day.label}. ${unavailable}` : `Add work on ${day.label} at ${hour}`} title={unavailable || undefined}><Plus size={14} aria-hidden="true" /><span className={styles.hourAddHint}>{unavailable ? "Unavailable" : "Add work"}</span></button> : null}
        {blocks.map(({ entry, minutes, time, person, classification }) => <button type="button" className={styles.block} data-billable={entry.billable} key={entry.id} disabled={disabled} onClick={() => edit(entry)} aria-label={`${person}, ${day.label}, ${time}, ${minutesLabel(minutes)}, ${entry.billable ? "billable" : "non-billable"}${entry.workTypeName ? `, ${entry.workTypeName}` : ""}${entry.notes ? `, ${entry.notes}` : ""}`}><span className={styles.blockTime}>{time}</span><strong className={styles.blockDetail}>{person}</strong><span className={styles.blockDetail}>{minutesLabel(minutes)} · {entry.billable ? "Billable" : "Non-billable"}</span>{entry.workTypeName ? <span className={styles.blockDetail}>{entry.workTypeName}</span> : null}{classification ? <span className={styles.blockDetail}>{classification}</span> : null}{entry.notes ? <span className={styles.blockNote}>{entry.notes}</span> : null}</button>)}
      </div>)}
    </section>)}
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
