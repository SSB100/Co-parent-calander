import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HomeShell } from "@/components/home/home-shell";
import { getCalendarSession } from "@/lib/security/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const session = await getCalendarSession();
  if (!session) redirect("/dashboard");

  return <HomeShell />;
}
