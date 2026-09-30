"use client";
import { useState } from "react";
import {
  CovieButton,
  CovieDialog,
  CovieInput,
  CovieNotice,
  CovieSelect,
  CovieTextarea,
} from "@/components/ui/covie";
import type { SalonService } from "@/lib/salon/contracts";
import styles from "./salon.module.css";
export type SalonSave = (action: string, data: unknown) => Promise<boolean>;
export function SalonServiceEditor({
  service,
  busy,
  error,
  onSave,
  onClose,
}: {
  service?: SalonService;
  busy: boolean;
  error: string;
  onSave: SalonSave;
  onClose: () => void;
}) {
  const [name, setName] = useState(service?.name || ""),
    [description, setDescription] = useState(service?.description || ""),
    [duration, setDuration] = useState(service?.durationMinutes || 30),
    [before, setBefore] = useState(service?.bufferBeforeMinutes || 0),
    [after, setAfter] = useState(service?.bufferAfterMinutes || 0),
    [price, setPrice] = useState(
      service?.priceMinor == null ? "" : String(service.priceMinor / 100),
    ),
    [currency, setCurrency] = useState(service?.currency || "NZD"),
    [bookable, setBookable] = useState(service?.bookable || false),
    [active, setActive] = useState(service?.active ?? true);
  return (
    <CovieDialog
      id="salon-service-editor"
      title={service ? "Edit service" : "Add service"}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <CovieButton tone="neutral" disabled={busy} onClick={onClose}>
            Close
          </CovieButton>
          <CovieButton type="submit" form="salon-service-form" disabled={busy}>
            {busy ? "Saving…" : "Save service"}
          </CovieButton>
        </>
      }
    >
      <form
        id="salon-service-form"
        className={styles.form}
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await onSave("saveService", {
              ...(service ? { id: service.id } : {}),
              name,
              description,
              durationMinutes: duration,
              bufferBeforeMinutes: before,
              bufferAfterMinutes: after,
              priceMinor: price === "" ? null : Math.round(Number(price) * 100),
              currency,
              active,
              bookable,
            })
          )
            onClose();
        }}
      >
        {error ? <CovieNotice tone="danger">{error}</CovieNotice> : null}
        <label className={styles.field}>
          <span>Service name</span>
          <CovieInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            disabled={busy}
          />
        </label>
        <label className={styles.field}>
          <span>Description (optional)</span>
          <CovieTextarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            disabled={busy}
          />
        </label>
        <div className={styles.formColumns}>
          <label className={styles.field}>
            <span>Appointment length (minutes)</span>
            <CovieInput
              type="number"
              min={5}
              max={720}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              required
              disabled={busy}
            />
          </label>
          <label className={styles.field}>
            <span>Displayed price (optional)</span>
            <CovieInput
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className={styles.field}>
            <span>Currency</span>
            <CovieSelect
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={busy}
            >
              {["NZD", "AUD", "USD", "GBP", "EUR"].map((code) => (
                <option key={code}>{code}</option>
              ))}
            </CovieSelect>
          </label>
        </div>
        <div className={styles.formColumns}>
          <label className={styles.field}>
            <span>Buffer before (minutes)</span>
            <CovieInput
              type="number"
              min={0}
              max={240}
              value={before}
              onChange={(e) => setBefore(Number(e.target.value))}
              disabled={busy}
            />
          </label>
          <label className={styles.field}>
            <span>Buffer after (minutes)</span>
            <CovieInput
              type="number"
              min={0}
              max={240}
              value={after}
              onChange={(e) => setAfter(Number(e.target.value))}
              disabled={busy}
            />
          </label>
        </div>
        <p className={styles.help}>
          The practitioner stays unavailable for the whole visit plus both
          buffers. Existing appointments keep their agreed length, buffers and
          price.
        </p>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            disabled={busy}
          />
          Active service
        </label>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={bookable}
            onChange={(e) => setBookable(e.target.checked)}
            disabled={busy}
          />
          Offer on the client booking page when it is enabled
        </label>
      </form>
    </CovieDialog>
  );
}
