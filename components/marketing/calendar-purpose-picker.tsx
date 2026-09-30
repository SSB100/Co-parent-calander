"use client";

import { Building2, CalendarDays, Check, Clock3, UsersRound } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { CovieMark } from "@/components/workspace/covie-brand";
import { calendarPurposes, type CalendarPurpose } from "./calendar-purpose-content";
import styles from "./ecosystem-home.module.css";

const purposeIcons = {
  staff_rosters: Clock3,
  shared_facilities: Building2,
  social_groups: UsersRound,
  co_parenting: CalendarDays,
} satisfies Record<CalendarPurpose["id"], typeof CalendarDays>;

export function CalendarPurposePicker() {
  const [selectedId, setSelectedId] = useState<CalendarPurpose["id"]>("staff_rosters");
  const selected = calendarPurposes.find((purpose) => purpose.id === selectedId) ?? calendarPurposes[0];
  const colors = {
    "--purpose-primary": selected.primary,
    "--purpose-secondary": selected.secondary,
    "--purpose-primary-text": selected.primaryText,
  } as CSSProperties;

  return (
    <div className={styles.picker}>
      <div className={styles.purposeChoices} role="group" aria-label="Explore calendar types">
        {calendarPurposes.map((purpose) => {
          const Icon = purposeIcons[purpose.id];
          return (
            <button
              key={purpose.id}
              type="button"
              className={styles.purposeChoice}
              aria-pressed={selectedId === purpose.id}
              aria-controls="calendar-purpose-detail"
              onClick={() => setSelectedId(purpose.id)}
            >
              <span className={styles.purposeChoiceIcon} style={{ backgroundColor: purpose.primary, color: purpose.primaryText }}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <span>{purpose.name}</span>
              <span className={styles.choiceIndicator} aria-hidden="true">{selectedId === purpose.id ? "Selected" : "Explore"}</span>
            </button>
          );
        })}
      </div>
      <div id="calendar-purpose-detail" className={styles.purposeDetail} style={colors} aria-live="polite" aria-atomic="true">
        <div className={styles.purposeCopy}>
          <p className={styles.eyebrow}>{selected.audience}</p>
          <h3 className={styles.purposeTitle}>{selected.question}</h3>
          <p className={styles.bodyCopy}>{selected.description}</p>
          {selected.availabilityNote ? <p className={styles.setupNote}>{selected.availabilityNote}</p> : null}
          <ul className={styles.useList}>
            {selected.uses.map((use) => <li key={use}><Check size={17} aria-hidden="true" /><span>{use}</span></li>)}
          </ul>
          <p className={styles.setupNote}>Choose your calendar type after creating an account.</p>
        </div>
        <figure className={styles.purposeExample}>
          <div className={styles.examplePaper}>
            <div className={styles.exampleHeader}>
              <div><span className={styles.exampleLabel}>{selected.name}</span><h4>{selected.exampleName}</h4></div>
              <CovieMark size={30} primary={selected.primary} secondary={selected.secondary} />
            </div>
            <div className={styles.exampleWeek}><span>A week together</span><span>October 12–18</span></div>
            <ol className={styles.exampleEntries}>
              {selected.exampleEntries.map((entry) => (
                <li key={entry.date}>
                  <div className={styles.exampleDate}><span>{entry.day}</span><strong>{entry.date}</strong></div>
                  <div className={styles.exampleEntry} style={{ borderLeftColor: entry.accent === "primary" ? selected.primary : selected.secondary }}>
                    <strong>{entry.title}</strong><span>{entry.detail}</span>
                  </div>
                </li>
              ))}
            </ol>
            <div className={styles.exampleFooter}><UsersRound size={15} aria-hidden="true" /><span>A shared plan for your people</span></div>
          </div>
          <figcaption>Illustrative plan with example people and events</figcaption>
        </figure>
      </div>
    </div>
  );
}
