"use client";
import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import {
  CovieButton,
  CovieDialog,
  CovieInput,
  CovieNotice,
  CovieTextarea,
} from "@/components/ui/covie";
import type { SalonSlot } from "@/lib/salon/contracts";
import { salonPrice, salonTime } from "./salon-ui";
import styles from "./salon.module.css";
export function AppointmentConfirmation({
  slot: initialSlot,
  service: initialService,
  practitioner: initialPractitioner,
  businessName: initialBusinessName,
  timezone: initialTimezone,
  cancellationHours: initialCancellationHours,
  internal = false,
  defaultName = "",
  busy,
  error,
  onSave,
  onClose,
  onRefresh,
}: {
  slot: SalonSlot;
  service: {
    id: string;
    name: string;
    durationMinutes: number;
    priceMinor: number | null;
    currency: string;
  };
  practitioner: string;
  businessName: string;
  timezone: string;
  cancellationHours: number;
  internal?: boolean;
  defaultName?: string;
  busy: boolean;
  error: string;
  onSave: (data: Record<string, unknown>) => Promise<boolean>;
  onClose: () => void;
  onRefresh: () => void;
}) {
  // Keep exactly the terms and interval the user chose. A background refresh
  // must not silently change a confirmation or an interrupted retry's payload.
  const [selection] = useState(() => ({
    slot: { ...initialSlot },
    service: { ...initialService },
    practitioner: initialPractitioner,
    businessName: initialBusinessName,
    timezone: initialTimezone,
    cancellationHours: initialCancellationHours,
  }));
  const {
    slot,
    service,
    practitioner,
    businessName,
    timezone,
    cancellationHours,
  } = selection;
  const [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    [clientName, setName] = useState(defaultName),
    [clientEmail, setEmail] = useState(""),
    [clientPhone, setPhone] = useState(""),
    [notes, setNotes] = useState("");
  return (
    <CovieDialog
      id="salon-booking-confirmation"
      title="Confirm appointment"
      description={`Times use ${timezone}.`}
      icon={<CalendarCheck aria-hidden="true" />}
      iconTone="teal"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <CovieButton tone="neutral" disabled={busy} onClick={onClose}>
            Choose another time
          </CovieButton>
          <CovieButton type="submit" form="salon-booking-form" disabled={busy}>
            {busy ? "Booking…" : "Confirm appointment"}
          </CovieButton>
        </>
      }
    >
      <form
        id="salon-booking-form"
        className={styles.form}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const saved = await onSave({
            requestId,
            serviceId: service.id,
            practitionerId: slot.practitionerId,
            start: slot.start,
            clientName,
            clientEmail,
            clientPhone,
            expectedTerms: {
              serviceName: service.name,
              durationMinutes: service.durationMinutes,
              priceMinor: service.priceMinor,
              currency: service.currency,
              cancellationHours,
            },
            ...(internal ? { notes } : {}),
          });
          if (saved) onClose();
        }}
      >
        <div className={styles.summary}>
          <strong>
            {service.name} with {practitioner}
          </strong>
          <p>
            {salonTime(slot.start, timezone, true)} to{" "}
            {salonTime(slot.end, timezone)}
          </p>
          <p>
            {service.durationMinutes} minutes ·{" "}
            {salonPrice(service.priceMinor, service.currency)}
          </p>
          <p>{businessName}</p>
        </div>
        {error ? (
          <CovieNotice tone="danger">
            <p>{error}</p>
            <p className={styles.help}>
              If the response was interrupted, confirming again with the same
              details checks the same request.{" "}
              {internal ? "Check the business schedule" : "Check Personal"}{" "}
              before choosing another appointment if you are unsure it saved.
            </p>
            <CovieButton tone="neutral" disabled={busy} onClick={onRefresh}>
              Refresh details and times
            </CovieButton>
          </CovieNotice>
        ) : null}
        <label className={styles.field}>
          <span>Client name</span>
          <CovieInput
            value={clientName}
            onChange={(event) => {
              setName(event.target.value);
              setRequestId(crypto.randomUUID());
            }}
            required
            maxLength={100}
            disabled={busy}
          />
        </label>
        <div className={styles.formColumns}>
          <label className={styles.field}>
            <span>Email (optional)</span>
            <CovieInput
              type="email"
              value={clientEmail}
              onChange={(event) => {
                setEmail(event.target.value);
                setRequestId(crypto.randomUUID());
              }}
              maxLength={254}
              disabled={busy}
            />
          </label>
          <label className={styles.field}>
            <span>Phone (optional)</span>
            <CovieInput
              type="tel"
              value={clientPhone}
              onChange={(event) => {
                setPhone(event.target.value);
                setRequestId(crypto.randomUUID());
              }}
              maxLength={40}
              disabled={busy}
            />
          </label>
        </div>
        {internal ? (
          <label className={styles.field}>
            <span>Salon notes (optional)</span>
            <CovieTextarea
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                setRequestId(crypto.randomUUID());
              }}
              maxLength={2000}
              disabled={busy}
            />
          </label>
        ) : null}
        <p className={styles.help}>
          Client details are shared with {businessName} and the assigned
          practitioner to manage this appointment. Changes or cancellation
          require at least {cancellationHours} hours’ notice. Availability is
          checked again when you confirm. No payment is collected here.
        </p>
      </form>
    </CovieDialog>
  );
}
