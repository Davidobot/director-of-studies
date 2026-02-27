import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { boardSubjects, studentEnrolments, subjects, tutorConfigs } from "@/db/schema";
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
      tutorName: tutorConfigs.tutorName,
      personalityPrompt: tutorConfigs.personalityPrompt,
      ttsVoiceModel: tutorConfigs.ttsVoiceModel,
      ttsSpeed: tutorConfigs.ttsSpeed,
    })
    .from(studentEnrolments)
    .innerJoin(boardSubjects, eq(boardSubjects.id, studentEnrolments.boardSubjectId))
    .innerJoin(subjects, eq(subjects.id, boardSubjects.subjectId))
    .leftJoin(
      tutorConfigs,
      and(eq(tutorConfigs.enrolmentId, studentEnrolments.id), eq(tutorConfigs.studentId, auth.studentId))
    )
    .where(eq(studentEnrolments.studentId, auth.studentId));

  return NextResponse.json({ configs: rows });
}

export async function PUT(request: Request) {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as {
    enrolmentId?: number;
    tutorName?: string;
    personalityPrompt?: string;
    ttsVoiceModel?: string;
    ttsSpeed?: string;
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

  const tutorName = (body.tutorName ?? "TutorBot").trim() || "TutorBot";
  const personalityPrompt = (body.personalityPrompt ?? "Be warm, concise, and Socratic.").trim() || "Be warm, concise, and Socratic.";
  const ttsVoiceModel = (body.ttsVoiceModel ?? "aura-2-draco-en").trim() || "aura-2-draco-en";
  const ttsSpeed = (body.ttsSpeed ?? "1.0").trim() || "1.0";

  await db
    .insert(tutorConfigs)
    .values({
      studentId: auth.studentId,
      enrolmentId,
      tutorName,
      personalityPrompt,
      ttsVoiceModel,
      ttsSpeed,
    })
    .onConflictDoUpdate({
      target: [tutorConfigs.studentId, tutorConfigs.enrolmentId],
      set: {
        tutorName,
        personalityPrompt,
        ttsVoiceModel,
        ttsSpeed,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ ok: true });
}
