"use client";
import { useState } from "react";
import Link from "next/link";
import {
  CovieButton,
  CovieConfirmDialog,
  CovieNotice,
  CoviePage,
  CoviePageHeader,
  CovieRecordCard,
  CovieStatusBadge,
} from "@/components/ui/covie";
import type { OwnSalonAppointment, SalonSlot } from "@/lib/salon/contracts";
import { SalonDayPicker } from "./salon-day-picker";
import { useSalonMutation, useSalonResource } from "./use-salon-resource";
import { salonPrice, salonTime } from "./salon-ui";
import styles from "./salon.module.css";
export function OwnAppointmentPage({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const [date, setDate] = useState(""),
    [rescheduling, setRescheduling] = useState(false),
    [replacement, setReplacement] = useState<SalonSlot | null>(null),
    [reviewedAppointment, setReviewedAppointment] = useState<{
      id: string;
      version: number;
      start: string;
      end: string;
    } | null>(null),
    [cancel, setCancel] = useState(false),
    [notice, setNotice] = useState("");
  const { data, loading, error, refresh } =
    useSalonResource<OwnSalonAppointment>(
      `/api/appointments/${appointmentId}${date ? `?date=${date}` : ""}`,
      { appointmentId, date },
    );
  const mutation = useSalonMutation(
      `/api/appointments/${appointmentId}`,
      undefined,
      () => void refresh(),
    ),
    appointment = data?.appointment;
  async function save(action: "cancel" | "reschedule") {
    if (!reviewedAppointment) return;
    const saved = await mutation.save({
      action,
      data: {
        id: reviewedAppointment.id,
        version: reviewedAppointment.version,
        ...(action === "reschedule" ? { start: replacement?.start } : {}),
      },
    });
    if (saved) {
      setNotice(
        action === "cancel"
          ? "Appointment cancelled. Its details stay in your history."
          : "Your new time is confirmed.",
      );
      setCancel(false);
      setReviewedAppointment(null);
      setReplacement(null);
      setRescheduling(false);
      void refresh();
    }
  }
  return (
    <CoviePage className={styles.publicPage}>
      <CoviePageHeader
        accent="teal"
        title="Your appointment"
        actions={
          <Link href="/personal" className={styles.link}>
            Personal calendar
          </Link>
        }
      />
      {notice ? <CovieNotice tone="teal">{notice}</CovieNotice> : null}
      {error ? (
        <CovieNotice tone="danger">
          {error}
          {error.startsWith("Sign in") ? (
            <Link
              className={styles.link}
              href={`/auth/sign-in?returnTo=${encodeURIComponent(`/booking/manage/${appointmentId}`)}`}
            >
              Sign in to continue
            </Link>
          ) : null}
          <CovieButton tone="neutral" onClick={() => void refresh()}>
            Try again
          </CovieButton>
        </CovieNotice>
      ) : null}
      {loading ? (
        <p role="status" className={styles.loading}>
          Loading your appointment…
        </p>
      ) : null}
      {data && appointment ? (
        <div className={styles.stack}>
          <CovieRecordCard className={styles.record}>
            <h2 className={styles.sectionTitle}>
              {appointment.serviceName} with {appointment.practitionerName}
            </h2>
            <CovieStatusBadge
              tone={appointment.status === "confirmed" ? "teal" : "neutral"}
            >
              {appointment.status === "confirmed" ? "Confirmed" : "Cancelled"}
            </CovieStatusBadge>
            <p>
              {salonTime(appointment.start, data.timezone, true)} to{" "}
              {salonTime(appointment.end, data.timezone)}
            </p>
            <p>
              {data.businessName}
              {data.location ? ` · ${data.location}` : ""}
            </p>
            <p>
              {appointment.durationMinutes} minutes ·{" "}
              {salonPrice(appointment.priceMinor, appointment.currency)}
            </p>
            <p className={styles.help}>
              Times use {data.timezone}. This appointment keeps the service
              details and cancellation policy agreed when you booked.
            </p>
            <div className={styles.contact}>
              <p>{appointment.clientName}</p>
              {appointment.clientEmail ? (
                <p>{appointment.clientEmail}</p>
              ) : null}
              {appointment.clientPhone ? (
                <p>{appointment.clientPhone}</p>
              ) : null}
            </div>
            <div className={styles.actions}>
              {appointment.canReschedule ? (
                <CovieButton
                  onClick={() => {
                    setRescheduling(true);
                    mutation.setError("");
                  }}
                >
                  Choose a new time
                </CovieButton>
              ) : null}
              {appointment.canCancel ? (
                <CovieButton
                  tone="neutral"
                  onClick={() => {
                    setReviewedAppointment({
                      id: appointment.id,
                      version: appointment.version,
                      start: appointment.start,
                      end: appointment.end,
                    });
                    setCancel(true);
                    mutation.setError("");
                  }}
                >
                  Cancel appointment
                </CovieButton>
              ) : null}
            </div>
            {appointment.status === "confirmed" ? (
              <p className={styles.help}>
                Changes need at least {appointment.cancellationHours} hours’
                notice. If online changes are unavailable, contact the salon.
              </p>
            ) : null}
          </CovieRecordCard>
          {rescheduling && appointment.canReschedule ? (
            <div className={styles.planner}>
              <SalonDayPicker
                date={date || data.date}
                timezone={data.timezone}
                disabled={mutation.busy}
                onChange={(next) => {
                  setDate(next);
                  setReplacement(null);
                }}
              />
              <section className={styles.stack}>
                <h2 className={styles.sectionTitle}>Choose a new time</h2>
                {loading ? (
                  <p role="status">Checking available times…</p>
                ) : data.slots.length ? (
                  <div className={styles.slots}>
                    {data.slots.map((slot) => (
                      <button
                        key={slot.start}
                        className={styles.slot}
                        type="button"
                        disabled={mutation.busy || loading}
                        onClick={() => {
                          setReviewedAppointment({
                            id: appointment.id,
                            version: appointment.version,
                            start: appointment.start,
                            end: appointment.end,
                          });
                          setReplacement(slot);
                        }}
                      >
                        <strong>{salonTime(slot.start, data.timezone)}</strong>
                        <small>to {salonTime(slot.end, data.timezone)}</small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>No times available on this day. Choose another day.</p>
                )}
                <CovieButton
                  tone="neutral"
                  disabled={mutation.busy}
                  onClick={() => {
                    setRescheduling(false);
                    setReplacement(null);
                  }}
                >
                  Keep current time
                </CovieButton>
              </section>
            </div>
          ) : null}
          <CovieConfirmDialog
            open={cancel || Boolean(replacement)}
            id="own-appointment-confirm"
            title={
              cancel ? "Cancel this appointment?" : "Confirm the new time?"
            }
            description={
              <div className={styles.stack}>
                <p>
                  {cancel
                    ? `The appointment${reviewedAppointment ? ` on ${salonTime(reviewedAppointment.start, data.timezone, true)}` : ""} will be cancelled and its history retained.`
                    : replacement
                      ? `${salonTime(replacement.start, data.timezone, true)} to ${salonTime(replacement.end, data.timezone)}. Your current time stays booked if this change cannot be saved.`
                      : ""}
                </p>
                {mutation.error ? (
                  <CovieNotice tone="danger">
                    <p>{mutation.error}</p>
                    <CovieButton
                      tone="neutral"
                      disabled={mutation.busy}
                      onClick={() => {
                        setCancel(false);
                        setReviewedAppointment(null);
                        setReplacement(null);
                        setRescheduling(false);
                        mutation.setError("");
                        void refresh();
                      }}
                    >
                      Refresh appointment
                    </CovieButton>
                  </CovieNotice>
                ) : null}
              </div>
            }
            confirmLabel={
              mutation.busy
                ? "Saving…"
                : cancel
                  ? "Cancel appointment"
                  : "Confirm new time"
            }
            cancelLabel="Keep it"
            busy={mutation.busy}
            onCancel={() => {
              setCancel(false);
              setReviewedAppointment(null);
              setReplacement(null);
            }}
            onConfirm={() => void save(cancel ? "cancel" : "reschedule")}
          />
        </div>
      ) : null}
    </CoviePage>
  );
}
