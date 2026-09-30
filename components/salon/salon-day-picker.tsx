"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { CovieButton, CovieIconButton } from "@/components/ui/covie";
import {
  salonDateLabel,
  salonDays,
  salonToday,
  shiftSalonDate,
  shiftSalonMonth,
} from "./salon-ui";
import styles from "./salon.module.css";
export function SalonDayPicker({
  date,
  timezone,
  disabled = false,
  onChange,
}: {
  date: string;
  timezone: string;
  disabled?: boolean;
  onChange: (date: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    focus = useRef(false);
  useEffect(() => {
    if (focus.current) {
      ref.current
        ?.querySelector<HTMLButtonElement>(`button[data-date="${date}"]`)
        ?.focus();
      focus.current = false;
    }
  }, [date]);
  return (
    <div className={styles.datePicker}>
      <div className={styles.monthBar}>
        <CovieIconButton
          aria-label="Previous month"
          disabled={disabled}
          onClick={() => onChange(shiftSalonMonth(date, -1))}
        >
          <ChevronLeft size={18} />
        </CovieIconButton>
        <h2>{salonDateLabel(date, true)}</h2>
        <CovieIconButton
          aria-label="Next month"
          disabled={disabled}
          onClick={() => onChange(shiftSalonMonth(date, 1))}
        >
          <ChevronRight size={18} />
        </CovieIconButton>
      </div>
      <div
        ref={ref}
        className={styles.dayGrid}
        role="group"
        aria-label="Choose appointment day"
      >
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <span key={day} aria-hidden="true">
            {day}
          </span>
        ))}
        {salonDays(date).map((day) => (
          <button
            type="button"
            key={day}
            data-date={day}
            data-outside={!day.startsWith(date.slice(0, 7))}
            aria-label={salonDateLabel(day)}
            aria-pressed={day === date}
            tabIndex={day === date ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(day)}
            onKeyDown={(event) => {
              const amount = {
                ArrowLeft: -1,
                ArrowRight: 1,
                ArrowUp: -7,
                ArrowDown: 7,
              }[event.key];
              if (amount !== undefined) {
                event.preventDefault();
                focus.current = true;
                onChange(shiftSalonDate(day, amount));
              }
            }}
          >
            {Number(day.slice(-2))}
          </button>
        ))}
      </div>
      <CovieButton
        tone="neutral"
        disabled={disabled}
        onClick={() => onChange(salonToday(timezone))}
      >
        Today
      </CovieButton>
      <p className={styles.help}>Times use {timezone}.</p>
    </div>
  );
}
