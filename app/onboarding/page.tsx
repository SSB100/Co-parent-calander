import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { auth } from "@/lib/auth/server";
import { normalizeInviteCode } from "@/lib/security/invites";
import {
  listArchivedCalendarNavigationOptions,
  listCalendarNavigationOptions,
} from "@/lib/calendars/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get started" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");

  const params = await searchParams;
  const inviteCode = params.invite ? normalizeInviteCode(params.invite) : "";
  const [activeCalendars, archivedCalendars] = await Promise.all([
    listCalendarNavigationOptions(session.user.id),
    listArchivedCalendarNavigationOptions(session.user.id),
  ]);

  if (activeCalendars.length > 0 && !inviteCode) {
    redirect("/calendar");
  }

  return (
    <OnboardingShell
      defaultName={session.user.name}
      initialInviteCode={inviteCode}
      hasExistingCalendar={activeCalendars.length > 0}
      archivedCalendars={archivedCalendars}
    />
  );
}
