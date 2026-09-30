"use client";
import { useState } from "react";
import {
  CovieButton,
  CovieConfirmDialog,
  CovieInput,
  CovieNotice,
  CovieSelect,
  CovieTextarea,
} from "@/components/ui/covie";
import type { SalonSettings } from "@/lib/salon/contracts";
import type { SalonSave } from "./salon-service-editor";
import styles from "./salon.module.css";
export function SalonSettingsForm({
  settings,
  canPublish,
  busy,
  error,
  onSave,
}: {
  settings: SalonSettings;
  canPublish: boolean;
  busy: boolean;
  error: string;
  onSave: SalonSave;
}) {
  const [value, setValue] = useState(settings),
    [publish, setPublish] = useState(false);
  const update = <K extends keyof SalonSettings>(
    key: K,
    next: SalonSettings[K],
  ) => setValue((current) => ({ ...current, [key]: next }));
  return (
    <form
      className={`${styles.form} ${styles.compact}`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canPublish || busy) return;
        if (value.publicEnabled && !settings.publicEnabled) setPublish(true);
        else await onSave("saveSettings", value);
      }}
    >
      {!canPublish ? (
        <CovieNotice>
          Only the business owner can change these settings.
        </CovieNotice>
      ) : null}
      {error && !publish ? (
        <CovieNotice tone="danger">{error}</CovieNotice>
      ) : null}
      <fieldset className={styles.form} disabled={busy || !canPublish}>
        <label className={styles.field}>
          <span>Business name on booking page</span>
          <CovieInput
            value={value.businessName}
            onChange={(e) => update("businessName", e.target.value)}
            required
            maxLength={120}
          />
        </label>
        <label className={styles.field}>
          <span>About the business (optional)</span>
          <CovieTextarea
            value={value.description}
            onChange={(e) => update("description", e.target.value)}
            maxLength={1000}
          />
        </label>
        <label className={styles.field}>
          <span>Location (optional)</span>
          <CovieInput
            value={value.location}
            onChange={(e) => update("location", e.target.value)}
            maxLength={200}
          />
        </label>
        <div className={styles.formColumns}>
          <label className={styles.field}>
            <span>Minimum notice (minutes)</span>
            <CovieInput
              type="number"
              min={0}
              max={43200}
              value={value.leadMinutes}
              onChange={(e) => update("leadMinutes", Number(e.target.value))}
            />
          </label>
          <label className={styles.field}>
            <span>Book ahead (days)</span>
            <CovieInput
              type="number"
              min={1}
              max={365}
              value={value.advanceDays}
              onChange={(e) => update("advanceDays", Number(e.target.value))}
            />
          </label>
          <label className={styles.field}>
            <span>Start times every</span>
            <CovieSelect
              value={value.slotMinutes}
              onChange={(e) =>
                update(
                  "slotMinutes",
                  Number(e.target.value) as SalonSettings["slotMinutes"],
                )
              }
            >
              {[5, 10, 15, 20, 30, 60].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </CovieSelect>
          </label>
          <label className={styles.field}>
            <span>Client change/cancel notice (hours)</span>
            <CovieInput
              type="number"
              min={0}
              max={720}
              value={value.cancellationHours}
              onChange={(e) =>
                update("cancellationHours", Number(e.target.value))
              }
            />
          </label>
        </div>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={value.publicEnabled}
            onChange={(e) => update("publicEnabled", e.target.checked)}
          />
          Enable the client booking page
        </label>
        <p className={styles.help}>
          The page shows the business details above, offered services, enabled
          practitioner profiles and available times. It never shows other
          clients’ appointments or contact details. Turning it off stops new
          online bookings; existing clients can still manage their own
          appointments.
        </p>
      </fieldset>
      {canPublish ? (
        <CovieButton type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save booking settings"}
        </CovieButton>
      ) : null}
      <CovieConfirmDialog
        open={publish}
        id="salon-enable-booking"
        title="Enable your client booking page?"
        description={
          <div className={styles.stack}>
            <p>
              Your business name, description, location, offered
              services/prices, enabled practitioner profiles and available times
              will be visible to anyone with the booking link. Signed-in clients
              can book available times.
            </p>
            {error ? <CovieNotice tone="danger">{error}</CovieNotice> : null}
          </div>
        }
        confirmLabel={busy ? "Saving…" : "Enable booking page"}
        cancelLabel="Keep private"
        busy={busy}
        onCancel={() => setPublish(false)}
        onConfirm={() =>
          void onSave("saveSettings", value).then((saved) => {
            if (saved) setPublish(false);
          })
        }
      />
    </form>
  );
}
