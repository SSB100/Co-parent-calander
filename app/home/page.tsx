import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HomeShell } from "@/components/home/home-shell";
import { loadHomeData } from "@/lib/home/load-home";
import { getCalendarSession } from "@/lib/security/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Updates" };

export default async function HomePage() {
  const session = await getCalendarSession();
  if (!session) redirect("/dashboard");

  const initialData = await loadHomeData(session);
  return <HomeShell initialData={initialData} />;
}
