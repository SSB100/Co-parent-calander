"use client";

import { useEffect, useState } from "react";
import { CovieNotice } from "@/components/ui/covie";
import type { TimesheetsData, TimesheetsEntry } from "@/lib/timesheets/contracts";
import { timesheetsLocalTime } from "@/lib/timesheets/model";
import styles from "./timesheets.module.css";

type HistoryRecord = { id: string; action: string; reason: string | null; createdAt: string; ownActor: boolean; actorName?: string; before: TimesheetsEntry | null; after: TimesheetsEntry | null };
export function TimesheetsHistory({ data, entryId, onUnavailable }: { data: TimesheetsData; entryId: string; onUnavailable: () => void }) {
  const calendarId = data.calendarId, timezone = data.organisation.timezone;
  const [history, setHistory] = useState<HistoryRecord[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/timesheets?${new URLSearchParams({ entryId })}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal, headers: { "x-covie-calendar-id": calendarId } });
        const body = await response.json().catch(() => null);
        if (!current || controller.signal.aborted) return;
        if (!response.ok || body?.calendarId !== calendarId || !Array.isArray(body?.history)) { onUnavailable(); return; }
        setHistory(body.history);
      } catch {
        if (current && !controller.signal.aborted) setError("Change history could not be loaded. Close and reopen it to try again.");
      }
    };
    void load();
    return () => { current = false; controller.abort(); };
  }, [calendarId, entryId, onUnavailable]);
  return <section className={styles.stack} aria-label="Work block change history">
    {error ? <CovieNotice tone="danger" role="alert">{error}</CovieNotice> : history === null ? <p className={styles.muted} role="status">Loading change history…</p> : history.length ? <ol className={styles.stack}>{history.map(record => <li key={record.id} className={styles.card}>
      <strong className={styles.cardTitle}>{record.action === "create" ? "Created" : record.action === "delete" ? "Deleted" : "Updated"}{record.ownActor ? " by you" : record.actorName ? ` by ${record.actorName}` : " by an authorised team member"}</strong>
      <p className={styles.muted}>{timesheetsLocalTime(record.createdAt, timezone).replace("T", " ")} · {timezone}</p>
      {record.reason ? <p className={styles.muted}>Reason: {record.reason}</p> : null}
      <details><summary className={styles.muted}>Compare before and after</summary><div className={styles.formGrid}><HistorySnapshot label="Before" entry={record.before} data={data} /><HistorySnapshot label="After" entry={record.after} data={data} /></div></details>
      <p className={styles.muted}>{record.before ? `Previously ${record.before.durationMinutes} minutes${record.before.billable ? ", billable" : ", non-billable"}. ` : ""}{record.after ? `Saved ${record.after.durationMinutes} minutes${record.after.billable ? ", billable" : ", non-billable"}.` : "Work block removed."}</p>
    </li>)}</ol> : <p className={styles.muted}>No change history is available for this work block.</p>}
  </section>;
}

function HistorySnapshot({ label, entry, data }: { label: string; entry: TimesheetsEntry | null; data: TimesheetsData }) {
  return <section className={styles.card} aria-label={`${label} change`}><h3 className={styles.cardTitle}>{label}</h3>{entry ? <dl className={styles.stack}>
    <div><dt className={styles.cardTitle}>Time</dt><dd className={styles.muted}>{timesheetsLocalTime(entry.start, entry.timezone).replace("T", " ")} to {timesheetsLocalTime(entry.end, entry.timezone).replace("T", " ")}<br />{entry.timezone} · {entry.durationMinutes} minutes · {entry.incrementMinutes}-minute increment</dd></div>
    <div><dt className={styles.cardTitle}>Client</dt><dd className={styles.muted}>{entry.clientId ? data.clients.find(client => client.id === entry.clientId)?.name ?? "Client no longer available" : "No client"}</dd></div>
    <div><dt className={styles.cardTitle}>Project</dt><dd className={styles.muted}>{entry.projectId ? data.projects.find(project => project.id === entry.projectId)?.name ?? "Project no longer available" : "No project"}</dd></div>
    <div><dt className={styles.cardTitle}>Work type</dt><dd className={styles.muted}>{entry.workTypeName ?? "No work type"}</dd></div>
    <div><dt className={styles.cardTitle}>Billing</dt><dd className={styles.muted}>{entry.billable ? "Billable" : "Non-billable"}</dd></div>
    <div><dt className={styles.cardTitle}>Work notes</dt><dd className={`${styles.muted} ${styles.historyNote}`}>{entry.notes || "No work notes"}</dd></div>
  </dl> : <p className={styles.muted}>{label === "Before" ? "No earlier work block." : "Work block removed."}</p>}</section>;
}
