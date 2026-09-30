"use client";

import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { CovieButton, CovieDialog, CovieInput, CovieNotice, CovieTextarea } from "@/components/ui/covie";
import type { FacilityData } from "@/lib/shared-facilities/contracts";
import { canEditFacilityResource, facilityTime } from "./facilities-ui";
import { createFacilitySlotSubmission, facilityDateLabel, type FacilitySlot } from "./facility-slots";
import { FacilityRulesSummary, type FacilitySave } from "./facility-dialogs";
import styles from "./facilities.module.css";

export function FacilitySlotConfirmation({ data, slot, busy, blocked, error, onSave, onClose, onRefresh }: { data: FacilityData; slot: FacilitySlot; busy: boolean; blocked: boolean; error: string; onSave: FacilitySave; onClose: () => void; onRefresh: () => void }) {
  const [submission] = useState(() => createFacilitySlotSubmission(crypto.randomUUID()));
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const resource = data.resources.find((item) => item.id === slot.resourceId);
  const approval = data.rules.requireApproval && !canEditFacilityResource(data, slot.resourceId);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || blocked) return;
    const saved = await submission.run((requestId) => onSave("booking", { resourceId: slot.resourceId, start: slot.start, end: slot.end, title, notes, requestId }));
    if (saved) onClose();
  }
  return <CovieDialog id="facility-slot-confirmation" title={approval ? "Request this time?" : "Confirm your booking"} description={`Times use ${data.timezone}.`} icon={<CalendarDays aria-hidden="true" />} iconTone="violet" busy={busy} onClose={onClose} footer={<><CovieButton tone="neutral" disabled={busy} onClick={onClose}>Choose another time</CovieButton><CovieButton type="submit" form="facility-slot-form" disabled={busy || blocked}>{busy ? "Saving…" : approval ? "Request booking" : "Confirm booking"}</CovieButton></>}>
    <form id="facility-slot-form" className={styles.form} onSubmit={submit}>
      <div className={styles.slotSummary}><strong>{resource?.name ?? "Resource"}</strong><p>{facilityDateLabel(slot.date)}</p><p>{facilityTime(slot.startInstant, data.timezone)} to {facilityTime(slot.endInstant, data.timezone)} · {slot.duration} minutes</p><span>{data.timezone}</span></div>
      {error || blocked ? <CovieNotice tone="danger">{error || "The schedule is refreshing. Wait before confirming."}<div className={styles.actions}><CovieButton tone="neutral" disabled={busy} onClick={onRefresh}>Refresh times</CovieButton></div></CovieNotice> : null}
      <p className={styles.help}>{approval ? "An organiser will review this request. The time is not reserved until approved." : "The resource will be reserved if this time is still available when you confirm."} Cancel at least {data.rules.cancellationHours} hours before the start.</p>
      <details className={styles.optionalDetails}><summary>Add a title or notes <span>(optional)</span></summary><fieldset className={styles.form} disabled={busy}><label className={styles.field}><span>Booking title</span><CovieInput value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label><label className={styles.field}><span>Notes</span><CovieTextarea rows={2} value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} /></label></fieldset></details>
      <FacilityRulesSummary rules={data.rules} timezone={data.timezone} />
    </form>
  </CovieDialog>;
}
