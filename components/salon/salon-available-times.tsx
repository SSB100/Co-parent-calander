"use client";

import { useState } from "react";
import { CovieSegmentedControl } from "@/components/ui/covie";
import type { SalonSlot } from "@/lib/salon/contracts";
import { salonTime } from "./salon-ui";
import styles from "./salon.module.css";

const periods = ["Morning", "Afternoon", "Evening"] as const;

/** Groups exact server-provided candidates; never rounds or invents a time. */
export function SalonAvailableTimes({ slots, timezone, practitioners, disabled, onChoose }: {
  slots: SalonSlot[];
  timezone: string;
  practitioners?: { id: string; displayName: string }[];
  disabled: boolean;
  onChoose: (slot: SalonSlot) => void;
}) {
  const [period, setPeriod] = useState("All times");
  const formatter = new Intl.DateTimeFormat("en", { timeZone: timezone, hour: "numeric", hourCycle: "h23" });
  const groups = periods.map(label => ({ label, slots: slots.filter(slot => {
    const hour = Number(formatter.format(new Date(slot.start)));
    return label === "Morning" ? hour < 12 : label === "Afternoon" ? hour >= 12 && hour < 17 : hour >= 17;
  }) })).filter(group => group.slots.length);
  const selected = groups.some(group => group.label === period) ? period : "All times";
  return <div className={styles.availableTimes}>
    {groups.length > 1 ? <CovieSegmentedControl ariaLabel="Appointment time of day" value={selected} onChange={setPeriod} options={[{ value: "All times", label: "All times" }, ...groups.map(group => ({ value: group.label, label: group.label }))]} /> : null}
    <div className={styles.timeGroups}>
      {groups.filter(group => selected === "All times" || group.label === selected).map(group => <section key={group.label} aria-label={`${group.label} appointments`} className={styles.timeGroup}>
        <h3 className={styles.sectionTitle}>{group.label}<span className={styles.help}> · {group.slots.length} available</span></h3>
        <div className={styles.slots}>{group.slots.map(slot => {
          const name = practitioners?.find(person => person.id === slot.practitionerId)?.displayName;
          return <button key={`${slot.practitionerId}:${slot.start}`} type="button" className={styles.slot} disabled={disabled} onClick={() => onChoose(slot)} aria-label={`${salonTime(slot.start, timezone)} to ${salonTime(slot.end, timezone)}${name ? ` with ${name}` : ""}. Review appointment.`}>
            <strong>{salonTime(slot.start, timezone)}</strong>
            {name ? <span>{name}</span> : null}
            <small>to {salonTime(slot.end, timezone)}</small>
          </button>;
        })}</div>
      </section>)}
    </div>
  </div>;
}
