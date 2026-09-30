import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { OwnAppointmentPage } from "@/components/salon/own-appointment-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your appointment" };
export default async function AppointmentPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const id = z
    .string()
    .uuid()
    .safeParse((await params).appointmentId);
  if (!id.success) notFound();
  const { data: session } = await auth.getSession();
  if (!session?.user)
    redirect(
      `/auth/sign-in?returnTo=${encodeURIComponent(`/booking/manage/${id.data}`)}`,
    );
  return <OwnAppointmentPage key={id.data} appointmentId={id.data} />;
}
