"use client";

import { MembersPanel } from "@/components/calendar/members-panel";
import { SettingsPanel } from "@/components/calendar/settings-panel";

export function CalendarSettingsMenu({
  showMembers,
  readOnly,
  onChanged,
}: {
  showMembers: boolean;
  readOnly: boolean;
  onChanged: () => void;
}) {
  return (
    <>
      {showMembers ? <MembersPanel onChanged={onChanged} /> : null}
      <SettingsPanel readOnly={readOnly} onChanged={onChanged} />
    </>
  );
}
