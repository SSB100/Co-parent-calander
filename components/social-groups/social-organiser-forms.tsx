"use client";

import { useState } from "react";
import { CovieButton, CovieInput, CovieNotice, CovieSelect, CovieTextarea } from "@/components/ui/covie";
import { socialAvailabilitySchema, type SocialAvailability } from "@/lib/social-groups/contracts";
import type { SocialSave } from "./social-ui";
import styles from "./social-groups.module.css";

export function SocialAvailabilityForm({ date, today, existing, timezone, busy, error, onDateChange, onSave }: { date: string; today: string; existing?: SocialAvailability; timezone: string; busy: boolean; error: string; onDateChange: (date: string) => void; onSave: SocialSave }) {
  const [status, setStatus] = useState<"available" | "unavailable">(existing?.status ?? "available");
  const [note, setNote] = useState(existing?.note ?? "");
  const [validation, setValidation] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    const parsed = socialAvailabilitySchema.safeParse({ date, status, note });
    if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? "Check your availability."); return; }
    if (date < today) { setValidation("Choose today or a future date."); return; }
    setValidation(""); await onSave("availability", parsed.data);
  }
  return <form onSubmit={submit} className={styles.organiserForm}>
    <h2 className={styles.subheading}>Your availability</h2><p className={styles.help}>Share a simple update with your group. Dates use {timezone}. Only you can change your response.</p>
    {validation || error ? <CovieNotice tone="danger">{validation || error}</CovieNotice> : null}
    <fieldset disabled={busy} className={styles.form}>
      <div className={styles.formColumns}><label className={styles.field}><span>Date</span><CovieInput type="date" required min={today} value={date} onChange={(e) => { if (e.target.value) onDateChange(e.target.value); }} /></label><label className={styles.field}><span>Availability</span><CovieSelect value={status} onChange={(e) => setStatus(e.target.value as "available" | "unavailable")}><option value="available">Available</option><option value="unavailable">Unavailable</option></CovieSelect></label></div>
      <label className={styles.field}><span>Note <small>(optional, visible to the group)</small></span><CovieTextarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></label>
    </fieldset>
    <div className={styles.actions}><CovieButton type="submit" disabled={busy || date < today}>{busy ? "Saving…" : "Save availability"}</CovieButton></div>
  </form>;
}

export function SocialSettingsForm({ membersCanCreate, busy, error, onSave }: { membersCanCreate: boolean; busy: boolean; error: string; onSave: SocialSave }) {
  const [allowed, setAllowed] = useState(membersCanCreate);
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!busy) await onSave("settings", { membersCanCreate: allowed }); }
  return <form onSubmit={submit} className={styles.organiserForm}>
    <h2 className={styles.subheading}>Who can create events?</h2>
    {error ? <CovieNotice tone="danger">{error}</CovieNotice> : null}
    <label className={styles.checkbox}><input type="checkbox" checked={allowed} disabled={busy} onChange={(e) => setAllowed(e.target.checked)} />Allow group members to create events</label>
    <p className={styles.help}>Owners and admins can always organise events. Members can still respond and manage their own existing events when this is off. View-only members cannot make changes.</p>
    <div className={styles.actions}><CovieButton type="submit" disabled={busy}>{busy ? "Saving…" : "Save group settings"}</CovieButton><CovieButton tone="neutral" disabled={busy} onClick={() => setAllowed(membersCanCreate)}>Reset changes</CovieButton></div>
  </form>;
}
