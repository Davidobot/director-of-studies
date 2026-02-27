import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { boardSubjects, studentEnrolments, subjects, tutorConfigs, tutorPersonas } from "@/db/schema";
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
      subjectName: subjects.name,
      level: subjects.level,
      personaId: tutorConfigs.personaId,
      personaName: tutorPersonas.name,
    })
    .from(studentEnrolments)
    .innerJoin(boardSubjects, eq(boardSubjects.id, studentEnrolments.boardSubjectId))
    .innerJoin(subjects, eq(subjects.id, boardSubjects.subjectId))
    .leftJoin(
      tutorConfigs,
      and(eq(tutorConfigs.enrolmentId, studentEnrolments.id), eq(tutorConfigs.studentId, auth.studentId))
    )
    .leftJoin(tutorPersonas, eq(tutorPersonas.id, tutorConfigs.personaId))
    .where(eq(studentEnrolments.studentId, auth.studentId));

  return NextResponse.json({ enrolments: rows });
}

export async function PUT(request: Request) {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as {
    enrolmentId?: number;
    personaId?: number | null;
  };

  const enrolmentId = Number(body.enrolmentId);
  if (Number.isNaN(enrolmentId) || enrolmentId <= 0) {
    return NextResponse.json({ error: "Invalid enrolmentId" }, { status: 400 });
  }

  const enrolment = await db
    .select({ id: studentEnrolments.id })
    .from(studentEnrolments)
    .where(and(eq(studentEnrolments.id, enrolmentId), eq(studentEnrolments.studentId, auth.studentId)));

  if (enrolment.length === 0) {
    return NextResponse.json({ error: "Enrolment not found" }, { status: 404 });
  }

  const personaId = body.personaId != null ? Number(body.personaId) : null;

  if (personaId !== null) {
    const persona = await db
      .select({ id: tutorPersonas.id })
      .from(tutorPersonas)
      .where(and(eq(tutorPersonas.id, personaId), eq(tutorPersonas.studentId, auth.studentId)));
    if (persona.length === 0) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }
  }

  await db
    .insert(tutorConfigs)
    .values({ studentId: auth.studentId, enrolmentId, personaId })
    .onConflictDoUpdate({
      target: [tutorConfigs.studentId, tutorConfigs.enrolmentId],
      set: { personaId, updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
}
