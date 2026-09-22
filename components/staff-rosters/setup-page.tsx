"use client";

import {
  CalendarCheck2,
  CheckCircle2,
  MapPin,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarSwitcher,
  type CalendarOption,
} from "@/components/calendars/calendar-switcher";
import {
  CovieButton,
  CovieNotice,
  CoviePage,
  CoviePageHeader,
  CovieStatusBadge,
} from "@/components/ui/covie";
import {
  TemplateWorkspaceNav,
  type TemplateOrganiserNavItem,
} from "@/components/templates/template-workspace-nav";
import { getCalendarTemplateBySlug } from "@/lib/templates/calendar-templates";
import { CalendarDays, LayoutGrid } from "lucide-react";

type SetupPayload = {
  canManageSetup: boolean;
  currentAccessRole: "owner" | "manager" | "staff";
  roleCount: number;
  locationCount: number;
  memberCount: number;
  setupCompletedAt: string | null;
};

const template = getCalendarTemplateBySlug("staff-rosters");
const iconByKey = {
  people: UsersRound,
  calendar: CalendarDays,
  settings: LayoutGrid,
  grid: LayoutGrid,
};

export function StaffRosterSetupPage({
  calendars,
  archivedCalendars,
  currentCalendarId,
  defaultName,
}: {
  calendars: CalendarOption[];
  archivedCalendars: CalendarOption[];
  currentCalendarId: string;
  defaultName: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<SetupPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const organiserItems: readonly TemplateOrganiserNavItem[] =
    template.organiserTools.map((tool) => ({
      key: tool.key,
      label: tool.label,
      description: tool.description,
      icon: iconByKey[tool.icon],
    }));

  const refresh = useCallback(async () => {
    const response = await fetch("/api/staff-roster/setup", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as
      | SetupPayload
      | { error?: string }
      | null;

    if (!response.ok || !body || !("memberCount" in body)) {
      throw new Error(
        body && "error" in body && body.error
          ? body.error
          : "Roster setup could not be loaded.",
      );
    }

    setData(body);
    setError(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Roster setup could not be loaded.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function finishSetup() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/staff-roster/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Roster setup could not be completed.");
      }

      router.push("/calendar-types/staff-rosters");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Roster setup could not be completed.",
      );
      setBusy(false);
    }
  }

  const steps = data
    ? [
        {
          title: "Roles & locations",
          description:
            "Add the jobs and places you use most often. Both stay optional on individual shifts.",
          done: data.roleCount > 0 || data.locationCount > 0,
          detail:
            data.roleCount + " roles · " + data.locationCount + " locations",
          href: "/calendar-types/staff-rosters/organiser/roles-locations",
          icon: MapPin,
        },
        {
          title: "Team",
          description:
            "Add the people who will appear on the roster and set their usual role or location.",
          done: data.memberCount > 1,
          detail: data.memberCount + (data.memberCount === 1 ? " person" : " people"),
          href: "/calendar-types/staff-rosters/organiser/team",
          icon: UsersRound,
        },
        {
          title: "Availability",
          description:
            "Optional. Add known unavailable or available time before you start assigning shifts.",
          done: true,
          detail: "Can be added any time",
          href: "/calendar-types/staff-rosters/organiser/availability",
          icon: CalendarCheck2,
        },
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#FFF9F2] lg:pl-[252px]">
      <TemplateWorkspaceNav
        basePath="/calendar-types/staff-rosters"
        organiserItems={organiserItems}
        activeSection="calendar"
      />

      <CoviePage
        width="wide"
        className="pb-[calc(104px+env(safe-area-inset-bottom))] lg:pb-6"
      >
        <div className="mb-3">
          <CalendarSwitcher
            calendars={calendars}
            archivedCalendars={archivedCalendars}
            currentCalendarId={currentCalendarId}
            defaultName={defaultName}
          />
        </div>

        <CoviePageHeader
          accent="teal"
          title="Set up your roster"
          context="Add the basics you need, then start building the week. You can change all of this later."
        />

        {error ? (
          <CovieNotice tone="danger" role="alert" className="mt-5">
            {error}
          </CovieNotice>
        ) : null}

        {!data && !error ? (
          <div className="mt-5 rounded-2xl border border-[#E6DBCF] bg-white p-5 text-sm text-[#66747A]">
            Loading roster setup…
          </div>
        ) : null}

        {data ? (
          <div className="mt-6">
            {data.setupCompletedAt ? (
              <CovieNotice tone="teal" className="mb-5">
                Setup is complete. You can still change your team, roles,
                locations and availability at any time.
              </CovieNotice>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-3">
              {steps.map(({ title, description, done, detail, href, icon: Icon }, index) => (
                <article
                  key={title}
                  className="rounded-2xl border border-[#E6DBCF] bg-white p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#BFEDE6] bg-[#EAF8F5] text-[#0D7A6D]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <CovieStatusBadge tone={done ? "teal" : "neutral"}>
                      {done ? "Ready" : "Step " + (index + 1)}
                    </CovieStatusBadge>
                  </div>
                  <h2 className="mt-4 text-lg font-extrabold text-[#243139]">
                    {title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#526168]">
                    {description}
                  </p>
                  <p className="mt-3 text-xs font-bold text-[#66747A]">
                    {detail}
                  </p>
                  <Link
                    href={href}
                    className="mt-4 inline-flex min-h-11 items-center rounded-[10px] border border-[#E6DBCF] bg-white px-3 text-sm font-extrabold text-[#243139] hover:bg-[#F7EFE5]"
                  >
                    Open {title.toLowerCase()}
                  </Link>
                </article>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[#243139] bg-[#FFF9F2] p-4 shadow-[4px_4px_0_#BFEDE6]">
              <div>
                <p className="font-extrabold text-[#243139]">
                  Ready to build the roster?
                </p>
                <p className="mt-1 text-sm text-[#526168]">
                  Roles, locations and availability are optional. You can start
                  with just your team.
                </p>
              </div>
              {data.canManageSetup ? (
                <CovieButton disabled={busy} onClick={() => void finishSetup()}>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {busy
                    ? "Opening roster…"
                    : data.setupCompletedAt
                      ? "Open roster"
                      : "Finish setup & open roster"}
                </CovieButton>
              ) : (
                <Link
                  href="/calendar-types/staff-rosters"
                  className="inline-flex min-h-11 items-center rounded-[10px] bg-[#FF6B5F] px-4 text-sm font-extrabold text-[#243139]"
                >
                  Open roster
                </Link>
              )}
            </div>
          </div>
        ) : null}
      </CoviePage>
    </div>
  );
}
