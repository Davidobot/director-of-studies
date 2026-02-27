import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { boardSubjects, progressSnapshots, repeatFlags, scheduledTutorials, sessions, studentEnrolments, subjects } from "@/db/schema";
import { requireStudent } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sessionStats = await db
    .select({
      totalSessions: sql<number>`COUNT(*)`,
      sessionsThisWeek: sql<number>`COUNT(*) FILTER (WHERE ${sessions.createdAt} >= NOW() - interval '7 days')`,
    })
    .from(sessions)
    .where(eq(sessions.studentId, auth.studentId));

  const subjectProgress = await db
    .select({
      enrolmentId: studentEnrolments.id,
      subjectName: subjects.name,
      level: subjects.level,
      avgConfidence: sql<number>`COALESCE(AVG((${progressSnapshots.confidenceScore})::numeric), 0)`,
    })
    .from(studentEnrolments)
    .innerJoin(boardSubjects, eq(boardSubjects.id, studentEnrolments.boardSubjectId))
    .innerJoin(subjects, eq(subjects.id, boardSubjects.subjectId))
    .leftJoin(
      progressSnapshots,
      and(eq(progressSnapshots.studentId, auth.studentId), eq(progressSnapshots.enrolmentId, studentEnrolments.id))
    )
    .where(eq(studentEnrolments.studentId, auth.studentId))
    .groupBy(studentEnrolments.id, subjects.name, subjects.level)
    .orderBy(subjects.name);

  const activeRepeatFlags = await db
    .select({
      id: repeatFlags.id,
      concept: repeatFlags.concept,
      reason: repeatFlags.reason,
      priority: repeatFlags.priority,
      subjectName: subjects.name,
    })
    .from(repeatFlags)
    .innerJoin(studentEnrolments, eq(studentEnrolments.id, repeatFlags.enrolmentId))
    .innerJoin(boardSubjects, eq(boardSubjects.id, studentEnrolments.boardSubjectId))
    .innerJoin(subjects, eq(subjects.id, boardSubjects.subjectId))
    .where(and(eq(repeatFlags.studentId, auth.studentId), eq(repeatFlags.status, "active")))
    .orderBy(repeatFlags.priority, desc(repeatFlags.flaggedAt));

  const upcoming = await db
    .select({
      id: scheduledTutorials.id,
      title: scheduledTutorials.title,
      scheduledAt: scheduledTutorials.scheduledAt,
      status: scheduledTutorials.status,
    })
    .from(scheduledTutorials)
    .where(and(eq(scheduledTutorials.studentId, auth.studentId), eq(scheduledTutorials.status, "scheduled")))
    .orderBy(scheduledTutorials.scheduledAt)
    .limit(5);

  return NextResponse.json({
    stats: sessionStats[0] ?? { totalSessions: 0, sessionsThisWeek: 0 },
    subjectProgress,
    activeRepeatFlags,
    upcoming,
  });
}
