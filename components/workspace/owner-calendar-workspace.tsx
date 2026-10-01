"use client";

import type { ReactNode } from "react";
import styles from "./owner-calendar-workspace.module.css";

/** A bounded desktop canvas; narrow windows and zoom keep normal document flow. */
export function OwnerCalendarWorkspace({ toolbar, navigation, calendar, day, children }: {
  toolbar: ReactNode;
  navigation: ReactNode;
  calendar: ReactNode;
  day: ReactNode;
  children?: ReactNode;
}) {
  return <div className={styles.workspace} data-owner-workspace>
    <div className={styles.toolbar}>{toolbar}</div>
    <div className={styles.navigation}>{navigation}</div>
    {children}
    <div className={styles.canvas}>
      <div className={styles.calendar}>{calendar}</div>
      <aside className={styles.day} aria-label="Selected day workspace" tabIndex={0}>{day}</aside>
    </div>
  </div>;
}
