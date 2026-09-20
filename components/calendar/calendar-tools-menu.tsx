"use client";

import { ActivityPanel } from "@/components/calendar/activity-panel";
import { RangeAssignmentPanel } from "@/components/calendar/range-assignment-panel";
import { RecurringSchedulePanel } from "@/components/calendar/recurring-schedule-panel";

export function CalendarToolsMenu({
  onChanged,
}: {
  onChanged: () => void;
}) {
  return (
    <>
      <RangeAssignmentPanel onChanged={onChanged} />
      <RecurringSchedulePanel onChanged={onChanged} />
      <ActivityPanel />
    </>
  );
}
