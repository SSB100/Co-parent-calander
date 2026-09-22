import { NextResponse } from "next/server";
import { StaffRosterServiceError } from "@/lib/staff-rosters/service";

export function staffRosterApiError(error: unknown) {
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
