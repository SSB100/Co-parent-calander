"use client";

import {
  CalendarDays,
  LayoutGrid,
  Settings,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import {
  CalendarSwitcher,
  type CalendarOption,
} from "@/components/calendars/calendar-switcher";
import { useState, type FormEvent } from "react";
import {
  CovieButton,
  CovieCard,
  CovieDialog,
  CovieInput,
  CovieNotice,
  CoviePage,
  CoviePageHeader,
  CovieSectionHeader,
  CovieSelect,
  CovieStatusBadge,
  CovieStrongCard,
} from "@/components/ui/covie";
import {
  TemplateWorkspaceNav,
  type TemplateOrganiserNavItem,
} from "@/components/templates/template-workspace-nav";
import {
  getCalendarTemplateBySlug,
  type AdditionalCalendarTemplateSlug,
  type CalendarTemplateId,
  type TemplateIconKey,
} from "@/lib/templates/calendar-templates";

const organiserIconByKey = {
  people: UsersRound,
  calendar: CalendarDays,
  settings: Settings,
  grid: LayoutGrid,
} satisfies Record<TemplateIconKey, typeof UsersRound>;

const sampleStaff = [
  { name: "Alex", colour: "#BFEDE6" },
  { name: "Jordan", colour: "#DDD3FA" },
  { name: "Sam", colour: "#FFD0CB" },
] as const;

const workDays = ["Mon 21", "Tue 22", "Wed 23", "Thu 24", "Fri 25"] as const;

const sampleShifts = [
  ["9:00–5:00", "", "9:00–5:00", "9:00–5:00", ""],
  ["", "10:00–6:00", "10:00–6:00", "", "10:00–6:00"],
  ["8:00–2:00", "8:00–2:00", "", "8:00–2:00", "8:00–2:00"],
] as const;

const resourceColours = ["#DDD3FA", "#BFEDE6", "#FFD0CB"] as const;
const resources = ["Court 1", "Court 2", "Meeting room"] as const;
const facilityTimes = ["9:00", "10:00", "11:00", "12:00"] as const;

const facilityBookings = new Map([
  ["9:00-Court 1", "Tennis lesson"],
  ["10:00-Court 2", "Member booking"],
  ["11:00-Meeting room", "Committee meeting"],
  ["12:00-Court 1", "Member booking"],
]);

const socialDays = [
  { day: "Mon", date: "21", event: "" },
  { day: "Tue", date: "22", event: "Coffee catch-up" },
  { day: "Wed", date: "23", event: "" },
  { day: "Thu", date: "24", event: "Club night" },
  { day: "Fri", date: "25", event: "" },
  { day: "Sat", date: "26", event: "Beach walk" },
  { day: "Sun", date: "27", event: "" },
] as const;

function boundaryCopy(templateId: CalendarTemplateId) {
  switch (templateId) {
    case "staff_rosters":
      return "Roster clarity first. Payroll, wages, time clocks, HR and performance management stay outside this template.";
    case "shared_facilities":
      return "Resource availability and booking come first. Paid bookings remain an optional facility feature, not a separate calendar type.";
    case "social_groups":
      return "Shared plans stay lightweight. This is not a social network and payments are not part of the initial template.";
    default:
      return "";
  }
}

function CreateShellFields({ templateId }: { templateId: CalendarTemplateId }) {
  if (templateId === "staff_rosters") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="mb-1.5 block text-sm font-bold">Staff member</span>
          <CovieSelect required defaultValue="">
            <option value="" disabled>Select a staff member</option>
            <option>Alex</option>
            <option>Jordan</option>
            <option>Sam</option>
          </CovieSelect>
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-bold">Date</span>
          <CovieInput type="date" required />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-bold">Location</span>
          <CovieSelect defaultValue="Main site">
            <option>Main site</option>
            <option>Second site</option>
          </CovieSelect>
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-bold">Starts</span>
          <CovieInput type="time" required />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-bold">Ends</span>
          <CovieInput type="time" required />
        </label>
      </div>
    );
  }

  if (templateId === "shared_facilities") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="mb-1.5 block text-sm font-bold">Resource</span>
          <CovieSelect required defaultValue="">
            <option value="" disabled>Select a resource</option>
            <option>Court 1</option>
            <option>Court 2</option>
            <option>Meeting room</option>
          </CovieSelect>
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-bold">Date</span>
          <CovieInput type="date" required />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-bold">Booking name</span>
          <CovieInput placeholder="Optional" />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-bold">Starts</span>
          <CovieInput type="time" required />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-bold">Ends</span>
          <CovieInput type="time" required />
        </label>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className="mb-1.5 block text-sm font-bold">Event name</span>
        <CovieInput placeholder="What are you doing?" required />
      </label>
      <label>
        <span className="mb-1.5 block text-sm font-bold">Date</span>
        <CovieInput type="date" required />
      </label>
      <label>
        <span className="mb-1.5 block text-sm font-bold">Time</span>
        <CovieInput type="time" required />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-1.5 block text-sm font-bold">Location</span>
        <CovieInput placeholder="Optional" />
      </label>
    </div>
  );
}

function StaffRosterSchedule() {
  return (
    <div className="overflow-x-auto rounded-2xl border-2 border-[#243139] bg-white">
      <div className="grid min-w-[820px] grid-cols-[148px_repeat(5,minmax(126px,1fr))]">
        <div className="border-b border-r border-[#E6DBCF] bg-[#FFF9F2] p-3 text-xs font-extrabold uppercase tracking-[0.08em] text-[#66747A]">
          Staff
        </div>
        {workDays.map((day) => (
          <div
            key={day}
            className="border-b border-r border-[#E6DBCF] bg-[#FFF9F2] p-3 text-center text-sm font-extrabold last:border-r-0"
          >
            {day}
          </div>
        ))}

        {sampleStaff.map((staff, staffIndex) => (
          <div className="contents" key={staff.name}>
            <div className="flex min-h-[86px] items-center gap-2 border-b border-r border-[#E6DBCF] p-3 last:border-b-0">
              <span
                className="h-4 w-4 rounded-full border border-[#243139]"
                style={{ background: staff.colour }}
                aria-hidden="true"
              />
              <strong className="text-sm">{staff.name}</strong>
            </div>
            {sampleShifts[staffIndex].map((shift, dayIndex) => (
              <div
                key={`${staff.name}-${workDays[dayIndex]}`}
                className="min-h-[86px] border-b border-r border-[#E6DBCF] p-2 last:border-r-0"
              >
                {shift ? (
                  <div className="flex h-full min-h-[66px] flex-col justify-between rounded-xl border border-[#243139] bg-[#BFEDE6] p-2">
                    <strong className="text-sm">{shift}</strong>
                    <span className="text-xs text-[#526168]">Main site</span>
                  </div>
                ) : (
                  <span className="text-xs text-[#66747A]">Not scheduled</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function FacilitiesSchedule() {
  return (
    <div className="overflow-x-auto rounded-2xl border-2 border-[#243139] bg-white">
      <div className="grid min-w-[760px] grid-cols-[82px_repeat(3,minmax(190px,1fr))]">
        <div className="border-b border-r border-[#E6DBCF] bg-[#FFF9F2] p-3" />
        {resources.map((resource, index) => (
          <div
            key={resource}
            className="border-b border-r border-[#E6DBCF] p-3 last:border-r-0"
            style={{ background: resourceColours[index] }}
          >
            <strong className="text-sm">{resource}</strong>
          </div>
        ))}

        {facilityTimes.map((time) => (
          <div className="contents" key={time}>
            <div className="border-b border-r border-[#E6DBCF] bg-[#FFF9F2] p-3 text-xs font-extrabold">
              {time}
            </div>
            {resources.map((resource, resourceIndex) => {
              const booking = facilityBookings.get(`${time}-${resource}`);
              return (
                <div
                  key={`${time}-${resource}`}
                  className="min-h-[78px] border-b border-r border-[#E6DBCF] p-2 last:border-r-0"
                >
                  {booking ? (
                    <div
                      className="h-full rounded-xl border border-[#243139] bg-white p-2"
                      style={{ boxShadow: `inset 5px 0 ${resourceColours[resourceIndex]}` }}
                    >
                      <strong className="block pl-2 text-sm">{booking}</strong>
                      <span className="mt-1 block pl-2 text-xs text-[#526168]">
                        Confirmed
                      </span>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[#B9AEA3] text-xs font-bold text-[#66747A]">
                      Available
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SocialSchedule() {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[800px] grid-cols-7 gap-2">
        {socialDays.map((item) => (
          <div
            key={item.day}
            className="relative min-h-[178px] overflow-hidden rounded-2xl border-2 border-[#243139] bg-white"
          >
            <div className="flex items-start justify-between p-3">
              <strong className="text-xs uppercase tracking-[0.08em] text-[#66747A]">
                {item.day}
              </strong>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFF9F2] text-sm font-extrabold">
                {item.date}
              </span>
            </div>
            {item.event ? (
              <div className="absolute inset-x-0 bottom-0 border-t border-[#243139] bg-[#FFD0CB] px-3 py-2.5">
                <strong className="block text-sm">{item.event}</strong>
                <span className="mt-1 block text-xs text-[#526168]">4 going · 2 maybe</span>
              </div>
            ) : (
              <span className="absolute inset-x-3 bottom-3 text-xs text-[#66747A]">
                No activity
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScheduleSurface({ templateId }: { templateId: CalendarTemplateId }) {
  if (templateId === "staff_rosters") return <StaffRosterSchedule />;
  if (templateId === "shared_facilities") return <FacilitiesSchedule />;
  return <SocialSchedule />;
}

export function TemplateShell({
  slug,
  calendars,
  currentCalendarId,
  defaultName,
}: {
  slug: AdditionalCalendarTemplateSlug;
  calendars: CalendarOption[];
  currentCalendarId: string;
  defaultName: string;
}) {
  const template = getCalendarTemplateBySlug(slug);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewNotice, setPreviewNotice] = useState("");

  const currentPath = `/calendar-types/${slug}`;
  const organiserItems: readonly TemplateOrganiserNavItem[] =
    template.organiserTools.map((tool) => ({
      key: tool.key,
      label: tool.label,
      description: tool.description,
      icon: organiserIconByKey[tool.icon],
    }));

  function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDialogOpen(false);
    setPreviewNotice(
      `${template.primaryScheduledEntity} form checked. Saving is intentionally left for the detailed feature pass.`,
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF9F2] lg:pl-[252px]">
      <TemplateWorkspaceNav
        basePath={currentPath}
        organiserItems={organiserItems}
      />
      <CoviePage
        width="wide"
        className="pb-[calc(104px+env(safe-area-inset-bottom))] lg:pb-6"
      >
        <CoviePageHeader
          accent={template.accentPair[0]}
          leading={
            <CalendarSwitcher
              calendars={calendars}
              currentCalendarId={currentCalendarId}
              defaultName={defaultName}
            />
          }
          title={template.name}
          context={template.coreQuestion}
          actions={
            <CovieButton onClick={() => setDialogOpen(true)}>
              {template.primaryCreateAction}
            </CovieButton>
          }
        />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/calendar-types"
          className="min-h-11 rounded-[10px] border border-[#7A8981] bg-[#FFF9F2] px-3 py-2.5 text-sm font-bold text-[#243139] hover:bg-[#F7EFE5]"
        >
          All calendar shells
        </Link>
        <CovieStatusBadge tone="violet">Shell preview</CovieStatusBadge>
      </div>

      {previewNotice ? (
        <CovieNotice tone="violet" className="mt-4">
          {previewNotice}
        </CovieNotice>
      ) : null}

      <section className="mt-6 grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
        <CovieStrongCard tone={template.accentPair[0]}>
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#66747A]">
            Purpose
          </p>
          <p className="mt-2 max-w-3xl text-base leading-7 text-[#243139]">
            {template.purpose}
          </p>
        </CovieStrongCard>

        <CovieCard>
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#66747A]">
            Schedule model
          </p>
          <p className="mt-2 text-sm font-extrabold text-[#243139]">
            {template.primaryScheduledEntity}
          </p>
          <p className="mt-1 text-sm text-[#526168]">
            {template.scheduleUnit} · {template.defaultView}
          </p>
        </CovieCard>
      </section>

      <section className="mt-7">
        <CovieSectionHeader
          title="Calendar"
          description="The schedule changes to fit the job, while the Covie interaction grammar stays the same."
          actions={
            <div className="flex flex-wrap gap-2">
              <CovieStatusBadge tone={template.accentPair[0]}>
                {template.primaryScheduledEntity}
              </CovieStatusBadge>
              <CovieStatusBadge tone="neutral">
                {template.identityTypes.join(" · ")}
              </CovieStatusBadge>
            </div>
          }
        />
        <div className="mt-3">
          <ScheduleSurface templateId={template.id} />
        </div>
      </section>

      <section id="updates" className="mt-8 scroll-mt-6">
        <CovieSectionHeader
          title="Updates"
          description="One shared activity pattern, presented in the language of this calendar type."
        />
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <CovieCard>
            <CovieStatusBadge tone="teal">Confirmed</CovieStatusBadge>
            <h3 className="mt-3 text-[15px] font-extrabold text-[#243139]">
              Schedule ready
            </h3>
            <p className="mt-1 text-sm text-[#526168]">
              Confirmed changes will appear here in plain language.
            </p>
          </CovieCard>
          <CovieCard>
            <CovieStatusBadge tone="sunshine">Needs attention</CovieStatusBadge>
            <h3 className="mt-3 text-[15px] font-extrabold text-[#243139]">
              Action needed
            </h3>
            <p className="mt-1 text-sm text-[#526168]">
              Drafts, approval needs or important changes stay easy to find.
            </p>
          </CovieCard>
          <CovieCard>
            <CovieStatusBadge tone="violet">Information</CovieStatusBadge>
            <h3 className="mt-3 text-[15px] font-extrabold text-[#243139]">
              Useful context
            </h3>
            <p className="mt-1 text-sm text-[#526168]">
              Supporting information uses the same Covie feedback language.
            </p>
          </CovieCard>
        </div>
      </section>

      <section className="mt-8">
        <CovieSectionHeader
          title="Organiser"
          description="Supporting tools stay grouped here instead of growing the main navigation."
        />
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {template.organiserTools.map((tool) => (
            <CovieCard
              key={tool.key}
              id={tool.key}
              className="scroll-mt-6"
            >
              <CovieStatusBadge tone="neutral">Shell</CovieStatusBadge>
              <h3 className="mt-3 text-[15px] font-extrabold text-[#243139]">
                {tool.label}
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#526168]">
                {tool.description}
              </p>
            </CovieCard>
          ))}
        </div>
      </section>

      <section className="mt-8 pb-6">
        <CovieNotice tone="sunshine">
          <strong className="font-extrabold">Product boundary:</strong>{" "}
          {boundaryCopy(template.id)}
        </CovieNotice>
      </section>

        {dialogOpen ? (
          <form id="calendar-shell-create-form" onSubmit={submitPreview}>
            <CovieDialog
              id="calendar-shell-create-title"
              title={template.primaryCreateAction}
              description={`Preview the basic ${template.primaryScheduledEntity.toLowerCase()} form. Detailed rules come in the next feature pass.`}
              icon={<CalendarDays aria-hidden="true" />}
              iconTone={template.accentPair[0]}
              onClose={() => setDialogOpen(false)}
              footer={
                <>
                  <CovieButton
                    tone="neutral"
                    type="button"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </CovieButton>
                  <CovieButton type="submit" form="calendar-shell-create-form">
                    {template.primaryCreateAction}
                  </CovieButton>
                </>
              }
            >
              <CreateShellFields templateId={template.id} />
            </CovieDialog>
          </form>
        ) : null}
      </CoviePage>
    </div>
  );
}
