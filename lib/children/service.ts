import { and, asc, desc, eq, or } from "drizzle-orm";
import type { CalendarApprovalPermission } from "@/lib/approvals/types";
import { localDateInTimeZone } from "@/lib/calendar/time";
import {
  childProfileFieldSections,
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

export type ChildProfileReadSession = {
  calendarId: string;
  calendarTimezone: string;
  participantId: string | null;
  permission: CalendarApprovalPermission;
};

export type ChildProfileWriteSession = ChildProfileReadSession & {
  participantId: string;
};

export class ChildProfileServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ChildProfileServiceError";
  }
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

async function loadActiveChild(calendarId: string, childId: string) {
  const rows = await getDb()
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
        eq(children.id, childId),
        eq(children.calendarId, calendarId),
        eq(children.active, true),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getChildProfile(input: {
  session: ChildProfileReadSession;
  childId: string;
}) {
  const { session, childId } = input;
  const db = getDb();
  const child = await loadActiveChild(session.calendarId, childId);

  if (!child) {
    throw new ChildProfileServiceError(404, "Child profile not found.");
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
        .leftJoin(
          participants,
          eq(auditLog.actorParticipantId, participants.id),
        )
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

  const today = localDateInTimeZone(session.calendarTimezone);

  return {
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
      summary: historySummary({
        action: item.action,
        details: item.details,
      }),
      occurredAt: item.occurredAt,
      actorName: item.actorName,
    })),
  };
}

export async function updateChildProfile(input: {
  session: ChildProfileWriteSession;
  childId: string;
  profile: ChildProfileInput;
}) {
  const { session, childId, profile } = input;
  const existing = await loadActiveChild(session.calendarId, childId);

  if (!existing) {
    throw new ChildProfileServiceError(404, "Child profile not found.");
  }

  const before = profileFromRow(existing);
  const changedFields = changedProfileFields(before, profile);

  if (changedFields.length === 0) {
    return { ok: true as const, changedFields: [] };
  }

  const changedSections = [
    ...new Set(
      changedFields.map((field) => childProfileFieldSections[field]),
    ),
  ];
  const sql = getSql();

  try {
    await sql.transaction([
      sql`
        UPDATE children
        SET
          display_name = ${profile.displayName},
          full_name = ${profile.fullName},
          date_of_birth = ${profile.dateOfBirth},
          school_name = ${profile.schoolName},
          year_class = ${profile.yearClass},
          teacher_name = ${profile.teacherName},
          school_phone = ${profile.schoolPhone},
          school_email = ${profile.schoolEmail},
          student_id = ${profile.studentId},
          care_details = ${profile.careDetails},
          school_notes = ${profile.schoolNotes},
          gp_name = ${profile.gpName},
          dentist_name = ${profile.dentistName},
          allergies = ${profile.allergies},
          medications = ${profile.medications},
          medical_notes = ${profile.medicalNotes},
          nhi_number = ${profile.nhiNumber},
          clothing_size = ${profile.clothingSize},
          shoe_size = ${profile.shoeSize},
          uniform_size = ${profile.uniformSize},
          practical_notes = ${profile.practicalNotes},
          updated_at = now()
        WHERE id = ${childId}
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
          ${childId},
          ${JSON.stringify({
            changedFields,
            sections: changedSections,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    throw new ChildProfileServiceError(
      409,
      "The child profile could not be updated.",
    );
  }

  return {
    ok: true as const,
    changedFields,
    sections: changedSections,
  };
}
