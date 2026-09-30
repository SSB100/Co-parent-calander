"use client";
import { useState } from "react";
import { CovieButton, CovieDialog, CovieNotice } from "@/components/ui/covie";
import { localDateInTimeZone } from "@/lib/calendar/time";
import type { SalonAppointment, SalonSlot } from "@/lib/salon/contracts";
import { SalonDayPicker } from "./salon-day-picker";
import { useSalonResource } from "./use-salon-resource";
import type { SalonSave } from "./salon-service-editor";
import { salonTime } from "./salon-ui";
import styles from "./salon.module.css";
export function SalonRescheduleDialog({
  calendarId,
  appointment,
  timezone,
  busy,
  error,
  onSave,
  onClose,
  onRefresh,
}: {
  calendarId: string;
  appointment: SalonAppointment;
  timezone: string;
  busy: boolean;
  error: string;
  onSave: SalonSave;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [date, setDate] = useState(
      localDateInTimeZone(timezone, new Date(appointment.start)),
    ),
    [slot, setSlot] = useState<SalonSlot | null>(null);
  const request = useSalonResource<{
    calendarId: string;
    date: string;
    slots: SalonSlot[];
  }>(
    `/api/salon?date=${date}&appointmentId=${appointment.id}`,
    { calendarId, date },
    calendarId,
  );
  return (
    <CovieDialog
      id="salon-reschedule"
      title="Choose a new appointment time"
      description={`${appointment.serviceName} with ${appointment.practitionerName}. Times use ${timezone}.`}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <CovieButton tone="neutral" disabled={busy} onClick={onClose}>
            Keep current time
          </CovieButton>
          <CovieButton
            disabled={
              busy || request.loading || Boolean(request.error) || !slot
            }
            onClick={() => {
              if (slot)
                void onSave("reschedule", {
                  id: appointment.id,
                  version: appointment.version,
                  start: slot.start,
                }).then((saved) => {
                  if (saved) onClose();
                });
            }}
          >
            {busy ? "Saving…" : "Confirm new time"}
          </CovieButton>
        </>
      }
    >
      <div className={styles.stack}>
        {error || request.error ? (
          <CovieNotice tone="danger">
            {error || request.error}
            <CovieButton
              tone="neutral"
              onClick={() => {
                onRefresh();
              }}
              disabled={busy}
            >
              Refresh appointment
            </CovieButton>
          </CovieNotice>
        ) : null}
        <SalonDayPicker
          date={date}
          timezone={timezone}
          disabled={busy}
          onChange={(next) => {
            setDate(next);
            setSlot(null);
          }}
        />
        {request.loading ? (
          <p role="status">Loading available times…</p>
        ) : request.data?.slots.length ? (
          <div className={styles.slots}>
            {request.data.slots.map((candidate) => (
              <button
                key={candidate.start}
                type="button"
                className={styles.slot}
                aria-pressed={slot?.start === candidate.start}
                disabled={busy}
                onClick={() => setSlot(candidate)}
              >
                <strong>{salonTime(candidate.start, timezone)}</strong>
                <small>to {salonTime(candidate.end, timezone)}</small>
              </button>
            ))}
          </div>
        ) : (
          <p>No times available on this day.</p>
        )}
        {slot ? (
          <div className={styles.summary}>
            <strong>New time</strong>
            <p>
              {salonTime(slot.start, timezone, true)} to{" "}
              {salonTime(slot.end, timezone)}
            </p>
          </div>
        ) : null}
        <p className={styles.help}>
          The original service length, buffers, displayed price and cancellation
          policy stay with this appointment. Its current time stays booked if
          the change cannot be saved.
        </p>
      </div>
    </CovieDialog>
  );
}
