"use client";

import { CalendarDays, Clock3 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CovieButton, CovieDialog, CovieNotice } from "@/components/ui/covie";
import type { FacilityData } from "@/lib/shared-facilities/contracts";
import { facilityTime } from "./facilities-ui";
import { facilityDateLabel, type FacilitySlot } from "./facility-slots";
import { facilityOwnerHourLabel, facilityOwnerScheduleModel, type FacilityOwnerHour } from "./facility-owner-schedule-model";
import styles from "./facility-owner-schedule.module.css";

type Props = {
  data: FacilityData;
  date: string;
  resourceId: string;
  duration: number;
  disabled: boolean;
  onSlot: (slot: FacilitySlot) => void;
  onBooking: (id: string) => void;
};
type Choice = { kind: "slots" | "bookings"; resourceId: string; minute: number; data: FacilityData };

export function FacilityOwnerSchedule(props: Props) {
  // Navigation or a new duration discards the previous chooser's intent.
  return <FacilityOwnerScheduleCanvas key={`${props.data.calendarId}:${props.date}:${props.resourceId}:${props.duration}`} {...props} />;
}

function FacilityOwnerScheduleCanvas({ data, date, resourceId, duration, disabled, onSlot, onBooking }: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  const [choice, setChoice] = useState<Choice | null>(null);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  const datedTime = useMemo(() => new Intl.DateTimeFormat("en-NZ", { timeZone: data.timezone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), [data.timezone]);
  const ready = !disabled && data.date === date;
  const canBook = data.canBook && data.role !== "viewer";
  const model = useMemo(() => facilityOwnerScheduleModel(data, date, resourceId, duration, now), [data, date, resourceId, duration, now]);
  const selected = model.columns.find((column) => column.resource.id === choice?.resourceId);
  const hour = selected?.hours.find((item) => item.minute === choice?.minute);
  // A fresh snapshot or loading/permission change invalidates the open chooser.
  if (choice && (!ready || choice.data !== data || !hour)) setChoice(null);
  const visibleChoice = choice && ready && choice.data === data && hour ? choice : null;

  function chooseHour(id: string, item: FacilityOwnerHour, kind: Choice["kind"]) {
    if (!ready) return;
    if (kind === "slots" && !canBook) return;
    if (kind === "slots" && item.slots.length === 1) { setChoice(null); onSlot(item.slots[0]); }
    else if (kind === "bookings" && item.bookings.length === 1) { setChoice(null); onBooking(item.bookings[0].id); }
    else setChoice({ kind, resourceId: id, minute: item.minute, data });
  }

  return <section className={styles.schedule} aria-label="Resource day schedule" aria-busy={disabled} data-facility-owner-schedule>
    <div className={styles.context}>
      <div><h2>{facilityDateLabel(date)}</h2><p>{resourceId ? model.columns[0]?.resource.name ?? "Selected resource" : "All active resources"} · {data.timezone}</p></div>
      <CovieButton tone="neutral" disabled={!ready || !canBook || !model.columns.some(column => column.hours.some(hour => hour.slots.length))} onClick={() => {
        const target = canvas.current?.querySelector<HTMLButtonElement>('button[data-available-start]:not(:disabled)');
        target?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
        target?.focus({ preventScroll: true });
      }}>Next available time</CovieButton>
      <p className={styles.legend}><span className={styles.busyKey} aria-hidden="true" />Confirmed busy time <span className={styles.availableKey} aria-hidden="true" />Available starts</p>
    </div>
    {data.date !== date ? <CovieNotice>Loading this day’s complete schedule…</CovieNotice> : <>
      {model.message ? <CovieNotice>{model.message}</CovieNotice> : null}
      {!canBook ? <CovieNotice>Available times are shown for reference. Booking is unavailable with your current access.</CovieNotice> : null}
      {model.columns.length ? <div ref={canvas} className={styles.canvas} tabIndex={0} role="region" aria-label={`${facilityDateLabel(date)} timetable. Scroll for more times or resources.`}>
        <table className={styles.table} style={{ "--resource-count": model.columns.length } as CSSProperties}>
          <caption className={styles.srOnly}>Resource availability for {facilityDateLabel(date)}. Times use {data.timezone}. Each row shows one hour; coloured marks show exact confirmed occupancy. Available starts use a {duration}-minute booking.</caption>
          <thead><tr><th scope="col" className={styles.timeHeading}>Time</th>{model.columns.map(({ resource }) => <th scope="col" key={resource.id} data-selected={resource.id === resourceId}><strong>{resource.name}</strong>{resource.location ? <span>{resource.location}</span> : <span>{resource.capacity ? `Capacity ${resource.capacity}` : "Room, space or equipment"}</span>}</th>)}</tr></thead>
          <tbody>{model.hours.map((minute, index) => <tr key={minute}>
            <th scope="row" className={styles.hour}>{facilityOwnerHourLabel(minute)}</th>
            {model.columns.map(({ resource, hours }) => {
              const item = hours[index];
              const confirmed = item.bookings.filter((booking) => booking.status === "confirmed").length;
              const pending = item.bookings.length - confirmed;
              const first = item.bookings[0];
              return <td key={resource.id} data-resource={resource.id} data-hour={minute} data-selected={resource.id === resourceId}>
                <div className={styles.cell}>
                  <div className={styles.occupancy} aria-hidden="true">{item.occupied.map((range, segment) => <span key={segment} data-occupied-start={range.start} data-occupied-end={range.end} style={{ top: `${(range.start - minute) / 60 * 100}%`, height: `${(range.end - range.start) / 60 * 100}%` }} />)}</div>
                  {item.bookings.length ? <button type="button" className={styles.booking} data-pending-only={!confirmed} disabled={!ready} aria-label={`${resource.name}, ${item.bookings.length === 1 ? `${first.status === "pending" ? "pending request" : "confirmed booking"}, ${datedTime.format(new Date(first.start))} to ${datedTime.format(new Date(first.end))}, ${data.timezone}` : `${confirmed} confirmed bookings and ${pending} pending requests around ${facilityOwnerHourLabel(minute)}`}. View details.`} onClick={() => chooseHour(resource.id, item, "bookings")}>
                    <strong>{item.bookings.length === 1 ? first.status === "pending" ? "Request" : "Booked" : `${item.bookings.length} bookings`}</strong>
                    <span>{item.bookings.length === 1 ? `${facilityTime(first.start, data.timezone)}–${facilityTime(first.end, data.timezone)}` : pending ? `${pending} pending` : "View times"}</span>
                  </button> : null}
                  {item.slots.length ? <button type="button" className={styles.start} data-available-start disabled={!ready || !canBook} aria-label={`${resource.name}, ${item.slots.length} available ${duration}-minute ${item.slots.length === 1 ? "start" : "starts"} from ${facilityTime(item.slots[0].startInstant, data.timezone)}. Choose time.`} onClick={() => chooseHour(resource.id, item, "slots")}>
                    <strong>{item.slots.length === 1 ? facilityTime(item.slots[0].startInstant, data.timezone) : "Choose start"}</strong><span>{item.slots.length === 1 ? "Available" : `${item.slots.length} available`}</span>
                  </button> : <span className={styles.noStarts}>No starts</span>}
                </div>
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </div> : null}
      <p className={styles.help}>{model.dstOmitted ? "Clock-change times that repeat, do not exist or cross a clock change are not offered. " : ""}Pending requests do not hold time. Availability is checked again when you confirm.</p>
    </>}
    {visibleChoice && selected && hour ? <CovieDialog id="facility-owner-time-chooser" title={visibleChoice.kind === "slots" ? "Choose a start time" : "Bookings in this hour"} description={`${selected.resource.name} · ${facilityDateLabel(date)} · ${data.timezone}`} icon={visibleChoice.kind === "slots" ? <Clock3 aria-hidden="true" /> : <CalendarDays aria-hidden="true" />} size="sm" onClose={() => setChoice(null)} footer={<CovieButton tone="neutral" onClick={() => setChoice(null)}>Back to schedule</CovieButton>}>
      {visibleChoice.kind === "slots" ? <><p className={styles.chooserHelp}>Each booking lasts {duration} minutes. Choose the exact start and end that suit you.</p><div className={styles.choices}>{hour.slots.map((slot) => <CovieButton key={slot.startInstant} tone="neutral" disabled={!ready || !canBook} onClick={() => { if (!ready || !canBook) return; setChoice(null); onSlot(slot); }}><strong>{facilityTime(slot.startInstant, data.timezone)}</strong><span>to {facilityTime(slot.endInstant, data.timezone)}</span></CovieButton>)}</div>{!hour.slots.length ? <CovieNotice>These starts are no longer available. Choose another hour.</CovieNotice> : null}</> : <div className={styles.bookingChoices}>{hour.bookings.map((booking) => <CovieButton key={booking.id} tone="neutral" disabled={!ready} aria-label={`${booking.title || "Booking"}, ${booking.status}, ${datedTime.format(new Date(booking.start))} to ${datedTime.format(new Date(booking.end))}, ${data.timezone}. View details.`} onClick={() => { if (!ready) return; setChoice(null); onBooking(booking.id); }}><strong>{booking.title || (booking.own ? "Your booking" : "Reserved")}</strong><span>{facilityTime(booking.start, data.timezone)} to {facilityTime(booking.end, data.timezone)}</span><span>{booking.status === "pending" ? "Pending request · does not hold time" : "Confirmed"}</span></CovieButton>)}</div>}
    </CovieDialog> : null}
  </section>;
}

