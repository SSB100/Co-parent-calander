"use client";

import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CovieButton, CovieIconButton, CovieInput, CovieNotice, CovieSelect } from "@/components/ui/covie";
import { localDateInTimeZone } from "@/lib/calendar/time";
import type { FacilityData } from "@/lib/shared-facilities/contracts";
import { facilityBookingsForView, facilityTime, shiftFacilityDate } from "./facilities-ui";
import { facilityDateLabel, facilityDurationOptions, facilityMonthDays, facilitySelectionReady, facilitySlotPlan, shiftFacilityMonth, type FacilitySelection, type FacilitySlot } from "./facility-slots";
import styles from "./facilities.module.css";

type Props = { data: FacilityData; selection: FacilitySelection; busy: boolean; loading: boolean; loadError: string; onDate: (date: string) => void; onResource: (id: string) => void; onSlot: (slot: FacilitySlot) => void; renderBooking: (booking: FacilityData["bookings"][number], includeResource: boolean) => ReactNode };

export function FacilityPlanner({ data, selection, busy, loading, loadError, onDate, onResource, onSlot, renderBooking }: Props) {
  const [duration, setDuration] = useState(() => data.rules.minDuration <= 60 && data.rules.maxDuration >= 60 ? 60 : data.rules.minDuration);
  const [now, setNow] = useState(() => new Date());
  const grid = useRef<HTMLDivElement>(null);
  const focusDay = useRef(false);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  const month = selection.date.slice(0, 7);
  const days = useMemo(() => facilityMonthDays(month), [month]);
  const options = facilityDurationOptions(data.rules);
  const selectedDuration = options.includes(duration) ? duration : options[0];
  const ready = facilitySelectionReady(data, selection) && !loading && !loadError;
  const plan = ready ? facilitySlotPlan(data, selection, selectedDuration, now) : null;
  const resource = data.resources.find((item) => item.id === selection.resourceId && item.active);
  const today = localDateInTimeZone(data.timezone, now);
  const bookings = ready ? facilityBookingsForView(data, "availability", selection.resourceId, now) : [];
  useEffect(() => {
    if (focusDay.current) {
      const button = grid.current?.querySelector<HTMLButtonElement>(`button[data-date="${selection.date}"]`);
      if (button) { button.focus(); focusDay.current = false; }
    }
  }, [selection.date]);

  return <div className={styles.planner}>
    <div className={styles.plannerCalendar}>
      <label className={styles.field}><span>1. Choose a resource</span><CovieSelect value={selection.resourceId} disabled={busy} onChange={(event) => onResource(event.target.value)}><option value="">Choose a room, space or equipment</option>{data.resources.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</CovieSelect></label>
      {resource ? <div className={styles.resourceContext}>{resource.location ? <p><MapPin size={15} aria-hidden="true" />{resource.location}</p> : null}{resource.capacity ? <p>Capacity {resource.capacity}</p> : null}{resource.description ? <p>{resource.description}</p> : null}</div> : null}
      <div className={styles.monthHeading}><CovieIconButton aria-label="Previous month" disabled={busy} onClick={() => onDate(`${shiftFacilityMonth(month, -1)}-01`)}><ChevronLeft size={19} aria-hidden="true" /></CovieIconButton><h2>{facilityDateLabel(`${month}-01`, true)}</h2><CovieIconButton aria-label="Next month" disabled={busy} onClick={() => onDate(`${shiftFacilityMonth(month, 1)}-01`)}><ChevronRight size={19} aria-hidden="true" /></CovieIconButton></div>
      <p className={styles.plannerStep}>2. Choose a day</p>
      <div ref={grid} className={styles.dayGrid} role="group" aria-label="Choose a booking day">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day} className={styles.weekday} aria-hidden="true">{day}</span>)}
        {days.map((day) => {
          const open = data.rules.openDays.includes(new Date(`${day}T12:00:00Z`).getUTCDay());
          return <button type="button" key={day} data-date={day} data-outside={!day.startsWith(month)} data-closed={!open} aria-label={`${facilityDateLabel(day)}${open ? "" : ", closed for bookings"}`} aria-current={day === today ? "date" : undefined} aria-pressed={day === selection.date} tabIndex={day === selection.date ? 0 : -1} disabled={busy} onClick={() => onDate(day)} onKeyDown={(event) => {
            const direction = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
            if (direction !== undefined) { event.preventDefault(); focusDay.current = true; onDate(shiftFacilityDate(day, direction)); }
          }}>{Number(day.slice(-2))}{day === today ? <span className={styles.todayDot} aria-hidden="true" /> : null}</button>;
        })}
      </div>
      <div className={styles.jumpDate}><CovieButton tone="neutral" disabled={busy} onClick={() => onDate(today)}>Today</CovieButton><label className={styles.field}><span>Jump to date</span><CovieInput type="date" value={selection.date} disabled={busy} onChange={(event) => { if (event.target.value) onDate(event.target.value); }} /></label></div>
      <p className={styles.help}>Times use {data.timezone}. Choose a day to load its complete schedule.</p>
    </div>
    <section className={styles.plannerTimes} aria-label="Selected day times" aria-busy={loading}>
      <div className={styles.slotHeading}><div><p className={styles.plannerStep}>3. Choose a time</p><h2>{facilityDateLabel(selection.date)}</h2>{resource ? <p>{resource.name} · {data.timezone}</p> : null}</div><label className={styles.field}><span>Booking length</span><CovieSelect value={selectedDuration} disabled={busy || !resource} onChange={(event) => setDuration(Number(event.target.value))}>{options.map((value) => <option key={value} value={value}>{value} minutes</option>)}</CovieSelect></label></div>
      {!resource ? <p className={styles.available}>Choose a resource to see available times.</p> : !ready ? <div className={styles.loading} role="status">{loadError ? "The schedule could not be refreshed. Use Try again above before choosing a time." : "Loading this day’s times…"}</div> : <>
        {!data.canBook ? <CovieNotice>You have view-only access. Available times are shown for reference.</CovieNotice> : null}
        {plan?.message ? <CovieNotice>{plan.message}</CovieNotice> : null}
        {plan?.slots.length ? <div className={styles.slotGrid} role="group" aria-label={`${resource.name} start times`}>{plan.slots.map((slot) => <button key={slot.start} type="button" className={styles.timeSlot} data-available={slot.available} disabled={busy || !data.canBook || !slot.available} aria-label={`${facilityTime(slot.startInstant, data.timezone)} to ${facilityTime(slot.endInstant, data.timezone)}, ${slot.available ? "available" : "unavailable"}`} onClick={() => onSlot(slot)}><strong>{facilityTime(slot.startInstant, data.timezone)}</strong><span>to {facilityTime(slot.endInstant, data.timezone)}</span><small>{slot.available ? "Available" : "Busy"}</small></button>)}</div> : null}
        {plan?.dstOmitted ? <p className={styles.help}>Clock-change times that repeat, do not exist, or cross a clock change are not offered. Choose another time.</p> : null}
        <p className={styles.help}>Times are checked again when you confirm. Pending requests do not hold a slot.</p>
        {bookings.length ? <section className={styles.stack} aria-label="Selected day bookings"><h3 className={styles.plannerStep}>On this day</h3>{bookings.map((booking) => renderBooking(booking, false))}</section> : null}
      </>}
    </section>
  </div>;
}
