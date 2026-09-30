import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EcosystemHome } from "@/components/marketing/ecosystem-home";
import { auth } from "@/lib/auth/server";
import { getCalendarSession } from "@/lib/security/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Covie | Purpose-built calendars. One shared place." },
  description:
    "Choose Co-parenting, Staff Rosters, Shared Facilities or Social Groups. Start with the calendar you need and add another to your Covie account when it helps.",
};

export default async function Home() {
  const { data: session } = await auth.getSession();
  if (session?.user) {
    const calendar = await getCalendarSession();
    redirect(calendar ? "/calendar" : "/onboarding");
  }

  return <EcosystemHome />;
}
