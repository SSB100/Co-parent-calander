import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCalendarSession } from "@/lib/security/session";
import { OrganiserShell } from "@/components/workspace/organiser-shell";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Organiser" };
export default async function OrganiserPage() {
  const session = await getCalendarSession();
  if (!session) redirect("/dashboard");
  return <OrganiserShell />;
}
