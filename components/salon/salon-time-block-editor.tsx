"use client";
import { useState } from "react";
import {
  CovieButton,
  CovieDialog,
  CovieInput,
  CovieNotice,
  CovieSegmentedControl,
  CovieTextarea,
} from "@/components/ui/covie";
import { salonDayBounds } from "@/lib/salon/slots";
import type { SalonPractitioner } from "@/lib/salon/contracts";
import { SalonDayPicker } from "./salon-day-picker";
import type { SalonSave } from "./salon-service-editor";
import { salonDateLabel, salonTimeBlockInstant } from "./salon-ui";
import styles from "./salon.module.css";
export function SalonTimeBlockEditor({
  profile,
  date,
  timezone,
  busy,
  error,
  onSave,
  onClose,
}: {
  profile: SalonPractitioner;
  date: string;
  timezone: string;
  busy: boolean;
  error: string;
  onSave: SalonSave;
  onClose: () => void;
}) {
  const [startDate, setStartDate] = useState(date),
    [endDate, setEndDate] = useState(date),
    [part, setPart] = useState<"start" | "end">("start"),
    [allDay, setAllDay] = useState(true),
    [startTime, setStartTime] = useState("09:00"),
    [endTime, setEndTime] = useState("17:00"),
    [reason, setReason] = useState(""),
    [localError, setLocalError] = useState("");
  return (
    <CovieDialog
      id="salon-time-block"
      title={`Block time for ${profile.displayName}`}
      description={`Times use ${timezone}.`}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <CovieButton tone="neutral" disabled={busy} onClick={onClose}>
            Close
          </CovieButton>
          <CovieButton
            type="submit"
            form="salon-time-block-form"
            disabled={busy}
          >
            {busy ? "Saving…" : "Block time"}
          </CovieButton>
        </>
      }
    >
      <form
        id="salon-time-block-form"
        className={styles.form}
        onSubmit={async (event) => {
          event.preventDefault();
          setLocalError("");
          try {
            const start = allDay
                ? salonDayBounds(timezone, startDate).start
                : salonTimeBlockInstant(startDate, startTime, timezone),
              end = allDay
                ? salonDayBounds(timezone, endDate).end
                : salonTimeBlockInstant(endDate, endTime, timezone);
            if (Date.parse(end) <= Date.parse(start))
              throw new Error("Choose an end after the start.");
            if (
              await onSave("saveTimeBlock", {
                practitionerId: profile.id,
                start,
                end,
                reason,
                active: true,
              })
            )
              onClose();
          } catch (caught) {
            setLocalError(
              caught instanceof Error
                ? caught.message
                : "Check the selected times.",
            );
          }
        }}
      >
        {error || localError ? (
          <CovieNotice tone="danger">{error || localError}</CovieNotice>
        ) : null}
        <CovieSegmentedControl
          value={part}
          onChange={setPart}
          options={[
            { value: "start", label: "Start day" },
            { value: "end", label: "End day" },
          ]}
          ariaLabel="Choose the start or end day"
        />
        <SalonDayPicker
          date={part === "start" ? startDate : endDate}
          timezone={timezone}
          disabled={busy}
          onChange={(next) => {
            if (part === "start") {
              setStartDate(next);
              if (endDate < next) setEndDate(next);
            } else setEndDate(next);
          }}
        />
        <p>
          {salonDateLabel(startDate)} to {salonDateLabel(endDate)}
        </p>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={allDay}
            disabled={busy}
            onChange={(event) => setAllDay(event.target.checked)}
          />
          Whole days
        </label>
        {!allDay ? (
          <div className={styles.formColumns}>
            <label className={styles.field}>
              <span>Start time</span>
              <CovieInput
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                disabled={busy}
                required
              />
            </label>
            <label className={styles.field}>
              <span>End time</span>
              <CovieInput
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                disabled={busy}
                required
              />
            </label>
          </div>
        ) : null}
        <label className={styles.field}>
          <span>Reason (private to the salon)</span>
          <CovieTextarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
            maxLength={500}
          />
        </label>
        <p className={styles.help}>
          Time off stops new bookings. Existing appointments are checked before
          this is saved.
        </p>
      </form>
    </CovieDialog>
  );
}
