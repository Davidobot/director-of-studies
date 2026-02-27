import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tutorPersonas } from "@/db/schema";
import { requireStudent } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const personaId = Number(params.id);
  if (Number.isNaN(personaId) || personaId <= 0) {
    return NextResponse.json({ error: "Invalid persona id" }, { status: 400 });
  }

  const existing = await db
    .select({ id: tutorPersonas.id })
    .from(tutorPersonas)
    .where(and(eq(tutorPersonas.id, personaId), eq(tutorPersonas.studentId, auth.studentId)));

  if (existing.length === 0) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    name?: string;
    personalityPrompt?: string;
    ttsVoiceModel?: string;
    ttsSpeed?: string;
  };

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Tutor name is required" }, { status: 400 });
  }

  const personalityPrompt = (body.personalityPrompt ?? "Be warm, concise, and Socratic.").trim() || "Be warm, concise, and Socratic.";
  const ttsVoiceModel = (body.ttsVoiceModel ?? "aura-2-draco-en").trim() || "aura-2-draco-en";
  const ttsSpeed = (body.ttsSpeed ?? "1.0").trim() || "1.0";

  const [updated] = await db
    .update(tutorPersonas)
    .set({ name, personalityPrompt, ttsVoiceModel, ttsSpeed, updatedAt: new Date() })
    .where(and(eq(tutorPersonas.id, personaId), eq(tutorPersonas.studentId, auth.studentId)))
    .returning({ id: tutorPersonas.id, name: tutorPersonas.name, personalityPrompt: tutorPersonas.personalityPrompt, ttsVoiceModel: tutorPersonas.ttsVoiceModel, ttsSpeed: tutorPersonas.ttsSpeed });

  return NextResponse.json({ persona: updated });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const personaId = Number(params.id);
  if (Number.isNaN(personaId) || personaId <= 0) {
    return NextResponse.json({ error: "Invalid persona id" }, { status: 400 });
  }

  await db
    .delete(tutorPersonas)
    .where(and(eq(tutorPersonas.id, personaId), eq(tutorPersonas.studentId, auth.studentId)));

  return NextResponse.json({ ok: true });
}
