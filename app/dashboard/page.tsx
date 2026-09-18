import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendar" };

export default async function DashboardPage() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");

  redirect("/calendar");
}
