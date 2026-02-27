import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { parentStudentLinks, repeatFlags, restrictions, studentEnrolments } from "@/db/schema";
import { requireParent } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireParent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const studentId = new URL(request.url).searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "studentId is required" }, { status: 400 });
  }

  const linked = await db
    .select({ studentId: parentStudentLinks.studentId })
    .from(parentStudentLinks)
    .where(and(eq(parentStudentLinks.parentId, auth.parentId), eq(parentStudentLinks.studentId, studentId)));

  if (linked.length === 0) {
    return NextResponse.json({ error: "Student not linked to this parent account" }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(restrictions)
    .where(and(eq(restrictions.parentId, auth.parentId), eq(restrictions.studentId, studentId)));

  return NextResponse.json({ restriction: rows[0] ?? null });
}

export async function PUT(request: Request) {
  const auth = await requireParent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as {
    studentId?: string;
    maxDailyMinutes?: number | null;
    maxWeeklyMinutes?: number | null;
    blockedTimes?: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
    mandatoryRevision?: Array<{ enrolmentId: number; concept: string; reason: string }>;
  };

  if (!body.studentId) {
    return NextResponse.json({ error: "studentId is required" }, { status: 400 });
  }

  const linked = await db
    .select({ studentId: parentStudentLinks.studentId })
    .from(parentStudentLinks)
    .where(and(eq(parentStudentLinks.parentId, auth.parentId), eq(parentStudentLinks.studentId, body.studentId)));

  if (linked.length === 0) {
    return NextResponse.json({ error: "Student not linked to this parent account" }, { status: 403 });
  }

  await db
    .insert(restrictions)
    .values({
      parentId: auth.parentId,
      studentId: body.studentId,
      maxDailyMinutes: body.maxDailyMinutes ?? null,
      maxWeeklyMinutes: body.maxWeeklyMinutes ?? null,
      blockedTimes: body.blockedTimes ?? [],
    })
    .onConflictDoUpdate({
      target: [restrictions.parentId, restrictions.studentId],
      set: {
        maxDailyMinutes: body.maxDailyMinutes ?? null,
        maxWeeklyMinutes: body.maxWeeklyMinutes ?? null,
        blockedTimes: body.blockedTimes ?? [],
        updatedAt: new Date(),
      },
    });

  if (Array.isArray(body.mandatoryRevision)) {
    for (const item of body.mandatoryRevision) {
      if (!item.concept || !item.reason) continue;

      const enrolment = await db
        .select({ id: studentEnrolments.id })
        .from(studentEnrolments)
        .where(and(eq(studentEnrolments.id, item.enrolmentId), eq(studentEnrolments.studentId, body.studentId)));

      if (enrolment.length === 0) continue;

      await db.insert(repeatFlags).values({
        studentId: body.studentId,
        enrolmentId: item.enrolmentId,
        concept: item.concept,
        reason: item.reason,
        priority: "high",
        status: "active",
        parentAssigned: 1,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
