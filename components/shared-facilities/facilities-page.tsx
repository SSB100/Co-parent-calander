"use client";

import { Building2, CalendarDays, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CovieButton, CovieConfirmDialog, CovieEmptyState, CovieIconButton, CovieNotice, CovieRecordCard, CovieSectionHeader, CovieSegmentedControl, CovieSelect, CovieStatusBadge } from "@/components/ui/covie";
import { CalendarAccessDeniedError, CalendarContextChangedError, calendarContextHeaders, requireCalendarContext, throwIfCalendarAccessDenied, throwIfCalendarContextChanged } from "@/components/calendar-sharing/calendar-context";
import type { FacilityBooking, FacilityData, FacilityResource } from "@/lib/shared-facilities/contracts";
import { FacilityBookingDialog, FacilityResourceDialog, FacilityRulesSummary, type FacilitySave } from "./facility-dialogs";
import { FacilityRulesForm } from "./facility-rules-form";
import { canChangeFacilityBooking, canEditFacilityResource, canReviewFacilityBooking, facilityBookingsForView, facilityTime, facilityUpdateLabels, type FacilityView } from "./facilities-ui";
import { FacilityPlanner } from "./facility-planner";
import { FacilitySlotConfirmation } from "./facility-slot-confirmation";
import { facilitySlotProblem, type FacilitySlot } from "./facility-slots";
import styles from "./facilities.module.css";

type Confirmation = { kind: "cancel" | "decline"; booking: FacilityBooking } | { kind: "archive"; resource: FacilityResource };
type BookingEditor = { booking: FacilityBooking; resourceId: string };

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "This request could not be completed. Please try again.";
}
function statusTone(status: FacilityBooking["status"]) {
  return status === "confirmed" ? "teal" as const : status === "pending" ? "sunshine" as const : "neutral" as const;
}

export function FacilitiesPage({ calendarId, section, tool, initialDate = "", initialRecord = "" }: { calendarId: string; section: "calendar" | "updates" | "organiser"; tool?: string; initialDate?: string; initialRecord?: string }) {
  const [data, setData] = useState<FacilityData | null>(null);
  const [date, setDate] = useState(initialDate);
  const [linkedRecordId, setLinkedRecordId] = useState(initialRecord);
  const sourceRecord = useRef(linkedRecordId);
  const [view, setView] = useState<FacilityView>("availability");
  const [resourceId, setResourceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [bookingEditor, setBookingEditor] = useState<BookingEditor | null>(null);
  const [bookingSlot, setBookingSlot] = useState<FacilitySlot | null>(null);
  const selectionRef = useRef({ date, resourceId: "" });
  const [resourceEditor, setResourceEditor] = useState<{ resource?: FacilityResource } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const mounted = useRef(false);
  const requestSequence = useRef(0);
  const currentRequest = useRef<AbortController | null>(null);
  const mutationLock = useRef(false);
  const enabled = !(section === "organiser" && tool === "members");

  const acceptSnapshot = useCallback((next: FacilityData | null) => {
    setData(next);
    if (!next) {
      setBookingEditor(null); setBookingSlot(null); setResourceEditor(null); setConfirmation(null);
      return;
    }
    setBookingSlot((current) => current && next.canBook && next.resources.some((resource) => resource.id === current.resourceId && resource.active) ? current : null);
    setBookingEditor((current) => {
      const booking = current && next.bookings.find((item) => item.id === current.booking.id);
      return booking && canChangeFacilityBooking(next, booking) ? current : null;
    });
    setResourceEditor((current) => current && (current.resource ? next.resources.some((resource) => resource.id === current.resource!.id && canEditFacilityResource(next, resource.id)) : next.owner) ? current : null);
    setConfirmation((current) => {
      if (!current) return null;
      if (current.kind === "archive") return next.resources.some((resource) => resource.id === current.resource.id && resource.active && canEditFacilityResource(next, resource.id)) ? current : null;
      const booking = next.bookings.find((item) => item.id === current.booking.id);
      return booking && (current.kind === "decline" ? canReviewFacilityBooking(next, booking) : canChangeFacilityBooking(next, booking)) ? current : null;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const sequence = ++requestSequence.current;
    currentRequest.current?.abort();
    const controller = new AbortController();
    currentRequest.current = controller;
    setLoading(true); setLoadError("");
    try {
      const response = await fetch(`/api/shared-facilities${date ? `?date=${encodeURIComponent(date)}` : ""}`, { cache: "no-store", headers: calendarContextHeaders(calendarId), signal: controller.signal });
      const body = await response.json().catch(() => null) as FacilityData | { error?: string } | null;
      throwIfCalendarAccessDenied(response.status, body);
      throwIfCalendarContextChanged(response.status, body);
      if (!response.ok || !body || !("resources" in body)) throw new Error(body && "error" in body && body.error ? body.error : "Facilities could not be loaded.");
      if (!mounted.current || sequence !== requestSequence.current) return;
      if (date && body.date !== date) throw new Error("The returned schedule does not match the selected day. Try again.");
      acceptSnapshot(requireCalendarContext(body, calendarId));
      if (sourceRecord.current) {
        const linked = body.bookings.find((booking) => booking.id === sourceRecord.current && booking.own);
        if (linked) {
          selectionRef.current.resourceId = linked.resourceId; setResourceId(linked.resourceId);
          if (!body.resources.some((resource) => resource.id === linked.resourceId && resource.active)) setView("mine");
        }
        sourceRecord.current = "";
      }
      if (selectionRef.current.resourceId && !body.resources.some((resource) => resource.id === selectionRef.current.resourceId)) {
        selectionRef.current.resourceId = ""; setResourceId("");
      }
    } catch (error) {
      if (!controller.signal.aborted && mounted.current && sequence === requestSequence.current) {
        if (error instanceof CalendarContextChangedError || error instanceof CalendarAccessDeniedError) acceptSnapshot(null);
        setLoadError(messageFrom(error));
      }
    } finally {
      if (mounted.current && sequence === requestSequence.current) setLoading(false);
    }
  }, [calendarId, date, enabled, acceptSnapshot]);

  useEffect(() => {
    mounted.current = true;
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    const recheck = () => { if (document.visibilityState === "visible" && !mutationLock.current) void refresh(); };
    window.addEventListener("focus", recheck); window.addEventListener("pageshow", recheck); document.addEventListener("visibilitychange", recheck);
    return () => { mounted.current = false; window.clearTimeout(timer); window.removeEventListener("focus", recheck); window.removeEventListener("pageshow", recheck); document.removeEventListener("visibilitychange", recheck); currentRequest.current?.abort(); requestSequence.current += 1; };
  }, [refresh]);

  const save: FacilitySave = async (action, payload) => {
    if (mutationLock.current) return false;
    mutationLock.current = true; setBusy(true); setMutationError(""); setNotice("");
    let responseReceived = false;
    try {
      const response = await fetch("/api/shared-facilities", { method: "POST", headers: { "content-type": "application/json", ...calendarContextHeaders(calendarId) }, body: JSON.stringify({ action, data: payload }) });
      responseReceived = true;
      const body = await response.json().catch(() => null) as { error?: string; ok?: boolean; status?: string } | null;
      throwIfCalendarAccessDenied(response.status, body);
      throwIfCalendarContextChanged(response.status, body);
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? "The save result could not be verified. Reload to check before trying again.");
      if (!mounted.current) return true;
      setNotice(action === "booking" ? body.status === "pending" ? "Booking requested. It will hold the time once approved." : "Booking saved." : action === "rules" ? "Booking rules saved." : action === "resource" ? "Resource saved." : "Booking updated.");
      void refresh();
      return true;
    } catch (error) {
      if (mounted.current) {
        if (error instanceof CalendarContextChangedError || error instanceof CalendarAccessDeniedError) { currentRequest.current?.abort(); requestSequence.current += 1; acceptSnapshot(null); setLoadError(error.message); setLoading(false); }
        setMutationError(responseReceived ? messageFrom(error) : "The connection was interrupted. The request may have reached Covie. Reload to check before trying again.");
      }
      return false;
    } finally {
      mutationLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  function chooseDate(next: string) {
    if (mutationLock.current || next === (selectionRef.current.date || data?.date)) return;
    selectionRef.current.date = next;
    currentRequest.current?.abort(); requestSequence.current += 1;
    setDate(next); setLoading(true); setBookingSlot(null); setNotice(""); setMutationError("");
  }
  function chooseResource(next: string) {
    if (mutationLock.current) return;
    selectionRef.current.resourceId = next; setResourceId(next); setBookingSlot(null); setMutationError("");
  }
  function currentSelection() { return { calendarId, date: selectionRef.current.date || data?.date || "", resourceId: selectionRef.current.resourceId }; }
  function openSlot(slot: FacilitySlot) {
    if (!data || loading || loadError || mutationLock.current) return;
    const problem = facilitySlotProblem(data, currentSelection(), slot);
    if (problem) { setMutationError(problem); return; }
    setMutationError(""); setBookingSlot(slot);
  }
  const saveSlot: FacilitySave = async (action, payload) => {
    if (!data || !bookingSlot || loading || loadError) { setMutationError("Wait for the latest schedule before confirming."); return false; }
    const problem = facilitySlotProblem(data, currentSelection(), bookingSlot);
    if (problem) { setMutationError(problem); return false; }
    return save(action, payload);
  };
  function openBooking(resource: string, booking: FacilityBooking) {
    if (loading || loadError || mutationLock.current || (date && data?.date !== date)) return;
    setMutationError(""); setBookingEditor({ resourceId: resource, booking });
  }
  function requestConfirmation(target: Confirmation) { setMutationError(""); setConfirmation(target); }
  async function confirmChange() {
    if (!confirmation || loading || loadError || mutationLock.current) return;
    const success = confirmation.kind === "archive"
      ? await save("resource", { ...confirmation.resource, active: false })
      : await save("decision", { id: confirmation.booking.id, version: confirmation.booking.version, action: confirmation.kind });
    if (success) setConfirmation(null);
  }

  if (!enabled) return null;
  if (!data || data.calendarId !== calendarId) return <div className={styles.stack}>{loadError ? <CovieNotice tone="danger">{loadError}<div className={styles.actions}><CovieButton tone="neutral" onClick={() => void refresh()} disabled={loading}>Try again</CovieButton><CovieButton tone="neutral" disabled={busy || loading} onClick={() => window.location.reload()}>Reload page</CovieButton></div></CovieNotice> : <div className={styles.loading} role="status"><LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />Loading facilities…</div>}</div>;

  const disabled = busy || loading || Boolean(loadError) || Boolean(date && data.date !== date);
  const activeResources = data.resources.filter((resource) => resource.active);
  const bookings = facilityBookingsForView(data, view, resourceId);
  const pendingReview = data.bookings.filter((booking) => canReviewFacilityBooking(data, booking));
  const linkedBooking = data.bookings.find((booking) => booking.id === linkedRecordId && booking.own);
  const resourceName = (id: string) => data.resources.find((resource) => resource.id === id)?.name ?? "Resource";

  function renderBooking(booking: FacilityBooking, includeResource: boolean, includeDate = false) {
    if (!data || data.calendarId !== calendarId) return null;
    const changeable = canChangeFacilityBooking(data, booking);
    const reviewable = canReviewFacilityBooking(data, booking);
    return <article className={styles.booking} key={booking.id} data-status={booking.status}>
      <div className={styles.bookingMain}>
        <div className={styles.bookingHeading}><strong>{booking.title || (booking.own ? "Your booking" : "Reserved")}</strong><CovieStatusBadge tone={statusTone(booking.status)}>{booking.status === "pending" ? "Awaiting approval" : booking.status === "confirmed" ? "Confirmed" : booking.status === "cancelled" ? "Cancelled" : "Declined"}</CovieStatusBadge>{booking.own ? <span className={styles.own}>Yours</span> : null}</div>
        {includeResource ? <p className={styles.resourceName}>{resourceName(booking.resourceId)}</p> : null}
        <p>{facilityTime(booking.start, data.timezone, includeDate)} to {facilityTime(booking.end, data.timezone, includeDate)}</p>
        {booking.notes ? <p className={styles.notes}>{booking.notes}</p> : null}
        {booking.status === "pending" ? <p className={styles.help}>This request does not hold the time slot.</p> : null}
      </div>
      {changeable || reviewable ? <div className={styles.actions}>
        {reviewable ? <><CovieButton disabled={disabled} onClick={() => void save("decision", { id: booking.id, version: booking.version, action: "confirm" })}>Approve</CovieButton><CovieButton tone="neutral" disabled={disabled} onClick={() => requestConfirmation({ kind: "decline", booking })}>Decline</CovieButton></> : null}
        {changeable ? <><CovieButton tone="neutral" disabled={disabled} onClick={() => openBooking(booking.resourceId, booking)}>Edit</CovieButton><CovieButton tone="neutral" disabled={disabled} onClick={() => requestConfirmation({ kind: "cancel", booking })}>Cancel booking</CovieButton></> : null}
      </div> : null}
    </article>;
  }

  return <div className={styles.stack} aria-busy={loading || busy}>
    {loadError ? <CovieNotice tone="danger">{loadError}<div className={styles.actions}><CovieButton tone="neutral" disabled={loading} onClick={() => void refresh()}>Try again</CovieButton><CovieButton tone="neutral" disabled={busy || loading} onClick={() => window.location.reload()}>Reload page</CovieButton></div></CovieNotice> : null}
    {mutationError && !bookingEditor && !bookingSlot && !resourceEditor && !confirmation ? <CovieNotice tone="danger">{mutationError}<div className={styles.actions}><CovieButton tone="neutral" disabled={disabled} onClick={() => { setMutationError(""); void refresh(); }}>Reload calendar</CovieButton></div></CovieNotice> : null}
    {data?.bookingsTruncated ? <CovieNotice>The upcoming list is limited. Choose a date to see its full schedule.</CovieNotice> : null}
      {notice ? <CovieNotice tone="teal">{notice}</CovieNotice> : null}
    {section === "calendar" && linkedRecordId && !loading ? <section className={styles.stack} aria-label="Booking from Personal" id={`record-${linkedRecordId}`}><CovieSectionHeader title="Booking from Personal" actions={<CovieButton tone="neutral" onClick={() => setLinkedRecordId("")}>Dismiss</CovieButton>} />{linkedBooking ? <CovieRecordCard><strong>{linkedBooking.title || "Your booking"}</strong><p>{resourceName(linkedBooking.resourceId)}</p><p>{facilityTime(linkedBooking.start, data.timezone, true)} to {facilityTime(linkedBooking.end, data.timezone, true)}</p><CovieStatusBadge tone={statusTone(linkedBooking.status)}>{linkedBooking.status}</CovieStatusBadge>{linkedBooking.notes ? <p className={styles.notes}>{linkedBooking.notes}</p> : null}<p className={styles.help}>Use My bookings to manage an upcoming booking.</p></CovieRecordCard> : <CovieNotice>This booking is no longer available in this calendar. Refresh your Personal overview for the latest items.</CovieNotice>}</section> : null}
    {section === "calendar" ? <>
      <div className={styles.toolbar}>
        <CovieSegmentedControl value={view} onChange={(next) => { if (mutationLock.current) return; setView(next); if (next === "availability" && resourceId && !activeResources.some((resource) => resource.id === resourceId)) chooseResource(""); }} options={[{ value: "availability", label: "Availability" }, { value: "mine", label: "My bookings" }]} ariaLabel="Facilities view" />
        <div className={styles.actions}>{view === "mine" && data.canBook ? <CovieButton disabled={busy} onClick={() => setView("availability")}>Find a time</CovieButton> : !data.canBook ? <CovieStatusBadge>View only</CovieStatusBadge> : null}<CovieIconButton aria-label="Refresh facilities" disabled={busy || loading} onClick={() => void refresh()}><RefreshCw size={18} aria-hidden="true" /></CovieIconButton></div>
      </div>
      {view === "availability" ? activeResources.length ? <FacilityPlanner data={data} selection={{ calendarId, date: date || data.date, resourceId }} busy={busy} loading={loading} loadError={loadError} onDate={chooseDate} onResource={chooseResource} onSlot={openSlot} renderBooking={renderBooking} /> : <CovieEmptyState icon={<Building2 aria-hidden="true" />} title="No resources available" description={data.owner ? "Add the first room, space or piece of equipment in Organiser → Resources." : "The organiser has not made any resources available yet."} /> : <>
        <label className={styles.field}><span>Resource</span><CovieSelect disabled={busy} value={resourceId} onChange={(event) => chooseResource(event.target.value)}><option value="">All resources</option>{data.resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}{resource.active ? "" : " · archived"}</option>)}</CovieSelect></label>
        <p className={styles.help}>Your upcoming confirmed bookings and requests. Times use {data.timezone}.</p>
        {loading ? <div className={styles.loading} role="status">Loading bookings…</div> : bookings.length ? <div className={styles.stack}>{bookings.map((booking) => renderBooking(booking, true, true))}</div> : <CovieEmptyState icon={<CalendarDays aria-hidden="true" />} title="No upcoming bookings" description="Your confirmed bookings and pending requests will appear here." />}
      </>}
      <FacilityRulesSummary rules={data.rules} timezone={data.timezone} />
    </> : section === "updates" ? <>
      {pendingReview.length ? <section className={styles.stack} aria-label="Booking requests"><CovieSectionHeader title="Requests to review" description="Pending requests do not hold a slot. Approval checks availability again." />{pendingReview.map((booking) => renderBooking(booking, true, true))}</section> : null}
      {data.updates.length ? <section className={styles.stack} aria-label="Booking history"><CovieSectionHeader title="Recent changes" /><ol className={styles.history}>{data.updates.map((update) => <li key={update.id}><div><strong>{facilityUpdateLabels[update.action] ?? "Booking changed"}</strong><p>{update.resourceName}</p></div><time dateTime={update.createdAt}>{facilityTime(update.createdAt, data.timezone, true)}</time></li>)}</ol><p className={styles.help}>Showing recent changes you can access · {data.timezone}</p></section> : <CovieEmptyState title="No updates yet" description="Changes to your bookings and resources you manage will appear here." />}
    </> : tool === "booking-rules" ? data.owner ? <FacilityRulesForm key={JSON.stringify(data.rules)} rules={data.rules} timezone={data.timezone} busy={disabled} error={mutationError} onSave={save} /> : <><CovieNotice>Only the calendar owner can change booking rules.</CovieNotice><FacilityRulesSummary rules={data.rules} timezone={data.timezone} /></> : <>
      {data.owner ? <div className={styles.actions}><CovieButton disabled={disabled} onClick={() => { setMutationError(""); setResourceEditor({}); }}><Plus size={17} aria-hidden="true" />Add resource</CovieButton></div> : null}
      {data.resources.length ? <div className={styles.resources}>{data.resources.map((resource) => <CovieRecordCard key={resource.id}><div className={styles.resourceHeader}><h2>{resource.name}</h2><CovieStatusBadge tone={resource.active ? "teal" : "neutral"}>{resource.active ? "Active" : "Archived"}</CovieStatusBadge></div>{resource.location ? <p className={styles.help}>{resource.location}</p> : null}{resource.capacity ? <p className={styles.help}>Capacity {resource.capacity}</p> : null}{resource.description ? <p className={styles.notes}>{resource.description}</p> : null}{canEditFacilityResource(data, resource.id) ? <div className={styles.actions}><CovieButton tone="neutral" disabled={disabled} onClick={() => { setMutationError(""); setResourceEditor({ resource }); }}>Edit resource</CovieButton>{resource.active ? <CovieButton tone="neutral" disabled={disabled} onClick={() => requestConfirmation({ kind: "archive", resource })}>Archive</CovieButton> : <CovieButton disabled={disabled} onClick={() => void save("resource", { ...resource, active: true })}>Restore</CovieButton>}</div> : null}</CovieRecordCard>)}</div> : <CovieEmptyState icon={<Building2 aria-hidden="true" />} title="No resources yet" description={data.owner ? "Add a room, shared space or piece of equipment to get started." : "Resources will appear here when the organiser adds them."} />}
    </>}
    {bookingSlot ? <FacilitySlotConfirmation data={data} slot={bookingSlot} busy={busy} blocked={disabled} error={mutationError || loadError} onSave={saveSlot} onClose={() => { if (!mutationLock.current) setBookingSlot(null); }} onRefresh={() => { if (!mutationLock.current) { setBookingSlot(null); setMutationError(""); void refresh(); } }} /> : null}
    {bookingEditor ? <FacilityBookingDialog data={data} booking={bookingEditor.booking} resourceId={bookingEditor.resourceId} busy={busy} blocked={disabled} error={mutationError || loadError} onSave={save} onClose={() => { if (!mutationLock.current) setBookingEditor(null); }} /> : null}
    {resourceEditor ? <FacilityResourceDialog resource={resourceEditor.resource} busy={busy} blocked={disabled} error={mutationError || loadError} onSave={save} onClose={() => { if (!mutationLock.current) setResourceEditor(null); }} /> : null}
    <CovieConfirmDialog open={Boolean(confirmation)} id="facility-confirm-change" title={confirmation?.kind === "archive" ? "Archive this resource?" : confirmation?.kind === "decline" ? "Decline this request?" : "Cancel this booking?"} description={<div className={styles.stack}><p>{confirmation?.kind === "archive" ? `${confirmation.resource.name} will no longer accept new bookings. Existing bookings and history stay available.` : confirmation?.kind === "decline" ? "The request will be marked declined. The time slot is not reserved." : `This removes the booking from the active schedule. Cancellation rules still apply: at least ${data.rules.cancellationHours} hours before the start.`}</p>{mutationError || loadError ? <CovieNotice tone="danger">{mutationError || loadError}</CovieNotice> : null}</div>} confirmLabel={busy ? "Saving…" : confirmation?.kind === "archive" ? "Archive resource" : confirmation?.kind === "decline" ? "Decline request" : "Cancel booking"} cancelLabel="Keep it" busy={busy} confirmDisabled={disabled} onCancel={() => setConfirmation(null)} onConfirm={() => void confirmChange()} />
  </div>;
}
