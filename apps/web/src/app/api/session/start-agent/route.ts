import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { progressSnapshots, repeatFlags, sessions, tutorConfigs, tutorPersonas } from "@/db/schema";
import { requireStudent } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await requireStudent();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as {
      sessionId: string;
      agentOpenAIModel?: string;
      deepgramSttModel?: string;
      deepgramTtsModel?: string;
      silenceNudgeAfterS?: number;
    };
    const { sessionId, agentOpenAIModel, deepgramSttModel, deepgramTtsModel, silenceNudgeAfterS } = body;
    const session = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.studentId, auth.studentId)));

    if (session.length === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const current = session[0];

    const tutorConfigRows = current.enrolmentId
      ? await db
          .select({
            tutorName: tutorPersonas.name,
            personalityPrompt: tutorPersonas.personalityPrompt,
            ttsVoiceModel: tutorPersonas.ttsVoiceModel,
            ttsSpeed: tutorPersonas.ttsSpeed,
          })
          .from(tutorConfigs)
          .leftJoin(tutorPersonas, eq(tutorPersonas.id, tutorConfigs.personaId))
          .where(and(eq(tutorConfigs.studentId, auth.studentId), eq(tutorConfigs.enrolmentId, current.enrolmentId)))
      : [];

    const recentRepeatFlags = current.enrolmentId
      ? await db
          .select({ concept: repeatFlags.concept, reason: repeatFlags.reason, priority: repeatFlags.priority })
          .from(repeatFlags)
          .where(
            and(
              eq(repeatFlags.studentId, auth.studentId),
              eq(repeatFlags.enrolmentId, current.enrolmentId),
              eq(repeatFlags.status, "active")
            )
          )
      : [];

    const latestSnapshot = current.enrolmentId
      ? await db
          .select({ recommendedFocus: progressSnapshots.recommendedFocus })
          .from(progressSnapshots)
          .where(and(eq(progressSnapshots.studentId, auth.studentId), eq(progressSnapshots.enrolmentId, current.enrolmentId)))
          .orderBy(desc(progressSnapshots.generatedAt))
          .limit(1)
      : [];

    const tutorConfig = tutorConfigRows[0];

    const response = await fetch(`${process.env.AGENT_URL ?? "http://agent:8000"}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomName: current.roomName,
        sessionId: current.id,
        courseId: current.courseId,
        topicId: current.topicId,
        studentId: auth.studentId,
        enrolmentId: current.enrolmentId,
        tutorName: tutorConfig?.tutorName ?? "TutorBot",
        personalityPrompt: tutorConfig?.personalityPrompt ?? "Be warm, concise, and Socratic.",
        tutorVoiceModel: tutorConfig?.ttsVoiceModel ?? deepgramTtsModel ?? "aura-2-draco-en",
        tutorTtsSpeed: tutorConfig?.ttsSpeed ?? "1.0",
        repeatFlags: recentRepeatFlags,
        recommendedFocus: latestSnapshot[0]?.recommendedFocus ?? [],
        ...(agentOpenAIModel !== undefined && { agentOpenAIModel }),
        ...(deepgramSttModel !== undefined && { deepgramSttModel }),
        ...(deepgramTtsModel !== undefined && { deepgramTtsModel }),
        ...(silenceNudgeAfterS !== undefined && { silenceNudgeAfterS }),
      }),
    });

    if (!response.ok) {
      let detail = "Agent failed to join";

      try {
        const body = (await response.json()) as { detail?: string };
        if (typeof body.detail === "string" && body.detail.length > 0) {
          detail = body.detail;
        }
      } catch {
        // keep default error detail when response body is not JSON
      }

      return NextResponse.json({ error: detail }, { status: 502 });
    }

    await db
      .update(sessions)
      .set({ status: "live", startedAt: new Date() })
      .where(eq(sessions.id, sessionId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to start agent" }, { status: 500 });
  }
}
