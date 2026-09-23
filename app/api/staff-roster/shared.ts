import { NextResponse } from "next/server";
import { StaffRosterServiceError } from "@/lib/staff-rosters/service";

export function staffRosterApiError(error: unknown) {
  const databaseError = error as { constraint?: string; cause?: { constraint?: string } } | null;
  if (databaseError?.constraint === "staff_roster_break_bounds" || databaseError?.cause?.constraint === "staff_roster_break_bounds") {
    return NextResponse.json({ error: "These times would exclude a recorded break. End any active break and keep the attendance times around all recorded breaks." }, { status: 409 });
  }
  if (error instanceof StaffRosterServiceError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code ?? null,
        details: error.details ?? null,
      },
      { status: error.statusCode },
    );
  }

  return NextResponse.json(
    { error: "The roster request could not be completed." },
    { status: 500 },
  );
}
