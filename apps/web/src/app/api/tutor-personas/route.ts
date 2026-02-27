import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tutorPersonas } from "@/db/schema";
import { requireStudent } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const personas = await db
    .select({
      id: tutorPersonas.id,
      name: tutorPersonas.name,
      personalityPrompt: tutorPersonas.personalityPrompt,
      ttsVoiceModel: tutorPersonas.ttsVoiceModel,
      ttsSpeed: tutorPersonas.ttsSpeed,
    })
    .from(tutorPersonas)
    .where(eq(tutorPersonas.studentId, auth.studentId))
    .orderBy(tutorPersonas.name);

  return NextResponse.json({ personas });
}

export async function POST(request: Request) {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
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

  const [created] = await db
    .insert(tutorPersonas)
    .values({ studentId: auth.studentId, name, personalityPrompt, ttsVoiceModel, ttsSpeed })
    .returning({ id: tutorPersonas.id, name: tutorPersonas.name, personalityPrompt: tutorPersonas.personalityPrompt, ttsVoiceModel: tutorPersonas.ttsVoiceModel, ttsSpeed: tutorPersonas.ttsSpeed });

  return NextResponse.json({ persona: created }, { status: 201 });
}
