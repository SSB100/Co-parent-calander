import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { auth } from "@/lib/auth/server";
import { getSql } from "@/lib/db";
import { normalizeInviteCode } from "@/lib/security/invites";

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
  const sql = getSql();
  const memberships = (await sql`
    SELECT membership.calendar_id
    FROM calendar_memberships membership
    JOIN calendars calendar ON calendar.id = membership.calendar_id
    WHERE membership.user_id = ${session.user.id}
      AND calendar.archived_at IS NULL
    ORDER BY membership.created_at ASC
    LIMIT 1
  `) as Array<{ calendar_id: string }>;

  if (memberships.length > 0 && !inviteCode) {
    redirect("/calendar");
  }

  return (
    <OnboardingShell
      defaultName={session.user.name}
      initialInviteCode={inviteCode}
      hasExistingCalendar={memberships.length > 0}
    />
  );
}
