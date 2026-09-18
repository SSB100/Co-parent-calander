import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KidsShell } from "@/components/children/kids-shell";
import { getCalendarSession } from "@/lib/security/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kids" };

export default async function KidsPage() {
  const session = await getCalendarSession();
  if (!session) redirect("/dashboard");

  return <KidsShell />;
}
