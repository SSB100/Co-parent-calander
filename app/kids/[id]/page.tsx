import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ChildProfileShell } from "@/components/children/child-profile-shell";
import { getCalendarSession } from "@/lib/security/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Child profile" };

type ChildProfilePageProps = {
  params: Promise<{ id: string }>;
};

export default async function ChildProfilePage({ params }: ChildProfilePageProps) {
  const session = await getCalendarSession();
  if (!session) redirect("/dashboard");

  const parsed = z.string().uuid().safeParse((await params).id);
  if (!parsed.success) redirect("/kids");

  return <ChildProfileShell childId={parsed.data} />;
}
