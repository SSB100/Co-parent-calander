"use client";

import { useEffect, useRef } from "react";
import type { SocialEvent } from "@/lib/social-groups/contracts";
import { shiftSocialDate, socialDateLabel } from "./social-ui";
import styles from "./social-groups.module.css";

export function SocialMonthCalendar({ month, days, eventsByDay, selectedDate, today, disabled, onSelectDate, fitWorkspace = false }: { month: string; days: string[]; eventsByDay: Map<string, SocialEvent[]>; selectedDate: string; today: string; disabled: boolean; onSelectDate: (date: string) => void; fitWorkspace?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);
  useEffect(() => {
    if (pendingFocus.current && !disabled) {
      const button = root.current?.querySelector<HTMLButtonElement>(`button[data-date="${selectedDate}"]`);
      if (button) { button.focus(); pendingFocus.current = false; }
    }
  }, [selectedDate, month, days, disabled]);
  return <div className={`${styles.monthBoard}${fitWorkspace ? ` ${styles.monthBoardFit}` : ""}`} ref={root}>
    <div className={styles.weekdays} aria-hidden="true">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className={styles.monthDays} style={fitWorkspace ? { gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` } : undefined} role="group" aria-label="Choose a calendar day">
      {days.map((date) => {
        const inMonth = date.startsWith(month);
        const events = inMonth ? eventsByDay.get(date) ?? [] : [];
        return <button key={date} type="button" data-date={date} data-in-month={inMonth} data-has-events={events.length > 0} aria-current={date === today ? "date" : undefined} aria-pressed={date === selectedDate} tabIndex={date === selectedDate ? 0 : -1} disabled={disabled} aria-label={inMonth ? `${socialDateLabel(date, true)}, ${events.length} ${events.length === 1 ? "event" : "events"}` : `View ${socialDateLabel(date, true)}`} onClick={() => onSelectDate(date)} onKeyDown={(event) => {
          const direction = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
          if (direction !== undefined) { event.preventDefault(); pendingFocus.current = true; onSelectDate(shiftSocialDate(date, direction)); }
        }}>
          <span className={styles.dayNumber}>{Number(date.slice(-2))}</span>
          {events.length ? <><span className={styles.dayCount}>{events.length}<span className="sr-only"> events</span></span><span className={styles.dayTitles}>{events.slice(0, 2).map((event) => <span key={event.id} data-cancelled={event.cancelled}>{event.title}</span>)}{events.length > 2 ? <span>+{events.length - 2} more</span> : null}</span></> : null}
        </button>;
      })}
    </div>
  </div>;
}

