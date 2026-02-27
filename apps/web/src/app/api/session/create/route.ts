import { NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { boardSubjects, courses, restrictions, sessions, studentEnrolments, topics } from "@/db/schema";
import { createParticipantToken, ensureRoom } from "@/lib/livekit";
import { requireStudent } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await requireStudent();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as { courseId: number; topicId: number };
    const { courseId, topicId } = body;

    const course = await db.select().from(courses).where(eq(courses.id, courseId));
    const topic = await db.select().from(topics).where(and(eq(topics.id, topicId), eq(topics.courseId, courseId)));

    if (course.length === 0 || topic.length === 0) {
      return NextResponse.json({ error: "Invalid course/topic" }, { status: 400 });
    }

    const activeRestrictions = await db
      .select({
        maxDailyMinutes: restrictions.maxDailyMinutes,
        maxWeeklyMinutes: restrictions.maxWeeklyMinutes,
        blockedTimes: restrictions.blockedTimes,
      })
      .from(restrictions)
      .where(eq(restrictions.studentId, auth.studentId));

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);

    const sessionDurations = await db
      .select({
        totalDailyMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.startedAt} >= ${dayStart} THEN EXTRACT(EPOCH FROM (${sessions.endedAt} - ${sessions.startedAt})) / 60 ELSE 0 END), 0)`,
        totalWeeklyMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.startedAt} >= ${weekStart} THEN EXTRACT(EPOCH FROM (${sessions.endedAt} - ${sessions.startedAt})) / 60 ELSE 0 END), 0)`,
      })
      .from(sessions)
      .where(and(eq(sessions.studentId, auth.studentId), eq(sessions.status, "summarized"), gte(sessions.startedAt, weekStart)));

    const totalDailyMinutes = Number(sessionDurations[0]?.totalDailyMinutes ?? 0);
    const totalWeeklyMinutes = Number(sessionDurations[0]?.totalWeeklyMinutes ?? 0);

    for (const rule of activeRestrictions) {
      if (rule.maxDailyMinutes !== null && totalDailyMinutes >= rule.maxDailyMinutes) {
        return NextResponse.json({ error: "Daily tutorial limit reached by parent/guardian restrictions" }, { status: 403 });
      }
      if (rule.maxWeeklyMinutes !== null && totalWeeklyMinutes >= rule.maxWeeklyMinutes) {
        return NextResponse.json({ error: "Weekly tutorial limit reached by parent/guardian restrictions" }, { status: 403 });
      }

      const blockedTimes = Array.isArray(rule.blockedTimes) ? rule.blockedTimes : [];
      const dayOfWeek = now.getDay();
      const currentTime = now.toTimeString().slice(0, 5);

      for (const blocked of blockedTimes) {
        if (!blocked || typeof blocked !== "object") continue;
        const blockedDay = Number((blocked as { dayOfWeek?: number }).dayOfWeek);
        const startTime = String((blocked as { startTime?: string }).startTime ?? "00:00");
        const endTime = String((blocked as { endTime?: string }).endTime ?? "00:00");
        if (blockedDay === dayOfWeek && currentTime >= startTime && currentTime <= endTime) {
          return NextResponse.json({ error: "Tutorials are blocked at this time by parent/guardian restrictions" }, { status: 403 });
        }
      }
    }

    const currentCourse = course[0];
    let enrolmentId: number | null = null;

    if (currentCourse.subjectId) {
      const enrolments = await db
        .select({ enrolmentId: studentEnrolments.id, examBoardId: boardSubjects.examBoardId })
        .from(studentEnrolments)
        .innerJoin(boardSubjects, eq(boardSubjects.id, studentEnrolments.boardSubjectId))
        .where(eq(studentEnrolments.studentId, auth.studentId));

      const matched = enrolments.find((enrolment) => {
        if (currentCourse.examBoardId === null || currentCourse.examBoardId === undefined) return true;
        return enrolment.examBoardId === currentCourse.examBoardId;
      });

      enrolmentId = matched?.enrolmentId ?? null;

      if (!enrolmentId) {
        return NextResponse.json({ error: "You are not enrolled in this subject/exam board" }, { status: 403 });
      }
    }

    const sessionId = crypto.randomUUID();
    const roomName = `dos-${sessionId}`;

    await ensureRoom(roomName);
    const participantToken = await createParticipantToken(roomName, auth.studentId);

    await db.insert(sessions).values({
      id: sessionId,
      studentId: auth.studentId,
      enrolmentId,
      courseId,
      topicId,
      roomName,
      participantToken,
      status: "pending",
    });

    return NextResponse.json({ sessionId, roomName, participantToken });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
