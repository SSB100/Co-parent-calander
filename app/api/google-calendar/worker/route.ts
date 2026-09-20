import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  enqueuePeriodicGoogleReconciliations,
  processDueGoogleSyncJobs,
} from "@/lib/google-calendar/queue";
import { materializeActiveRecurringExpenses } from "@/lib/expenses/recurrence";
import { runRetentionMaintenance } from "@/lib/retention/service";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const supplied = request.headers.get("authorization");
  if (!supplied?.startsWith("Bearer ")) return false;
  const token = supplied.slice(7);
  const expected = Buffer.from(secret);
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Sync worker is disabled." }, { status: 404 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [retention, recurringSharedCosts] = await Promise.all([
    runRetentionMaintenance(),
    materializeActiveRecurringExpenses({ monthsAhead: 12 }),
  ]);
  await enqueuePeriodicGoogleReconciliations();
  const googleCalendar = await processDueGoogleSyncJobs({ limit: 20 });
  return NextResponse.json({
    ok: true,
    retention,
    recurringSharedCosts,
    googleCalendar,
  });
}
