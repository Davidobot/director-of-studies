import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { boardSubjects, examBoards, studentEnrolments, subjects } from "@/db/schema";
import { requireStudent } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const rows = await db
    .select({
      enrolmentId: studentEnrolments.id,
      boardSubjectId: studentEnrolments.boardSubjectId,
      examYear: studentEnrolments.examYear,
      currentYearOfStudy: studentEnrolments.currentYearOfStudy,
      subjectName: subjects.name,
      level: subjects.level,
      category: subjects.category,
      boardCode: examBoards.code,
      boardName: examBoards.name,
      syllabusCode: boardSubjects.syllabusCode,
    })
    .from(studentEnrolments)
    .innerJoin(boardSubjects, eq(boardSubjects.id, studentEnrolments.boardSubjectId))
    .innerJoin(subjects, eq(subjects.id, boardSubjects.subjectId))
    .leftJoin(examBoards, eq(examBoards.id, boardSubjects.examBoardId))
    .where(eq(studentEnrolments.studentId, auth.studentId))
    .orderBy(asc(subjects.category), asc(subjects.name), asc(subjects.level));

  return NextResponse.json({ enrolments: rows });
}

export async function POST(request: Request) {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as {
    boardSubjectId?: number;
    examYear?: number;
    currentYearOfStudy?: number;
  };

  const boardSubjectId = Number(body.boardSubjectId);
  const examYear = Number(body.examYear ?? new Date().getFullYear());
  const currentYearOfStudy = Number(body.currentYearOfStudy ?? 1);

  if (Number.isNaN(boardSubjectId) || boardSubjectId <= 0) {
    return NextResponse.json({ error: "Invalid boardSubjectId" }, { status: 400 });
  }

  await db
    .insert(studentEnrolments)
    .values({
      studentId: auth.studentId,
      boardSubjectId,
      examYear,
      currentYearOfStudy,
    })
    .onConflictDoUpdate({
      target: [studentEnrolments.studentId, studentEnrolments.boardSubjectId],
      set: {
        examYear,
        currentYearOfStudy,
      },
    });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as { enrolmentId?: number };
  const enrolmentId = Number(body.enrolmentId);

  if (Number.isNaN(enrolmentId) || enrolmentId <= 0) {
    return NextResponse.json({ error: "Invalid enrolmentId" }, { status: 400 });
  }

  await db
    .delete(studentEnrolments)
    .where(and(eq(studentEnrolments.id, enrolmentId), eq(studentEnrolments.studentId, auth.studentId)));

  return NextResponse.json({ ok: true });
}
