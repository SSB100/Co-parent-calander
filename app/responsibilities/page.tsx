import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResponsibilitiesShell } from "@/components/responsibilities/responsibilities-shell";
import { listResponsibilities } from "@/lib/responsibilities/service";
import { getCalendarSession } from "@/lib/security/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tasks" };

type ResponsibilitiesPageProps = {
  searchParams: Promise<{ date?: string | string[] }>;
};

export default async function ResponsibilitiesPage({
  searchParams,
}: ResponsibilitiesPageProps) {
  const session = await getCalendarSession();
  if (!session) redirect("/dashboard");

  const params = await searchParams;
  const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const initialDate =
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;

  const initialData = await listResponsibilities({
    session,
    date: initialDate,
  });

  return (
    <ResponsibilitiesShell
      initialDate={initialDate}
      calendarTimezone={session.calendarTimezone}
      initialData={initialData}
    />
  );
}
