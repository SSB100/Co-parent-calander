import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExpensesShell } from "@/components/expenses/expenses-shell";
import { listExpenses } from "@/lib/expenses/service";
import { getCalendarSession } from "@/lib/security/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shared costs" };

type ExpensesPageProps = {
  searchParams: Promise<{ date?: string | string[] }>;
};

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const session = await getCalendarSession();
  if (!session) redirect("/dashboard");

  const params = await searchParams;
  const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const initialDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;

  const initialData = await listExpenses({
    session,
    date: initialDate,
  });

  return (
    <ExpensesShell
      initialDate={initialDate}
      calendarTimezone={session.calendarTimezone}
      initialData={initialData}
    />
  );
}
