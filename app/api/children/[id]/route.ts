import { and, asc, desc, eq, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  childProfileFieldSections,
  childProfileSchema,
  changedProfileFields,
  historySummary,
  type ChildProfileInput,
} from "@/lib/children/profile";
import { getDb, getSql } from "@/lib/db";
import {
  auditLog,
  childActivities,
  children,
  expenses,
  participants,
  responsibilities,
  responsibilityChildren,
} from "@/lib/db/schema";
import { responsibilityStatus } from "@/lib/responsibilities/model";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession, getEditorSession } from "@/lib/security/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const childIdSchema = z.string().uuid();

function todayInAuckland() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function profileFromRow(row: {
  displayName: string;
  fullName: string | null;
  dateOfBirth: string | null;
  schoolName: string | null;
  yearClass: string | null;
  teacherName: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  studentId: string | null;
  careDetails: string | null;
  schoolNotes: string | null;
  gpName: string | null;
  dentistName: string | null;
  allergies: string | null;
  medications: string | null;
  medicalNotes: string | null;
  nhiNumber: string | null;
  clothingSize: string | null;
  shoeSize: string | null;
  uniformSize: string | null;
  practicalNotes: string | null;
}): ChildProfileInput {
  return {
    displayName: row.displayName,
    fullName: row.fullName,
    dateOfBirth: row.dateOfBirth,
    schoolName: row.schoolName,
    yearClass: row.yearClass,
    teacherName: row.teacherName,
    schoolPhone: row.schoolPhone,
    schoolEmail: row.schoolEmail,
    studentId: row.studentId,
    careDetails: row.careDetails,
    schoolNotes: row.schoolNotes,
    gpName: row.gpName,
    dentistName: row.dentistName,
    allergies: row.allergies,
    medications: row.medications,
    medicalNotes: row.medicalNotes,
    nhiNumber: row.nhiNumber,
    clothingSize: row.clothingSize,
    shoeSize: row.shoeSize,
    uniformSize: row.uniformSize,
    practicalNotes: row.practicalNotes,
  };
}

async function parseChildId(context: RouteContext) {
  const params = await context.params;
  return childIdSchema.safeParse(params.id);
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const parsedId = await parseChildId(context);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Choose a valid child profile." }, { status: 400 });
  }

  const db = getDb();
  const childRows = await db
    .select({
      id: children.id,
      displayName: children.displayName,
      fullName: children.fullName,
      dateOfBirth: children.dateOfBirth,
      schoolName: children.schoolName,
      yearClass: children.yearClass,
      teacherName: children.teacherName,
      schoolPhone: children.schoolPhone,
      schoolEmail: children.schoolEmail,
      studentId: children.studentId,
      careDetails: children.careDetails,
      schoolNotes: children.schoolNotes,
      gpName: children.gpName,
      dentistName: children.dentistName,
      allergies: children.allergies,
      medications: children.medications,
      medicalNotes: children.medicalNotes,
      nhiNumber: children.nhiNumber,
      clothingSize: children.clothingSize,
      shoeSize: children.shoeSize,
      uniformSize: children.uniformSize,
      practicalNotes: children.practicalNotes,
      updatedAt: children.updatedAt,
    })
    .from(children)
    .where(
      and(
        eq(children.id, parsedId.data),
        eq(children.calendarId, session.calendarId),
        eq(children.active, true),
      ),
    )
    .limit(1);

  const child = childRows[0];
  if (!child) {
    return NextResponse.json({ error: "Child profile not found." }, { status: 404 });
  }

  const [activityRows, responsibilityRows, expenseRows, historyRows] =
    await Promise.all([
      db
        .select({
          id: childActivities.id,
          activityName: childActivities.activityName,
          organisation: childActivities.organisation,
          contactName: childActivities.contactName,
          contactDetails: childActivities.contactDetails,
          location: childActivities.location,
          scheduleInfo: childActivities.scheduleInfo,
          notes: childActivities.notes,
          createdAt: childActivities.createdAt,
          updatedAt: childActivities.updatedAt,
        })
        .from(childActivities)
        .where(
          and(
            eq(childActivities.calendarId, session.calendarId),
            eq(childActivities.childId, child.id),
          ),
        )
        .orderBy(asc(childActivities.createdAt)),
      db
        .select({
          id: responsibilities.id,
          title: responsibilities.title,
          responsibleParticipantId: responsibilities.responsibleParticipantId,
          dueDate: responsibilities.dueDate,
          dueTime: responsibilities.dueTime,
          category: responsibilities.category,
          completedAt: responsibilities.completedAt,
        })
        .from(responsibilityChildren)
        .innerJoin(
          responsibilities,
          eq(responsibilityChildren.responsibilityId, responsibilities.id),
        )
        .where(
          and(
            eq(responsibilityChildren.childId, child.id),
            eq(responsibilities.calendarId, session.calendarId),
          ),
        )
        .orderBy(asc(responsibilities.dueDate))
        .limit(30),
      db
        .select({
          id: expenses.id,
          title: expenses.title,
          expenseDate: expenses.expenseDate,
          amountCents: expenses.amountCents,
          category: expenses.category,
          settlementStatus: expenses.settlementStatus,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.calendarId, session.calendarId),
            eq(expenses.childId, child.id),
          ),
        )
        .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
        .limit(20),
      db
        .select({
          id: auditLog.id,
          action: auditLog.action,
          details: auditLog.afterState,
          occurredAt: auditLog.occurredAt,
          actorName: participants.displayName,
        })
        .from(auditLog)
        .leftJoin(participants, eq(auditLog.actorParticipantId, participants.id))
        .where(
          and(
            eq(auditLog.calendarId, session.calendarId),
            eq(auditLog.entityId, child.id),
            or(
              eq(auditLog.entityType, "child_profile"),
              eq(auditLog.entityType, "child_activity"),
            ),
          ),
        )
        .orderBy(desc(auditLog.occurredAt))
        .limit(30),
    ]);

  const today = todayInAuckland();
  return NextResponse.json({
    permission: session.permission,
    currentParticipantId: session.participantId,
    child,
    activities: activityRows,
    responsibilities: responsibilityRows.map((item) => ({
      ...item,
      dueTime: item.dueTime ? item.dueTime.slice(0, 5) : null,
      status: responsibilityStatus(item, today),
    })),
    expenses: expenseRows,
    history: historyRows.map((item) => ({
      id: item.id,
      action: item.action,
      summary: historySummary({ action: item.action, details: item.details }),
      occurredAt: item.occurredAt,
      actorName: item.actorName,
    })),
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const parsedId = await parseChildId(context);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Choose a valid child profile." }, { status: 400 });
  }

  const parsed = childProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the child profile details." },
      { status: 400 },
    );
  }

  const db = getDb();
  const existingRows = await db
    .select({
      displayName: children.displayName,
      fullName: children.fullName,
      dateOfBirth: children.dateOfBirth,
      schoolName: children.schoolName,
      yearClass: children.yearClass,
      teacherName: children.teacherName,
      schoolPhone: children.schoolPhone,
      schoolEmail: children.schoolEmail,
      studentId: children.studentId,
      careDetails: children.careDetails,
      schoolNotes: children.schoolNotes,
      gpName: children.gpName,
      dentistName: children.dentistName,
      allergies: children.allergies,
      medications: children.medications,
      medicalNotes: children.medicalNotes,
      nhiNumber: children.nhiNumber,
      clothingSize: children.clothingSize,
      shoeSize: children.shoeSize,
      uniformSize: children.uniformSize,
      practicalNotes: children.practicalNotes,
    })
    .from(children)
    .where(
      and(
        eq(children.id, parsedId.data),
        eq(children.calendarId, session.calendarId),
        eq(children.active, true),
      ),
    )
    .limit(1);

  const existing = existingRows[0];
  if (!existing) {
    return NextResponse.json({ error: "Child profile not found." }, { status: 404 });
  }

  const before = profileFromRow(existing);
  const changedFields = changedProfileFields(before, parsed.data);
  if (changedFields.length === 0) {
    return NextResponse.json({ ok: true, changedFields: [] });
  }

  const changedSections = [
    ...new Set(changedFields.map((field) => childProfileFieldSections[field])),
  ];
  const sql = getSql();

  try {
    await sql.transaction([
      sql`
        UPDATE children
        SET
          display_name = ${parsed.data.displayName},
          full_name = ${parsed.data.fullName},
          date_of_birth = ${parsed.data.dateOfBirth},
          school_name = ${parsed.data.schoolName},
          year_class = ${parsed.data.yearClass},
          teacher_name = ${parsed.data.teacherName},
          school_phone = ${parsed.data.schoolPhone},
          school_email = ${parsed.data.schoolEmail},
          student_id = ${parsed.data.studentId},
          care_details = ${parsed.data.careDetails},
          school_notes = ${parsed.data.schoolNotes},
          gp_name = ${parsed.data.gpName},
          dentist_name = ${parsed.data.dentistName},
          allergies = ${parsed.data.allergies},
          medications = ${parsed.data.medications},
          medical_notes = ${parsed.data.medicalNotes},
          nhi_number = ${parsed.data.nhiNumber},
          clothing_size = ${parsed.data.clothingSize},
          shoe_size = ${parsed.data.shoeSize},
          uniform_size = ${parsed.data.uniformSize},
          practical_notes = ${parsed.data.practicalNotes},
          updated_at = now()
        WHERE id = ${parsedId.data}
          AND calendar_id = ${session.calendarId}
          AND active = true
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id,
          actor_participant_id,
          action,
          entity_type,
          entity_id,
          after_state
        )
        VALUES (
          ${session.calendarId},
          ${session.participantId},
          'child_profile.update',
          'child_profile',
          ${parsedId.data},
          ${JSON.stringify({
            changedFields,
            sections: changedSections,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    return NextResponse.json(
      { error: "The child profile could not be updated." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, changedFields, sections: changedSections });
}
