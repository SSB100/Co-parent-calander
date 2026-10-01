"use client";

import { CalendarDays, ChevronLeft, ChevronRight, LoaderCircle, MapPin, Plus, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { CovieButton, CovieConfirmDialog, CovieDialog, CovieEmptyState, CovieIconButton, CovieInput, CovieNotice, CovieSectionHeader, CovieStatusBadge } from "@/components/ui/covie";
import { localDateInTimeZone } from "@/lib/calendar/time";
import type { SocialData, SocialEvent } from "@/lib/social-groups/contracts";
import { SocialEventDetail, SocialEventEditor } from "./social-event-dialogs";
import { SocialMonthCalendar } from "./social-month-calendar";
import { SocialAvailabilityForm, SocialSettingsForm } from "./social-organiser-forms";
import { canEditSocialEvent, canOrganiseSocial, shiftSocialMonth, socialDateLabel, socialEventCardTime, socialEventCardLabel, socialEventsByDay, socialMonthDays, socialResponses, socialTimestamp } from "./social-ui";
import { useSocialGroups } from "./use-social-groups";
import { OwnerCalendarWorkspace } from "@/components/workspace/owner-calendar-workspace";
import { useOwnerWorkspacePanel } from "@/lib/client/use-owner-workspace-panel";
import { workspaceOrganiserTools } from "@/lib/templates/workspace-navigation";
import { TemplateMembersPage } from "@/components/calendar-sharing/members-page";
const ownerPanelKeys = ["members", "availability", "group-settings"] as const;
import styles from "./social-groups.module.css";

export function SocialGroupsPage({ calendarId, section, tool, initialDate = "", initialRecord = "" }: { calendarId: string; section: "calendar" | "updates" | "organiser"; tool?: string; initialDate?: string; initialRecord?: string }) {
  const ownerPanel = useOwnerWorkspacePanel(calendarId, ownerPanelKeys);
  const clearOwnerPanel = ownerPanel.clear;
  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [showCancelled, setShowCancelled] = useState(false);
  const [editor, setEditor] = useState<{ event?: SocialEvent } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(initialRecord || null);
  const [cancelTarget, setCancelTarget] = useState<SocialEvent | null>(null);
  const acceptSnapshot = useCallback((next: SocialData | null) => {
    if (!next || next.role !== "owner") clearOwnerPanel();
    if (!next) { setEditor(null); setDetailId(null); setCancelTarget(null); return; }
    setEditor((current) => {
      if (!current) return null;
      if (!current.event) return next.canCreate && next.role !== "viewer" ? current : null;
      const event = next.events.find((item) => item.id === current.event!.id);
      return event && canEditSocialEvent(next, event) ? current : null;
    });
    setCancelTarget((current) => {
      const event = current && next.events.find((item) => item.id === current.id);
      return event && canEditSocialEvent(next, event) ? current : null;
    });
  }, [clearOwnerPanel]);
  const enabled = !(section === "organiser" && tool === "members");
  const { data, loading, loadError, error, notice, busy, mutationLock, refresh, save, invalidateAccess, clearMessages } = useSocialGroups(calendarId, month, enabled, acceptSnapshot);
  const days = useMemo(() => data ? socialMonthDays(data.month) : [], [data]);
  const byDay = useMemo(() => data ? socialEventsByDay(data.events, days, data.timezone, showCancelled) : new Map<string, SocialEvent[]>(), [data, days, showCancelled]);
  if (!enabled) return null;
  if (!data || data.calendarId !== calendarId) return <div className={styles.stack}>{loadError ? <CovieNotice tone="danger">{loadError}<div className={styles.actions}><CovieButton tone="neutral" disabled={loading} onClick={() => void refresh()}>Try again</CovieButton><CovieButton tone="neutral" disabled={busy || loading} onClick={() => window.location.reload()}>Reload page</CovieButton></div></CovieNotice> : <div className={styles.loading} role="status"><LoaderCircle size={20} className="animate-spin" aria-hidden="true" />Loading your group…</div>}</div>;

  const today = localDateInTimeZone(data.timezone);
  const activeDate = selectedDate.startsWith(data.month) ? selectedDate : today.startsWith(data.month) ? today : `${data.month}-01`;
  const dateEvents = byDay.get(activeDate) ?? [];
  const detail = data.events.find((event) => event.id === detailId);
  const disabled = busy || loading || Boolean(loadError);
  const staleMonth = Boolean(month && month !== data.month);
  const ownAvailability = data.availability.find((item) => item.own && item.date === activeDate);
  function chooseDate(date: string) { setSelectedDate(date); if (month || date.slice(0, 7) !== data!.month) setMonth(date.slice(0, 7)); clearMessages(); }
  function chooseMonth(next: string) { setMonth(next); setSelectedDate(`${next}-01`); clearMessages(); }
  function openEvent(event: SocialEvent) { clearMessages(); setDetailId(event.id); }
  async function cancelEvent() { if (!disabled && cancelTarget && await save("cancel", { id: cancelTarget.id, version: cancelTarget.version })) setCancelTarget(null); }

  const monthControls = <div className={styles.monthControls}>
    <CovieIconButton aria-label="Previous month" disabled={busy} onClick={() => chooseMonth(shiftSocialMonth(month || data.month, -1))}><ChevronLeft size={20} aria-hidden="true" /></CovieIconButton>
    <label className={styles.monthField}><span className="sr-only">Month</span><CovieInput type="month" value={month || data.month} disabled={busy} onChange={(e) => { if (e.target.value) chooseMonth(e.target.value); }} /></label>
    <CovieIconButton aria-label="Next month" disabled={busy} onClick={() => chooseMonth(shiftSocialMonth(month || data.month, 1))}><ChevronRight size={20} aria-hidden="true" /></CovieIconButton>
    <CovieButton tone="neutral" disabled={busy} onClick={() => chooseDate(today)}>Today</CovieButton>
  </div>;

  const availabilityPanel = <>
      <div className={styles.toolbar}>{monthControls}<p className={styles.help}>Group availability · {data.timezone}</p></div>
      {loading || staleMonth ? <div className={styles.loading} role="status">Loading availability…</div> : <>
        {data.canRespond && data.role !== "viewer" ? <SocialAvailabilityForm key={`${activeDate}:${ownAvailability?.status ?? ""}:${ownAvailability?.note ?? ""}`} date={activeDate} today={today} existing={ownAvailability} timezone={data.timezone} busy={disabled} error={error} onDateChange={chooseDate} onSave={save} /> : <CovieNotice>You have view-only access to the group’s availability.</CovieNotice>}
        <section className={styles.stack} aria-label="Shared group availability"><CovieSectionHeader title="Shared availability" description="A simple view of who is free this month." />{data.availability.length ? <ol className={styles.availability}>{data.availability.map((item) => <li key={item.id}><div className={styles.availabilityHeading}><strong>{item.name}{item.own ? " · You" : ""}</strong><CovieStatusBadge tone={item.status === "available" ? "teal" : "neutral"}>{item.status === "available" ? "Available" : "Unavailable"}</CovieStatusBadge></div><p>{socialDateLabel(item.date)}</p>{item.note ? <p className={styles.notes}>{item.note}</p> : null}{item.own && item.date >= today && data.canRespond ? <CovieButton tone="neutral" disabled={disabled} onClick={() => chooseDate(item.date)}>Edit your response</CovieButton> : null}</li>)}</ol> : <CovieEmptyState title="No availability shared yet" description="Availability shared by your group for this month will appear here." />}</section>
      </>}
  </>;
  const ownerWorkspace = section === "calendar" && data.role === "owner";
  const ownerTools = workspaceOrganiserTools("social_groups", data.role);
  const ownerToolOpen = ownerWorkspace && Boolean(ownerPanel.panel) && ownerTools.some(item => item.key === ownerPanel.panel);
  const selectedDay = !staleMonth && !loading ? <section className={styles.stack} aria-label="Selected day events"><CovieSectionHeader title={socialDateLabel(activeDate, true)} />{dateEvents.length ? <div className={styles.eventList}>{dateEvents.map((event) => <button key={event.id} type="button" className={styles.eventCard} data-cancelled={event.cancelled} aria-label={ownerWorkspace ? socialEventCardLabel(event, data.timezone) : undefined} onClick={() => openEvent(event)}><div className={styles.eventCardHeading}><strong>{event.title}</strong>{event.cancelled ? <CovieStatusBadge>Cancelled</CovieStatusBadge> : event.myResponse ? <CovieStatusBadge tone={event.myResponse === "going" ? "teal" : event.myResponse === "maybe" ? "sunshine" : "neutral"}>{socialResponses.find((response) => response.value === event.myResponse)?.label}</CovieStatusBadge> : null}</div><span>{ownerWorkspace ? socialEventCardTime(event, data.timezone) : `${socialTimestamp(event.start, data.timezone)} to ${socialTimestamp(event.end, data.timezone)}`}</span>{event.location ? <span className={styles.location}><MapPin size={15} aria-hidden="true" />{event.location}</span> : null}<span className={styles.eventCount}>{event.going} going{event.capacity !== null ? ` · ${event.capacity} places` : ""} · View event</span></button>)}</div> : <CovieEmptyState icon={<CalendarDays aria-hidden="true" />} title="No events on this day" description={data.canCreate ? "Choose another day or create something for the group." : "Choose another day to see what the group has planned."} />}</section> : null;
  const eventActions = <div className={styles.actions}>{data.canCreate && data.role !== "viewer" ? <CovieButton disabled={disabled} onClick={() => { clearMessages(); setEditor({}); }}><Plus size={17} aria-hidden="true" />Create event</CovieButton> : data.role === "viewer" ? <CovieStatusBadge>View only</CovieStatusBadge> : null}<CovieIconButton aria-label="Refresh group calendar" disabled={busy || loading} onClick={() => void refresh()}><RefreshCw size={18} aria-hidden="true" /></CovieIconButton></div>;
  const calendarMeta = <div className={styles.calendarMeta}><p className={styles.help}>Times use {data.timezone}</p><label className={styles.checkbox}><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />Show cancelled events</label></div>;

  return <div className={ownerWorkspace ? styles.ownerRoot : styles.stack} aria-busy={loading || busy}>
    {initialRecord && !loading && !loadError && !data.events.some(event => event.id === initialRecord) ? <CovieNotice>This event is no longer available in the selected month. Refresh your Personal overview for the latest items.</CovieNotice> : null}
    {loadError ? <CovieNotice tone="danger">{loadError}<div className={styles.actions}><CovieButton tone="neutral" disabled={loading} onClick={() => void refresh()}>Try again</CovieButton><CovieButton tone="neutral" disabled={busy || loading} onClick={() => window.location.reload()}>Reload page</CovieButton></div></CovieNotice> : null}
    {error && !editor && !detail && !cancelTarget && section !== "organiser" ? <CovieNotice tone="danger">{error}<div className={styles.actions}><CovieButton tone="neutral" disabled={busy || loading} onClick={() => { clearMessages(); void refresh(); }}>Reload calendar</CovieButton></div></CovieNotice> : null}
    {notice && !detail ? <CovieNotice tone="teal">{notice}</CovieNotice> : null}
    {ownerWorkspace ? <OwnerCalendarWorkspace
      toolbar={<><div className={styles.ownerTools} role="group" aria-label="Group organiser tools">{ownerTools.map(item => <CovieButton key={item.key} tone="neutral" aria-haspopup="dialog" disabled={disabled} onClick={() => { clearMessages(); ownerPanel.open(item.key); }}>{item.label}</CovieButton>)}</div>{eventActions}</>}
      navigation={<>{monthControls}{calendarMeta}</>}
      calendar={<SocialMonthCalendar month={data.month} days={days} eventsByDay={byDay} selectedDate={activeDate} today={today} disabled={busy || loading || staleMonth} onSelectDate={chooseDate} fitWorkspace />}
      day={<>{loading || staleMonth ? <p className={styles.help} role="status">Loading selected day…</p> : selectedDay}</>}
    /> : section === "calendar" ? <>
      <div className={styles.toolbar}>{monthControls}{eventActions}</div>
      {calendarMeta}
      {loading || staleMonth ? <p className={styles.help} role="status">Loading month…</p> : null}<SocialMonthCalendar month={data.month} days={days} eventsByDay={byDay} selectedDate={activeDate} today={today} disabled={busy || loading || staleMonth} onSelectDate={chooseDate} />
      {selectedDay}

    </> : section === "updates" ? data.updates.length ? <><ol className={styles.history}>{data.updates.map((update) => <li key={update.id}><div><strong>{update.action === "created" ? "Event created" : update.action === "cancelled" ? "Event cancelled" : "Event updated"}</strong><p>{update.eventTitle}</p></div><time dateTime={update.createdAt}>{socialTimestamp(update.createdAt, data.timezone)}</time></li>)}</ol><p className={styles.help}>Recent group changes · {data.timezone}</p></> : <CovieEmptyState title="No updates yet" description="Created, edited and cancelled events will appear here." /> : tool === "group-settings" ? canOrganiseSocial(data) ? <SocialSettingsForm key={String(data.membersCanCreate)} membersCanCreate={data.membersCanCreate} busy={disabled} error={error} onSave={save} /> : <CovieNotice>Only the owner and group admins can change settings. Members {data.membersCanCreate ? "can" : "cannot"} currently create new events.</CovieNotice> : <>
      {availabilityPanel}
    </>}
    {ownerToolOpen ? <CovieDialog
      id="social-owner-tool" title={ownerTools.find(item => item.key === ownerPanel.panel)!.label}
      size={ownerPanel.panel === "members" ? "lg" : "md"} busy={busy} onClose={ownerPanel.close}
      footer={<CovieButton tone="neutral" disabled={busy} onClick={ownerPanel.close}>Back to calendar</CovieButton>}
    ><div className={styles.stack} onKeyDown={event => { if (event.key === "Escape" && event.target instanceof HTMLElement && event.target.closest('[role="dialog"]') !== event.currentTarget.closest('[role="dialog"]')) event.stopPropagation(); }}>
      {notice ? <CovieNotice tone="teal">{notice}</CovieNotice> : null}
      {ownerPanel.panel === "members" ? <TemplateMembersPage calendarId={calendarId} onAccessUnavailable={invalidateAccess} /> : ownerPanel.panel === "group-settings" ? <SocialSettingsForm key={String(data.membersCanCreate)} membersCanCreate={data.membersCanCreate} busy={disabled} error={error || loadError} onSave={save} /> : availabilityPanel}
    </div></CovieDialog> : null}
    {editor && !ownerToolOpen ? <SocialEventEditor data={data} event={editor.event} date={activeDate} busy={busy} blocked={disabled} error={error || loadError} onSave={save} onSaved={(date) => { setSelectedDate(date); if (month || date.slice(0, 7) !== data.month) setMonth(date.slice(0, 7)); setEditor(null); }} onClose={() => { if (!mutationLock.current) setEditor(null); }} /> : null}
    {detail && !ownerToolOpen ? <SocialEventDetail data={data} event={detail} busy={busy} loading={loading} blocked={Boolean(loadError)} error={error || loadError} notice={notice} onSave={save} onClose={() => { if (!mutationLock.current) setDetailId(null); }} onReload={() => { clearMessages(); void refresh(); }} onEdit={() => { clearMessages(); setDetailId(null); setEditor({ event: detail }); }} onCancel={() => { clearMessages(); setDetailId(null); setCancelTarget(detail); }} /> : null}
    <CovieConfirmDialog open={Boolean(cancelTarget) && !ownerToolOpen} id="social-cancel-event" title="Cancel this event?" description={<div className={styles.stack}><p>{cancelTarget?.title} will be marked cancelled. Its details and responses stay in the group’s history.</p>{error || loadError ? <CovieNotice tone="danger">{error || loadError}</CovieNotice> : null}</div>} confirmLabel={busy ? "Cancelling…" : "Cancel event"} cancelLabel="Keep event" busy={busy} confirmDisabled={disabled} onCancel={() => { setCancelTarget(null); if (cancelTarget) setDetailId(cancelTarget.id); }} onConfirm={() => void cancelEvent()} />
  </div>;
}
