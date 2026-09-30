"use client";

import { useState } from "react";
import { CovieButton, CovieInput, CovieNotice } from "@/components/ui/covie";
import { facilityRulesSchema, type FacilityRules } from "@/lib/shared-facilities/contracts";
import { facilityWeekdays, inputMinute, minuteInput } from "./facilities-ui";
import type { FacilitySave } from "./facility-dialogs";
import styles from "./facilities.module.css";

const numericRules = [
  { key: "minDuration", label: "Minimum duration (minutes)", min: 15, max: 1440 },
  { key: "maxDuration", label: "Maximum duration (minutes)", min: 15, max: 1440 },
  { key: "minNoticeHours", label: "Minimum notice (hours)", min: 0, max: 720 },
  { key: "advanceDays", label: "Book up to (days ahead)", min: 1, max: 365 },
  { key: "cancellationHours", label: "Cancellation notice (hours)", min: 0, max: 720 },
  { key: "maxActiveBookings", label: "Maximum active bookings per member", min: 1, max: 100 },
] as const;

export function FacilityRulesForm({ rules, timezone, busy, error, onSave }: { rules: FacilityRules; timezone: string; busy: boolean; error: string; onSave: FacilitySave }) {
  const [draft, setDraft] = useState(rules);
  const [validation, setValidation] = useState("");
  const [saved, setSaved] = useState(false);
  const change = (next: FacilityRules) => { setDraft(next); setSaved(false); };
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    const parsed = facilityRulesSchema.safeParse(draft);
    if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? "Check the booking rules."); return; }
    setValidation(""); setSaved(await onSave("rules", parsed.data));
  }
  return (
    <form onSubmit={submit} className={`${styles.form} ${styles.rulesForm}`}>
      <p className={styles.help}>Opening hours use {timezone}. Rules apply when a booking is saved or approved. Existing bookings are retained.</p>
      {validation || error ? <CovieNotice tone="danger">{validation || error}</CovieNotice> : null}
      {saved ? <CovieNotice tone="teal">Booking rules saved.</CovieNotice> : null}
      <fieldset disabled={busy} className={styles.form}>
        <div className={styles.formColumns}>
          <label className={styles.field}><span>Opening time</span><CovieInput type="time" required value={minuteInput(draft.openMinute)} onChange={(event) => change({ ...draft, openMinute: inputMinute(event.target.value) })} /></label>
          <div className={styles.field}><label htmlFor="facility-closing-time">Closing time</label><CovieInput id="facility-closing-time" type="time" required disabled={draft.closeMinute === 1440 || busy} value={draft.closeMinute === 1440 ? "23:59" : minuteInput(draft.closeMinute)} onChange={(event) => change({ ...draft, closeMinute: inputMinute(event.target.value) })} /><label className={styles.checkbox}><input type="checkbox" checked={draft.closeMinute === 1440} onChange={(event) => change({ ...draft, closeMinute: event.target.checked ? 1440 : 22 * 60 })} />Close at midnight</label></div>
        </div>
        <fieldset className={styles.days}><legend>Open days</legend><div>{facilityWeekdays.map((day, index) => <label key={day} className={styles.checkbox}><input type="checkbox" checked={draft.openDays.includes(index)} onChange={(event) => change({ ...draft, openDays: event.target.checked ? [...draft.openDays, index].sort() : draft.openDays.filter((value) => value !== index) })} />{day}</label>)}</div></fieldset>
        <div className={styles.formColumns}>{numericRules.map((field) => <label className={styles.field} key={field.key}><span>{field.label}</span><CovieInput type="number" required min={field.min} max={field.max} step={1} value={Number.isNaN(draft[field.key]) ? "" : draft[field.key]} onChange={(event) => change({ ...draft, [field.key]: event.target.value === "" ? NaN : Number(event.target.value) })} /></label>)}</div>
        <label className={styles.checkbox}><input type="checkbox" checked={draft.requireApproval} onChange={(event) => change({ ...draft, requireApproval: event.target.checked })} />Require organiser approval for member bookings</label>
        <p className={styles.help}>Pending requests do not hold the slot. Approval checks availability again.</p>
        <label className={styles.checkbox}><input type="checkbox" checked={draft.shareTitles} onChange={(event) => change({ ...draft, shareTitles: event.target.checked })} />Share booking titles with calendar members</label>
        <p className={styles.help}>When off, other members see occupied times only. Notes remain visible only to the booking owner and people managing that resource.</p>
      </fieldset>
      <div className={styles.actions}><CovieButton type="submit" disabled={busy}>{busy ? "Saving…" : "Save booking rules"}</CovieButton><CovieButton tone="neutral" disabled={busy} onClick={() => { setDraft(rules); setValidation(""); setSaved(false); }}>Reset changes</CovieButton></div>
    </form>
  );
}
