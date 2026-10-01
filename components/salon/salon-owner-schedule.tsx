"use client";

import { useId, useMemo, type CSSProperties } from "react";
import {
  salonOwnerScheduleModel,
  salonScheduleCompactRange,
  salonScheduleTime,
  type SalonOwnerScheduleInput,
  type SalonScheduleAppointmentEntry,
  type SalonScheduleRange,
  type SalonScheduleSegment,
} from "./salon-owner-schedule-model";
import styles from "./salon-owner-workspace.module.css";

export type SalonOwnerScheduleProps = SalonOwnerScheduleInput & {
  selectedAppointmentId: string | null;
  disabled: boolean;
  onSelectAppointment: (id: string) => void;
};

const segmentLabel = { before: "Buffer before", service: "Service", after: "Buffer after" } as const;
const position = (range: SalonScheduleRange, row: SalonScheduleRange): CSSProperties => ({
  top: `${(range.start - row.start) / (row.end - row.start) * 100}%`,
  height: `${(range.end - range.start) / (row.end - row.start) * 100}%`,
});

/** Mount only for data.role === "owner" in SalonPage. No loading, mutations or slot generation live here. */
export function SalonOwnerSchedule({
  date, timezone, practitioners, hours, timeBlocks, appointments, practitionerId,
  showCancelled, selectedAppointmentId, disabled, onSelectAppointment,
}: SalonOwnerScheduleProps) {
  const headingId = useId(), helpId = useId();
  const model = useMemo(() => salonOwnerScheduleModel({
    date, timezone, practitioners, hours, timeBlocks, appointments, practitionerId, showCancelled,
  }), [date, timezone, practitioners, hours, timeBlocks, appointments, practitionerId, showCancelled]);
  const dateValue = new Date(`${date}T12:00:00Z`);
  const validDate = !Number.isNaN(dateValue.getTime()) && dateValue.toISOString().slice(0, 10) === date;
  const dateLabel = !validDate ? date : new Intl.DateTimeFormat("en-NZ", {
    timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(dateValue);
  const rangeLabel = (start: number, end: number) => `${salonScheduleTime(start, timezone)} to ${salonScheduleTime(end, timezone)}`;
  const compactRange = (start: number, end: number) => salonScheduleCompactRange(start, end, timezone, date);
  const segmentDescription = (segments: SalonScheduleSegment[]) => segments
    .map(segment => `${segmentLabel[segment.kind]} in this row, ${rangeLabel(segment.start, segment.end)}`).join(". ");
  const appointmentDescription = (entry: SalonScheduleAppointmentEntry) =>
    `${entry.serviceName}${entry.clientName ? ` for ${entry.clientName}` : ""}. ${rangeLabel(entry.serviceStart, entry.serviceEnd)}. With ${entry.practitionerName}. ${entry.status === "confirmed" ? "Confirmed" : "Cancelled; time is not held"}.${entry.bufferOnlyOnDay ? " Buffer only on this day." : ""}`;

  function appointmentButton(entry: SalonScheduleAppointmentEntry, segments: SalonScheduleSegment[]) {
    const onlyBuffer = !segments.some(segment => segment.kind === "service");
    return <button
      type="button"
      className={styles.appointment}
      data-appointment-id={entry.id}
      data-continuation="false"
      data-status={entry.status}
      data-buffer-only={entry.bufferOnlyOnDay}
      aria-label={`${appointmentDescription(entry)} ${segmentDescription(segments)} View appointment details.`}
      aria-pressed={selectedAppointmentId === entry.id}
      disabled={disabled}
      onClick={() => { if (!disabled) onSelectAppointment(entry.id); }}
    >
      <span className={styles.recordHeading}>
        <strong>{entry.serviceName}</strong>
        {entry.clientName ? <span className={styles.clientName}> · {entry.clientName}</span> : null}
      </span>
      <span className={styles.exactTime}>{compactRange(entry.serviceStart, entry.serviceEnd)}</span>
      {entry.status === "cancelled" ? <span className={styles.status}>Cancelled · time not held</span> : null}
      {entry.bufferOnlyOnDay ? <span className={styles.bufferOnly}>Buffer only on this day</span> : onlyBuffer ? <span className={styles.bufferOnly}>{segmentLabel[segments[0].kind]}</span> : null}
      <span className={styles.segmentSummary}>{segments.map(segment => `${segmentLabel[segment.kind]} ${compactRange(segment.start, segment.end)}`).join(" · ")}</span>
    </button>;
  }

  return <section className={styles.schedule} aria-labelledby={headingId} aria-busy={disabled} data-salon-owner-schedule>
    <div className={styles.context}>
      <div>
        <h2 id={headingId}>{dateLabel}</h2>
        <p>{practitionerId ? model.columns[0]?.practitioner.displayName ?? "Selected practitioner" : "Practitioner day schedule"} · {timezone}</p>
      </div>
      <ul className={styles.legend} aria-label="Schedule key">
        <li><span className={styles.serviceKey} aria-hidden="true" />Confirmed appointment</li>
        <li><span className={styles.bufferKey} aria-hidden="true" />Buffer</li>
        <li><span className={styles.blockKey} aria-hidden="true" />Blocked time</li>
        <li><span className={styles.workingKey} aria-hidden="true" />Working hours</li>
      </ul>
    </div>
    <p className={styles.help} id={helpId}>Blank space does not confirm availability. Use Book an appointment to check times.</p>
    {model.message ? <p className={styles.notice} role="status">{model.message}</p> : null}
    {model.warning ? <p className={styles.notice} role="status">{model.warning}</p> : null}
    {model.clockChange ? <p className={styles.notice}>The clocks change on this day. Rows follow actual time; offsets distinguish repeated times.</p> : null}
    {model.rows.length && model.columns.length ? <div
      className={styles.canvas}
      role="region"
      tabIndex={0}
      aria-label={`${dateLabel} practitioner timeline. Scroll for more times or practitioners.`}
      aria-describedby={helpId}
    >
      <table className={styles.table} style={{ "--practitioner-count": model.columns.length } as CSSProperties}>
        <caption className={styles.srOnly}>Appointments, buffers, time blocks and recorded working hours for {dateLabel}, {timezone}. Select an appointment for details. Compact buttons in subsequent rows show its continuation. Full dates, offsets and status are included in each appointment’s accessible label.</caption>
        <thead><tr>
          <th scope="col" className={styles.timeHeading}>Time</th>
          {model.columns.map(({ practitioner, working }) => <th scope="col" key={practitioner.id}>
            <strong>{practitioner.displayName}</strong>
            {practitioner.active === false ? <span className={styles.profileStatus}>Inactive practitioner</span> : null}
            {practitioner.active === null ? <span className={styles.profileStatus}>Profile not listed</span> : null}
            {!working.length ? <span>No working hours recorded</span> : null}
          </th>)}
        </tr></thead>
        <tbody>{model.rows.map((row, index) => <tr key={row.id}>
          <th scope="row" className={styles.time}>
            <strong>{row.label}</strong>
            <span>{row.offset}</span>
            <span className={styles.srOnly}>Until {salonScheduleTime(row.end, timezone)}</span>
          </th>
          {model.columns.map(column => {
            const cell = column.cells[index];
            return <td key={column.practitioner.id} data-practitioner={column.practitioner.id} data-row-start={row.start}>
              <div className={styles.cell}>
                <div className={styles.working} aria-hidden="true">{cell.working.map(range => <span key={range.start} style={position(range, row)} />)}</div>
                <span className={styles.srOnly}>{cell.working.length ? cell.working.map(range => `Recorded working hours: ${rangeLabel(range.start, range.end)}.`).join(" ") : "Outside recorded working hours."}</span>
                {cell.entries.map(({ entry, firstRow, segments }) => <div
                  key={`${entry.kind}:${entry.id}`}
                  className={styles.record}
                  data-status={entry.kind === "appointment" ? entry.status : "block"}
                  data-selected={entry.kind === "appointment" && selectedAppointmentId === entry.id}
                >
                  {entry.kind === "appointment" ? <>
                    {firstRow ? appointmentButton(entry, segments) : <button
                      type="button" className={styles.continuation}
                      data-appointment-id={entry.id} data-continuation="true" data-status={entry.status}
                      aria-pressed={selectedAppointmentId === entry.id} disabled={disabled}
                      aria-label={`${appointmentDescription(entry)} ${segmentDescription(segments)} View appointment details.`}
                      onClick={() => { if (!disabled) onSelectAppointment(entry.id); }}
                    >
                      <strong>{entry.serviceName}{entry.clientName ? ` · ${entry.clientName}` : ""}</strong>
                      <span>{segments.map(segment => `${segmentLabel[segment.kind]} ${compactRange(segment.start, segment.end)}`).join(" · ")}</span>
                      {entry.status === "cancelled" ? <span>Cancelled · time not held</span> : null}
                    </button>}
                  </> : firstRow ? <div className={styles.block} aria-label={`Blocked time. ${rangeLabel(entry.start, entry.end)}. With ${entry.practitionerName}.`}>
                    <strong>Blocked time</strong>
                    <span className={styles.exactTime}>{compactRange(entry.start, entry.end)}</span>
                  </div> : <p className={styles.blockContinuation}>
                    <span aria-hidden="true">Blocked time continues</span>
                    <span className={styles.srOnly}>Blocked time, {rangeLabel(entry.start, entry.end)}, with {entry.practitionerName}, continues in this row.</span>
                  </p>}
                </div>)}
                {!cell.entries.length ? <span className={styles.srOnly}>No records shown.</span> : null}
              </div>
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div> : null}
  </section>;
}
