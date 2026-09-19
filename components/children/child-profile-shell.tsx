"use client";

import {
  Activity,
  CalendarDays,
  ChevronLeft,
  HeartPulse,
  History,
  LoaderCircle,
  Pencil,
  Plus,
  ReceiptText,
  Ruler,
  School,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { AttachmentPanel } from "@/components/attachments/attachment-panel";
import { ProfilePhoto } from "@/components/attachments/profile-photo";
import { LinkedItemsPanel } from "@/components/links/linked-items-panel";
import { useCallback, useEffect, useMemo, useState } from "react";

type ChildProfile = {
  id: string;
  displayName: string;
  fullName: string | null;
  dateOfBirth: string | null;
  schoolName: string | null;
  yearClass: string | null;
  teacherName: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  studentId: string | null;
  careDetails: string | null;
  schoolNotes: string | null;
  gpName: string | null;
  dentistName: string | null;
  allergies: string | null;
  medications: string | null;
  medicalNotes: string | null;
  nhiNumber: string | null;
  clothingSize: string | null;
  shoeSize: string | null;
  uniformSize: string | null;
  practicalNotes: string | null;
  updatedAt: string;
};

type ChildActivity = {
  id: string;
  activityName: string;
  organisation: string | null;
  contactName: string | null;
  contactDetails: string | null;
  location: string | null;
  scheduleInfo: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type RelatedResponsibility = {
  id: string;
  title: string;
  responsibleParticipantId: string;
  dueDate: string;
  dueTime: string | null;
  category: string;
  completedAt: string | null;
  status: "upcoming" | "due_soon" | "due_today" | "overdue" | "completed";
};

type RelatedExpense = {
  id: string;
  title: string;
  expenseDate: string;
  amountCents: number;
  category: string;
  settlementStatus: "not_needed" | "outstanding" | "settled";
};

type HistoryItem = {
  id: string;
  action: string;
  summary: string;
  occurredAt: string;
  actorName: string | null;
};

type Payload = {
  permission: "owner" | "editor" | "viewer";
  currentParticipantId: string | null;
  child: ChildProfile;
  activities: ChildActivity[];
  responsibilities: RelatedResponsibility[];
  expenses: RelatedExpense[];
  history: HistoryItem[];
};

type ProfileForm = Omit<ChildProfile, "id" | "updatedAt">;
type ActivityForm = Omit<ChildActivity, "id" | "createdAt" | "updatedAt"> & {
  id: string | null;
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function when(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function profileFormFromChild(child: ChildProfile): ProfileForm {
  return {
    displayName: child.displayName,
    fullName: child.fullName,
    dateOfBirth: child.dateOfBirth,
    schoolName: child.schoolName,
    yearClass: child.yearClass,
    teacherName: child.teacherName,
    schoolPhone: child.schoolPhone,
    schoolEmail: child.schoolEmail,
    studentId: child.studentId,
    careDetails: child.careDetails,
    schoolNotes: child.schoolNotes,
    gpName: child.gpName,
    dentistName: child.dentistName,
    allergies: child.allergies,
    medications: child.medications,
    medicalNotes: child.medicalNotes,
    nhiNumber: child.nhiNumber,
    clothingSize: child.clothingSize,
    shoeSize: child.shoeSize,
    uniformSize: child.uniformSize,
    practicalNotes: child.practicalNotes,
  };
}

function blankActivity(): ActivityForm {
  return {
    id: null,
    activityName: "",
    organisation: null,
    contactName: null,
    contactDetails: null,
    location: null,
    scheduleInfo: null,
    notes: null,
  };
}

function activityFormFromRow(activity: ChildActivity): ActivityForm {
  return {
    id: activity.id,
    activityName: activity.activityName,
    organisation: activity.organisation,
    contactName: activity.contactName,
    contactDetails: activity.contactDetails,
    location: activity.location,
    scheduleInfo: activity.scheduleInfo,
    notes: activity.notes,
  };
}

function Value({
  label,
  value,
  sensitive = false,
}: {
  label: string;
  value: string | null;
  sensitive?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
        {sensitive ? " · optional" : ""}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-700">
        {value || "Not added"}
      </p>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  type?: "text" | "email" | "date";
  placeholder?: string;
}) {
  return (
    <label>
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value || null)}
        className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      <textarea
        rows={3}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value || null)}
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

export function ChildProfileShell({ childId }: { childId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityForm, setActivityForm] = useState<ActivityForm>(blankActivity);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/children/${childId}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as Payload | { error?: string } | null;
    if (!response.ok || !body || !("child" in body)) {
      throw new Error(
        body && "error" in body && body.error
          ? body.error
          : "The child profile could not be loaded.",
      );
    }
    setData(body);
    setError(null);
  }, [childId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/children/${childId}`, { cache: "no-store" })
      .then(async (response) => ({
        response,
        body: (await response.json().catch(() => null)) as Payload | { error?: string } | null,
      }))
      .then(({ response, body }) => {
        if (cancelled) return;
        if (!response.ok || !body || !("child" in body)) {
          setError(
            body && "error" in body && body.error
              ? body.error
              : "The child profile could not be loaded.",
          );
          return;
        }
        setData(body);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("The child profile could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  const editable = data?.permission === "owner" || data?.permission === "editor";

  const openResponsibilities = useMemo(
    () => (data?.responsibilities ?? []).filter((item) => item.status !== "completed").slice(0, 6),
    [data?.responsibilities],
  );
  const recentExpenses = useMemo(() => (data?.expenses ?? []).slice(0, 6), [data?.expenses]);

  function openProfileEditor() {
    if (!data?.child || !editable) return;
    setProfileForm(profileFormFromChild(data.child));
    setError(null);
    setProfileOpen(true);
  }

  async function saveProfile() {
    if (!profileForm || busy || !editable) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/children/${childId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; changedFields?: string[] }
        | null;
      if (!response.ok) throw new Error(body?.error ?? "The child profile could not be updated.");
      setProfileOpen(false);
      setMessage(
        body?.changedFields?.length
          ? "Child profile updated."
          : "No profile changes to save.",
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The child profile could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  function openNewActivity() {
    if (!editable) return;
    setActivityForm(blankActivity());
    setError(null);
    setActivityOpen(true);
  }

  function openActivityEditor(activity: ChildActivity) {
    if (!editable) return;
    setActivityForm(activityFormFromRow(activity));
    setError(null);
    setActivityOpen(true);
  }

  async function saveActivity() {
    if (!editable || busy || !activityForm.activityName.trim()) {
      if (!activityForm.activityName.trim()) setError("Add an activity or team name.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { id, ...details } = activityForm;
      const response = await fetch(`/api/children/${childId}/activities`, {
        method: id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(id ? { id, ...details } : details),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "The activity could not be saved.");
      setActivityOpen(false);
      setMessage(id ? "Activity updated." : "Activity added.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The activity could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function removeActivity(activity: ChildActivity) {
    if (!editable || busy) return;
    if (!window.confirm(`Remove “${activity.activityName}” from this child profile?`)) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/children/${childId}/activities`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: activity.id }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "The activity could not be removed.");
      setMessage("Activity removed.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The activity could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  if (!data && !error) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading child profile…
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8">
        <Link href="/kids" className="text-sm font-semibold text-slate-600 hover:underline">
          Back to Kids
        </Link>
        <p role="alert" className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
          {error ?? "The child profile could not be loaded."}
        </p>
      </main>
    );
  }

  const child = data.child;

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <header className="covie-page-header">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <ProfilePhoto childId={child.id} displayName={child.displayName} />
            <div>
              <div className="mb-2 h-2 w-16 rounded-full bg-[#765ED6]" aria-hidden="true" />
              <h1 className="covie-page-title text-3xl sm:text-4xl">{child.displayName}</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {child.schoolName ? (
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600">
                    {child.schoolName}{child.yearClass ? ` · ${child.yearClass}` : ""}
                  </span>
                ) : null}
                {child.dateOfBirth ? (
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600">
                    {dateLabel(child.dateOfBirth)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/kids"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#243139] bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Children
            </Link>
            {editable ? (
              <button
                type="button"
                onClick={openProfileEditor}
                className="covie-primary-action inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit profile
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {message ? (
        <div role="status" className="mt-3 rounded-xl border border-[#19A897] bg-[#EAF8F5] px-4 py-2.5 text-sm text-[#0B665C]">
          {message}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <section className="mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-3">
        <Link
          href="/responsibilities"
          className="rounded-xl border-2 border-[#243139] bg-[#BFEDE6] p-2.5 transition hover:-translate-y-0.5 sm:rounded-2xl sm:p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
            </span>
            <strong className="text-lg text-[#243139] sm:text-2xl">{openResponsibilities.length}</strong>
          </div>
          <h2 className="mt-3 font-bold text-[#243139]">Open responsibilities</h2>
          <p className="mt-1 text-xs text-[#526168]">
            {openResponsibilities[0]?.title ?? "Nothing waiting right now."}
          </p>
        </Link>

        <Link
          href="/expenses"
          className="rounded-xl border-2 border-[#243139] bg-[#F7DC86] p-2.5 transition hover:-translate-y-0.5 sm:rounded-2xl sm:p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white">
              <ReceiptText className="h-4 w-4" aria-hidden="true" />
            </span>
            <strong className="text-lg text-[#243139] sm:text-2xl">{recentExpenses.length}</strong>
          </div>
          <h2 className="mt-3 font-bold text-[#243139]">Recent expenses</h2>
          <p className="mt-1 text-xs text-[#526168]">
            {recentExpenses[0]?.title ?? "No linked expenses yet."}
          </p>
        </Link>

        <button
          type="button"
          onClick={openNewActivity}
          disabled={!editable}
          className="rounded-xl border-2 border-[#243139] bg-[#DDD3FA] p-2.5 text-left transition hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-70 sm:rounded-2xl sm:p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white">
              <Activity className="h-4 w-4" aria-hidden="true" />
            </span>
            <strong className="text-lg text-[#243139] sm:text-2xl">{data.activities.length}</strong>
          </div>
          <h2 className="mt-3 font-bold text-[#243139]">Activities</h2>
          <p className="mt-1 text-xs text-[#526168]">
            {editable ? "Add or update sport, lessons and regular activities." : "View regular activities."}
          </p>
        </button>
      </section>

      <section className="mt-5 grid gap-3 lg:grid-cols-2">
        <details className="group rounded-2xl border border-[#E6DBCF] bg-white">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F4F1FF]">
              <School className="h-4 w-4 text-[#6651B7]" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm text-slate-900">School & care</strong>
              <span className="block truncate text-xs text-slate-500">
                {child.schoolName ?? "No school information added yet"}
              </span>
            </span>
            <Plus className="h-4 w-4 text-slate-400 transition group-open:rotate-45" aria-hidden="true" />
          </summary>
          <div className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2">
            <Value label="School" value={child.schoolName} />
            <Value label="Year / class" value={child.yearClass} />
            <Value label="Teacher" value={child.teacherName} />
            <Value label="School phone" value={child.schoolPhone} />
            <Value label="School email" value={child.schoolEmail} />
            <Value label="Student ID" value={child.studentId} />
            <div className="sm:col-span-2">
              <Value label="Before / after-school care" value={child.careDetails} />
            </div>
            {child.schoolNotes ? (
              <div className="sm:col-span-2">
                <Value label="School notes" value={child.schoolNotes} />
              </div>
            ) : null}
          </div>
        </details>

        <details className="group rounded-2xl border border-[#E6DBCF] bg-white">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFD0CB]">
              <HeartPulse className="h-4 w-4 text-[#8C332D]" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm text-slate-900">Health</strong>
              <span className="block truncate text-xs text-slate-500">
                {child.allergies || child.medications || child.medicalNotes
                  ? "Important shared health information"
                  : "Optional health information"}
              </span>
            </span>
            <Plus className="h-4 w-4 text-slate-400 transition group-open:rotate-45" aria-hidden="true" />
          </summary>
          <div className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2">
            <Value label="GP" value={child.gpName} sensitive />
            <Value label="Dentist" value={child.dentistName} sensitive />
            <Value label="Allergies" value={child.allergies} sensitive />
            <Value label="Medications" value={child.medications} sensitive />
            <Value label="NHI / health identifier" value={child.nhiNumber} sensitive />
            <div className="sm:col-span-2">
              <Value label="Important medical notes" value={child.medicalNotes} sensitive />
            </div>
          </div>
        </details>

        <details className="group rounded-2xl border border-[#E6DBCF] bg-white">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF9DF]">
              <Ruler className="h-4 w-4 text-[#77570B]" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm text-slate-900">Practical details</strong>
              <span className="block truncate text-xs text-slate-500">
                Sizes, requirements and useful day-to-day notes
              </span>
            </span>
            <Plus className="h-4 w-4 text-slate-400 transition group-open:rotate-45" aria-hidden="true" />
          </summary>
          <div className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-3">
            <Value label="Clothing size" value={child.clothingSize} />
            <Value label="Shoe size" value={child.shoeSize} />
            <Value label="Uniform size" value={child.uniformSize} />
            <div className="sm:col-span-3">
              <Value label="Requirements / preferences" value={child.practicalNotes} />
            </div>
          </div>
        </details>

        <details className="group rounded-2xl border border-[#E6DBCF] bg-white">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF8F5]">
              <Activity className="h-4 w-4 text-[#0D7A6D]" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm text-slate-900">Activities</strong>
              <span className="block truncate text-xs text-slate-500">
                {data.activities.length === 0
                  ? "No regular activities added"
                  : `${data.activities.length} regular ${data.activities.length === 1 ? "activity" : "activities"}`}
              </span>
            </span>
            <Plus className="h-4 w-4 text-slate-400 transition group-open:rotate-45" aria-hidden="true" />
          </summary>
          <div className="border-t border-slate-200 p-4">
            <div className="flex justify-end">
              {editable ? (
                <button
                  type="button"
                  onClick={openNewActivity}
                  className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-[#243139] bg-white px-3 text-xs font-bold text-[#243139]"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add activity
                </button>
              ) : null}
            </div>
            {data.activities.length === 0 ? (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                Add sport, lessons or other recurring activities when they become useful.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {data.activities.map((item) => (
                  <article key={item.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-slate-950">{item.activityName}</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {[item.organisation, item.scheduleInfo].filter(Boolean).join(" · ") || "No extra details"}
                        </p>
                      </div>
                      {editable ? (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openActivityEditor(item)}
                            aria-label={`Edit ${item.activityName}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removeActivity(item)}
                            aria-label={`Remove ${item.activityName}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </details>

        <details className="group rounded-2xl border border-[#E6DBCF] bg-white">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F4F1FF]">
              <ReceiptText className="h-4 w-4 text-[#6651B7]" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm text-slate-900">Documents & related items</strong>
              <span className="block truncate text-xs text-slate-500">
                Files and links connected to this child
              </span>
            </span>
            <Plus className="h-4 w-4 text-slate-400 transition group-open:rotate-45" aria-hidden="true" />
          </summary>
          <div className="space-y-4 border-t border-slate-200 p-4">
            <AttachmentPanel
              entityType="child"
              entityId={child.id}
              defaultCategory="school_form"
              title="Documents"
            />
            <LinkedItemsPanel
              entityType="child"
              entityId={child.id}
              title="Related items"
            />
          </div>
        </details>

        <details className="group rounded-2xl border border-[#E6DBCF] bg-white">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
              <History className="h-4 w-4 text-slate-600" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm text-slate-900">Recent changes</strong>
              <span className="block truncate text-xs text-slate-500">
                {data.history.length === 0 ? "No changes recorded yet" : `${data.history.length} recent updates`}
              </span>
            </span>
            <Plus className="h-4 w-4 text-slate-400 transition group-open:rotate-45" aria-hidden="true" />
          </summary>
          <div className="border-t border-slate-200 p-4">
            {data.history.length === 0 ? (
              <p className="text-sm text-slate-500">No child-profile changes recorded yet.</p>
            ) : (
              <div className="space-y-1">
                {data.history.slice(0, 10).map((item) => (
                  <div key={item.id} className="flex gap-3 border-b border-slate-100 py-2.5 last:border-b-0">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#765ED6]" aria-hidden="true" />
                    <div>
                      <p className="text-sm text-slate-800">
                        <span className="font-semibold">{item.actorName ?? "Covie"}</span>{" "}
                        {item.summary.charAt(0).toLowerCase() + item.summary.slice(1)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{when(item.occurredAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      </section>

      {profileOpen && profileForm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 sm:items-center sm:p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="edit-child-profile-title" className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Child profile</p>
                <h2 id="edit-child-profile-title" className="mt-1 text-2xl font-semibold text-slate-950">Edit {child.displayName}</h2>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setProfileOpen(false)}
                aria-label="Close child profile editor"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 space-y-7">
              <div>
                <h3 className="font-semibold text-slate-900">Basic</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <TextField label="Preferred name" value={profileForm.displayName} onChange={(value) => setProfileForm((current) => current ? { ...current, displayName: value ?? "" } : current)} />
                  <TextField label="Full name" value={profileForm.fullName} onChange={(value) => setProfileForm((current) => current ? { ...current, fullName: value } : current)} />
                  <TextField label="Date of birth" type="date" value={profileForm.dateOfBirth} onChange={(value) => setProfileForm((current) => current ? { ...current, dateOfBirth: value } : current)} />
                  <TextField label="School" value={profileForm.schoolName} onChange={(value) => setProfileForm((current) => current ? { ...current, schoolName: value } : current)} />
                  <TextField label="Year / class" value={profileForm.yearClass} onChange={(value) => setProfileForm((current) => current ? { ...current, yearClass: value } : current)} />
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900">School</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <TextField label="Teacher" value={profileForm.teacherName} onChange={(value) => setProfileForm((current) => current ? { ...current, teacherName: value } : current)} />
                  <TextField label="School phone" value={profileForm.schoolPhone} onChange={(value) => setProfileForm((current) => current ? { ...current, schoolPhone: value } : current)} />
                  <TextField label="School email" type="email" value={profileForm.schoolEmail} onChange={(value) => setProfileForm((current) => current ? { ...current, schoolEmail: value } : current)} />
                  <TextField label="Student ID" value={profileForm.studentId} onChange={(value) => setProfileForm((current) => current ? { ...current, studentId: value } : current)} />
                  <div className="sm:col-span-2">
                    <TextAreaField label="Before / after-school care" value={profileForm.careDetails} onChange={(value) => setProfileForm((current) => current ? { ...current, careDetails: value } : current)} />
                  </div>
                  <div className="sm:col-span-2">
                    <TextAreaField label="School notes" value={profileForm.schoolNotes} onChange={(value) => setProfileForm((current) => current ? { ...current, schoolNotes: value } : current)} />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900">Health</h3>
                <p className="mt-1 text-xs text-slate-500">All health and identifier fields are optional.</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <TextField label="GP" value={profileForm.gpName} onChange={(value) => setProfileForm((current) => current ? { ...current, gpName: value } : current)} />
                  <TextField label="Dentist" value={profileForm.dentistName} onChange={(value) => setProfileForm((current) => current ? { ...current, dentistName: value } : current)} />
                  <TextAreaField label="Allergies" value={profileForm.allergies} onChange={(value) => setProfileForm((current) => current ? { ...current, allergies: value } : current)} />
                  <TextAreaField label="Medications" value={profileForm.medications} onChange={(value) => setProfileForm((current) => current ? { ...current, medications: value } : current)} />
                  <TextField label="NHI / health identifier" value={profileForm.nhiNumber} onChange={(value) => setProfileForm((current) => current ? { ...current, nhiNumber: value } : current)} />
                  <div className="sm:col-span-2">
                    <TextAreaField label="Important medical notes" value={profileForm.medicalNotes} onChange={(value) => setProfileForm((current) => current ? { ...current, medicalNotes: value } : current)} />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900">Useful practical information</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                  <TextField label="Clothing size" value={profileForm.clothingSize} onChange={(value) => setProfileForm((current) => current ? { ...current, clothingSize: value } : current)} />
                  <TextField label="Shoe size" value={profileForm.shoeSize} onChange={(value) => setProfileForm((current) => current ? { ...current, shoeSize: value } : current)} />
                  <TextField label="Uniform size" value={profileForm.uniformSize} onChange={(value) => setProfileForm((current) => current ? { ...current, uniformSize: value } : current)} />
                  <div className="sm:col-span-3">
                    <TextAreaField label="Requirements / preferences" value={profileForm.practicalNotes} onChange={(value) => setProfileForm((current) => current ? { ...current, practicalNotes: value } : current)} />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <button type="button" disabled={busy} onClick={() => setProfileOpen(false)} className="min-h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void saveProfile()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Save profile
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {activityOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 sm:items-center sm:p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="activity-form-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Child activity</p>
                <h2 id="activity-form-title" className="mt-1 text-2xl font-semibold text-slate-950">
                  {activityForm.id ? "Edit activity" : "Add activity"}
                </h2>
              </div>
              <button type="button" disabled={busy} onClick={() => setActivityOpen(false)} aria-label="Close activity form" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <TextField label="Activity / team" value={activityForm.activityName} onChange={(value) => setActivityForm((current) => ({ ...current, activityName: value ?? "" }))} />
              <TextField label="Organisation" value={activityForm.organisation} onChange={(value) => setActivityForm((current) => ({ ...current, organisation: value }))} />
              <TextField label="Coach / contact" value={activityForm.contactName} onChange={(value) => setActivityForm((current) => ({ ...current, contactName: value }))} />
              <TextField label="Contact details" value={activityForm.contactDetails} onChange={(value) => setActivityForm((current) => ({ ...current, contactDetails: value }))} />
              <TextField label="Normal location" value={activityForm.location} onChange={(value) => setActivityForm((current) => ({ ...current, location: value }))} />
              <TextAreaField label="Schedule information" value={activityForm.scheduleInfo} onChange={(value) => setActivityForm((current) => ({ ...current, scheduleInfo: value }))} />
              <div className="sm:col-span-2">
                <TextAreaField label="Notes" value={activityForm.notes} onChange={(value) => setActivityForm((current) => ({ ...current, notes: value }))} />
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <button type="button" disabled={busy} onClick={() => setActivityOpen(false)} className="min-h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void saveActivity()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {activityForm.id ? "Save activity" : "Add activity"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {data.permission === "viewer" ? (
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-5 text-slate-400">
          You have view-only access to this child profile.
        </p>
      ) : null}
    </main>
  );
}
