import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth/server";
import { loadPersonalData } from "@/lib/personal/service";
import { PersonalCalendar } from "@/components/personal/personal-calendar";
import { CovieNotice, CoviePage, CoviePageHeader } from "@/components/ui/covie";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Personal calendar" };
export default async function PersonalPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in?returnTo=%2Fpersonal");
  let data;
  try { data = await loadPersonalData(session.user.id); } catch { data = null; }
  if (!data) return <CoviePage><CoviePageHeader accent="coral" title="Personal calendar" /><CovieNotice tone="danger">Your overview could not be loaded. <Link href="/personal">Try again</Link> or <Link href="/calendar">open your calendar</Link>.</CovieNotice></CoviePage>;
  const pageNotice = (await searchParams).notice === "unavailable" ? "That source is no longer available. Your overview has been refreshed with the calendars you can currently access." : undefined;
  return <PersonalCalendar key={session.user.id} initialData={data} pageNotice={pageNotice} />;
}
