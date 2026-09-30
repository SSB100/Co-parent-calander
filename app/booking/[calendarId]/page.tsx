import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { PublicBookingPage } from "@/components/salon/public-booking-page";
import { salonDateSchema } from "@/lib/salon/contracts";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book an appointment" };
export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ calendarId: string }>;
  searchParams: Promise<{
    service?: string;
    practitioner?: string;
    date?: string;
  }>;
}) {
  const id = z
    .string()
    .uuid()
    .safeParse((await params).calendarId);
  if (!id.success) notFound();
  const query = await searchParams,
    { data: session } = await auth.getSession();
  return (
    <PublicBookingPage
      key={`${id.data}:${query.service || ""}:${query.practitioner || ""}:${query.date || ""}`}
      calendarId={id.data}
      signedIn={Boolean(session?.user)}
      defaultName={session?.user?.name || ""}
      initialDate={
        salonDateSchema.safeParse(query.date).success ? query.date : ""
      }
      initialService={
        z.string().uuid().safeParse(query.service).success ? query.service : ""
      }
      initialPractitioner={
        z.string().uuid().safeParse(query.practitioner).success
          ? query.practitioner
          : ""
      }
    />
  );
}
