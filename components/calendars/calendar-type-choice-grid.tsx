"use client";

import { calendarGuides } from "@/lib/onboarding/calendar-guides";

import {
  calendarTemplateManifests,
  type CalendarTemplateId,
} from "@/lib/templates/calendar-templates";

const softBackgroundByType: Record<CalendarTemplateId, string> = {
  co_parenting: "#FFD0CB",
  staff_rosters: "#BFEDE6",
  shared_facilities: "#DDD3FA",
  social_groups: "#FBECE8",
  salon_bookings: "#BFEDE6",
  timesheets: "#FAEDB9",
};

export function CalendarTypeChoiceGrid({
  selected,
  onSelect,
  compact = false,
  showExamples = false,
}: {
  selected: CalendarTemplateId | null;
  onSelect: (value: CalendarTemplateId) => void;
  compact?: boolean;
  showExamples?: boolean;
}) {
  return (
    <div className={compact ? "grid gap-2" : "grid gap-3 sm:grid-cols-2"}>
      {(["staff_rosters", "timesheets", "salon_bookings", "shared_facilities", "social_groups", "co_parenting"] as const).map((id) => {
        const template = calendarTemplateManifests[id];
        const active = selected === id;

        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(id)}
            className={`min-h-11 rounded-xl border-2 p-3 text-left transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#765ED6] ${
              active
                ? "border-[#243139] shadow-[3px_3px_0_#F4C64E]"
                : "border-[#E6DBCF]"
            }`}
            style={{ background: softBackgroundByType[id] }}
          >
            <span className="block text-sm font-extrabold text-[#243139]">
              {template.name}
            </span>
            <span className="mt-1 block text-xs leading-5 text-[#526168]">
              {template.coreQuestion}
            </span>
            {showExamples ? <span className="mt-2 block text-xs leading-5 text-[#526168]">{calendarGuides[id].example}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
