"use client";

import type { ReactNode } from "react";
import { CovieButton } from "@/components/ui/covie";
import styles from "./owner-setup-readiness.module.css";

export type OwnerSetupStep = { id: string; label: string; detail: string; complete?: boolean };
/** Snapshot facts only. Review steps never imply a saved review or publication. */
export function OwnerSetupReadiness({ title, summary, steps, actionLabel, onAction, action, disabled = false, children }: {
  summary?: string;
  title: string; steps: OwnerSetupStep[]; actionLabel?: string; onAction?: () => void;
  action?: ReactNode; disabled?: boolean; children?: ReactNode;
}) {
  return <section className={styles.readiness} aria-label={title}>
    <div className={styles.heading}><div><h2>{title}</h2><p>{summary ?? `${steps.filter(step => step.complete).length} of ${steps.length} setup checks confirmed. Review the remaining steps before sharing.`}</p></div>
      {action ?? (actionLabel && onAction ? <CovieButton tone="neutral" disabled={disabled} onClick={onAction}>{actionLabel}</CovieButton> : null)}
    </div>
    <details><summary>Setup and sharing checklist</summary><ol>{steps.map(step => <li key={step.id}><strong>{step.label}</strong><p><span className={styles.state}>{step.complete ? "Confirmed" : "Review"}</span> · {step.detail}</p></li>)}</ol>{children}</details>
  </section>;
}
