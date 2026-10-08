"use client";

import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import {
  archiveCalendar,
  deleteCalendar,
  restoreCalendar,
  type CalendarLifecycleState,
} from "@/app/calendar/actions";
import {
  CovieButton,
  CovieConfirmDialog,
  CovieDialog,
  CovieInput,
  CovieNotice,
} from "@/components/ui/covie";
import {
  calendarTemplateManifests,
  type CalendarTemplateId,
} from "@/lib/templates/calendar-templates";

type CalendarLifecycleOption = {
  id: string;
  name: string;
  calendarType: CalendarTemplateId;
  permission: "owner" | "editor" | "viewer";
};

const initialState: CalendarLifecycleState = { error: null };

export function CalendarLifecycleControls({
  current,
  archivedCalendars,
}: {
  current: CalendarLifecycleOption;
  archivedCalendars: CalendarLifecycleOption[];
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const archiveFormRef = useRef<HTMLFormElement>(null);

  const [archiveState, archiveAction, archiving] = useActionState(
    archiveCalendar,
    initialState,
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteCalendar,
    initialState,
  );

  if (current.permission !== "owner" && archivedCalendars.length === 0) {
    return null;
  }

  return (
    <>
      {current.permission === "owner" ? (
        <details name="calendar-management" className="group/lifecycle mt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700 hover:bg-[#F7EFE5] [&::-webkit-details-marker]:hidden">
            <Archive className="h-4 w-4 text-[#A23F39]" aria-hidden="true" />
            Calendar options
          </summary>
          <div className="mt-2 grid gap-2 rounded-xl bg-white p-3">
            <CovieButton
              tone="neutral"
              className="w-full justify-start"
              onClick={() => setArchiveOpen(true)}
            >
              <Archive className="h-4 w-4" aria-hidden="true" />
              Archive calendar
            </CovieButton>
            {current.calendarType === "timesheets" ? <p className="px-3 text-sm text-slate-600">Timesheets keep audited work history. Archive this calendar when you no longer need it.</p> : <CovieButton
              tone="danger"
              className="w-full justify-start"
              onClick={() => {
                setDeleteName("");
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete permanently
            </CovieButton>}
          </div>
        </details>
      ) : null}

      {archivedCalendars.length > 0 ? (
        <details name="calendar-management" className="group/archived mt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700 hover:bg-[#F7EFE5] [&::-webkit-details-marker]:hidden">
            <Archive className="h-4 w-4 text-[#66747A]" aria-hidden="true" />
            Archived calendars
            <span className="ml-auto text-xs text-[#66747A]">
              {archivedCalendars.length}
            </span>
          </summary>
          <div className="mt-2 space-y-1 rounded-xl bg-white p-2">
            {archivedCalendars.map((calendar) => (
              <form
                action={restoreCalendar}
                key={calendar.id}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-2"
              >
                <input type="hidden" name="calendarId" value={calendar.id} />
                <span className="min-w-0">
                  <strong className="block truncate text-sm text-[#243139]">
                    {calendar.name}
                  </strong>
                  <span className="block truncate text-xs text-[#66747A]">
                    {calendarTemplateManifests[calendar.calendarType].name}
                  </span>
                </span>
                <CovieButton tone="neutral" type="submit">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Restore
                </CovieButton>
              </form>
            ))}
          </div>
        </details>
      ) : null}

      <form ref={archiveFormRef} action={archiveAction} className="hidden">
        <input type="hidden" name="calendarId" value={current.id} />
      </form>

      <CovieConfirmDialog
        open={archiveOpen}
        id="archive-calendar-title"
        title="Archive this calendar?"
        description={
          <>
            <span>
              {current.name} will disappear from normal calendar navigation until
              you restore it.
            </span>
            {archiveState.error ? (
              <CovieNotice tone="danger" className="mt-3">
                {archiveState.error}
              </CovieNotice>
            ) : null}
          </>
        }
        confirmLabel="Archive calendar"
        busy={archiving}
        icon={<Archive aria-hidden="true" />}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={() => archiveFormRef.current?.requestSubmit()}
      />

      {deleteOpen ? (
        <CovieDialog
          id="delete-calendar-title"
          title="Delete calendar permanently"
          description="This removes the calendar and its stored data. This cannot be undone."
          icon={<Trash2 aria-hidden="true" />}
          iconTone="coral"
          size="sm"
          busy={deleting}
          onClose={() => setDeleteOpen(false)}
          footer={
            <>
              <CovieButton
                tone="neutral"
                disabled={deleting}
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </CovieButton>
              <CovieButton
                type="submit"
                form="delete-calendar-form"
                tone="danger"
                disabled={deleting || deleteName !== current.name}
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </CovieButton>
            </>
          }
        >
          <form id="delete-calendar-form" action={deleteAction}>
            <input type="hidden" name="calendarId" value={current.id} />
            <p className="text-sm leading-6 text-[#526168]">
              Type <strong className="text-[#243139]">{current.name}</strong> to
              confirm.
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-bold">
                Calendar name
              </span>
              <CovieInput
                name="calendarName"
                value={deleteName}
                autoComplete="off"
                disabled={deleting}
                onChange={(event) => setDeleteName(event.target.value)}
              />
            </label>
            {deleteState.error ? (
              <CovieNotice tone="danger" className="mt-3">
                {deleteState.error}
              </CovieNotice>
            ) : null}
          </form>
        </CovieDialog>
      ) : null}
    </>
  );
}
