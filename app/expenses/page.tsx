import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExpensesShell } from "@/components/expenses/expenses-shell";
import { getCalendarSession } from "@/lib/security/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Expenses" };

type ExpensesPageProps = {
  searchParams: Promise<{ date?: string | string[] }>;
};

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const session = await getCalendarSession();
  if (!session) redirect("/dashboard");

  const params = await searchParams;
  const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const initialDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;

  return <ExpensesShell initialDate={initialDate} calendarTimezone={session.calendarTimezone} />;
}
