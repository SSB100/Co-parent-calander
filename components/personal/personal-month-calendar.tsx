"use client";

import { useEffect, useRef } from "react";
import type { PersonalItem } from "@/lib/personal/contracts";
import { isPersonalMonth, personalDateLabel, shiftPersonalDate } from "./personal-ui";
import styles from "./personal.module.css";

export function PersonalMonthCalendar({ month, days, itemsByDay, selectedDate, today, onSelectDate }: { month: string; days: string[]; itemsByDay: Map<string, PersonalItem[]>; selectedDate: string; today: string; onSelectDate: (date: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const button = root.current?.querySelector<HTMLButtonElement>(`button[data-date="${selectedDate}"]`);
    if (button) { button.focus(); pendingFocus.current = false; }
  }, [selectedDate, month]);

  return <div className={styles.monthBoard} ref={root}>
    <div className={styles.weekdays} aria-hidden="true">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className={styles.monthDays} role="group" aria-label="Choose a day. Use arrow keys to move by day or week.">
      {days.map((date) => {
        const inMonth = date.startsWith(month);
        const items = inMonth ? itemsByDay.get(date) ?? [] : [];
        const confirmed = items.filter((item) => item.state === "confirmed").length;
        const tentative = items.filter((item) => item.state === "tentative").length;
        const care = items.filter((item) => item.state === "background").length;
        return <button key={date} type="button" data-date={date} data-in-month={inMonth} data-state={confirmed ? "confirmed" : tentative ? "tentative" : care ? "background" : "empty"} disabled={!isPersonalMonth(date.slice(0, 7))} aria-current={date === today ? "date" : undefined} aria-pressed={date === selectedDate} tabIndex={date === selectedDate ? 0 : -1} aria-label={`${personalDateLabel(date, true)}${inMonth ? `, ${confirmed} confirmed, ${tentative} tentative, ${care} care` : ", view month"}`} onClick={() => onSelectDate(date)} onKeyDown={(event) => {
          let direction = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
          if (event.key === "Home") direction = -(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
          if (event.key === "End") direction = 6 - (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
          if (direction !== undefined) { event.preventDefault(); pendingFocus.current = true; onSelectDate(shiftPersonalDate(date, direction)); }
        }}>
          <span className={styles.dayNumber}>{Number(date.slice(-2))}</span>
          <span className={styles.dayMarkers} aria-hidden="true">{confirmed ? <span data-state="confirmed">{confirmed}</span> : null}{tentative ? <span data-state="tentative">{tentative}</span> : null}{care ? <span data-state="background">{care}</span> : null}</span>
          <span className={styles.dayTitles} aria-hidden="true">{items.slice(0, 2).map((item) => <span key={item.id} data-state={item.state}>{item.title}</span>)}{items.length > 2 ? <span>+{items.length - 2} more</span> : null}</span>
        </button>;
      })}
    </div>
  </div>;
}

