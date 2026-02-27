import OpenAI from "openai";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { progressSnapshots, repeatFlags, sessionSummaries, sessionTranscripts, sessions } from "@/db/schema";
import { requireStudent } from "@/lib/auth";

export const dynamic = "force-dynamic";
const SUMMARY_OPENAI_MODEL = process.env.SUMMARY_OPENAI_MODEL ?? "gpt-4o";

type SummaryPayload = {
  summaryMd: string;        // Narrative assessment of the student's performance
  keyTakeaways: string[];   // Topics and concepts covered during the session
  citations: string[];      // Personalised study recommendations
};

type ProgressPayload = {
  confidenceScore: number;
  strengths: string[];
  improvements: string[];
  focus: string[];
  repeat: Array<{ concept: string; reason: string; priority: "high" | "medium" | "low" }>;
};

async function waitForTranscriptText(sessionId: string, maxAttempts = 6, delayMs = 400): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const transcriptRow = await db
      .select({ transcriptText: sessionTranscripts.transcriptText })
      .from(sessionTranscripts)
      .where(eq(sessionTranscripts.sessionId, sessionId));

    const transcriptText = transcriptRow[0]?.transcriptText ?? "";
    if (transcriptText.trim().length > 0) {
      return transcriptText;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return "";
}

async function summarizeTranscript(transcriptText: string): Promise<SummaryPayload> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      summaryMd: "No summary generated because OPENAI_API_KEY is not set.",
      keyTakeaways: [],
      citations: [],
    };
  }

  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: SUMMARY_OPENAI_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          `You are a Director of Studies reviewing a tutoring session transcript.

Return strict JSON with exactly these keys:
- "summaryMd": A markdown string (2-4 paragraphs) assessing the student's performance. Cover: what they understood well, where they struggled, quality of their answers, and whether they engaged with Socratic prompts.
- "keyTakeaways": A JSON array of short strings (max 6) listing the specific topics and concepts that were actually covered in the session.
- "citations": A JSON array of short strings (max 5) giving concrete, personalised study recommendations for this student based on their performance — e.g. what to revise, practise questions to attempt, or areas to clarify with their teacher.

Be specific and honest. Do not pad or invent content not evidenced in the transcript.`,
      },
      {
        role: "user",
        content: transcriptText,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(text) as Partial<SummaryPayload>;

  return {
    summaryMd: parsed.summaryMd ?? "No summary generated.",
    keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
    citations: Array.isArray(parsed.citations) ? parsed.citations : [],
  };
}

async function analyzeProgress(transcriptText: string): Promise<ProgressPayload> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      confidenceScore: 0.6,
      strengths: [],
      improvements: [],
      focus: [],
      repeat: [],
    };
  }

  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: SUMMARY_OPENAI_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          `You analyse student tutorial transcripts. Return strict JSON with keys:
- confidenceScore: number between 0 and 1
- strengths: array of strings
- improvements: array of strings
- focus: array of strings (what to focus on next week)
- repeat: array of objects { concept, reason, priority } with priority one of high|medium|low
Use concise, specific outputs and only evidence-based claims.`,
      },
      { role: "user", content: transcriptText || "No transcript content available." },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as Partial<ProgressPayload>;
  const score = typeof parsed.confidenceScore === "number" ? parsed.confidenceScore : 0.6;
  const repeat = Array.isArray(parsed.repeat) ? parsed.repeat : [];

  return {
    confidenceScore: Math.max(0, Math.min(1, score)),
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
    focus: Array.isArray(parsed.focus) ? parsed.focus : [],
    repeat: repeat
      .map((item) => {
        const priority: "high" | "medium" | "low" = item.priority === "high" || item.priority === "low" ? item.priority : "medium";
        return {
          concept: String(item.concept ?? "").trim(),
          reason: String(item.reason ?? "").trim(),
          priority,
        };
      })
      .filter((item) => item.concept.length > 0 && item.reason.length > 0),
  };
}

export async function POST(request: Request) {
  try {
    const auth = await requireStudent();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as { sessionId: string };

    const matchingSession = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, body.sessionId), eq(sessions.studentId, auth.studentId)));

    if (matchingSession.length === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const sessionMetaRows = await db
      .select({
        studentId: sessions.studentId,
        enrolmentId: sessions.enrolmentId,
        topicId: sessions.topicId,
      })
      .from(sessions)
      .where(eq(sessions.id, body.sessionId));

    await db.update(sessions).set({ status: "ended", endedAt: new Date() }).where(eq(sessions.id, body.sessionId));

    const transcriptText = await waitForTranscriptText(body.sessionId);
    const summary = await summarizeTranscript(transcriptText);
    const progress = await analyzeProgress(transcriptText);

    await db
      .insert(sessionSummaries)
      .values({
        sessionId: body.sessionId,
        summaryMd: summary.summaryMd,
        keyTakeawaysJson: summary.keyTakeaways,
        citationsJson: summary.citations,
      })
      .onConflictDoUpdate({
        target: sessionSummaries.sessionId,
        set: {
          summaryMd: summary.summaryMd,
          keyTakeawaysJson: summary.keyTakeaways,
          citationsJson: summary.citations,
        },
      });

    await db.update(sessions).set({ status: "summarized" }).where(eq(sessions.id, body.sessionId));

    const sessionMeta = sessionMetaRows[0];
    if (sessionMeta?.studentId && sessionMeta?.enrolmentId) {
      await db.insert(progressSnapshots).values({
        studentId: sessionMeta.studentId,
        enrolmentId: sessionMeta.enrolmentId,
        topicId: sessionMeta.topicId,
        confidenceScore: String(progress.confidenceScore),
        areasOfStrength: progress.strengths,
        areasToImprove: progress.improvements,
        recommendedFocus: progress.focus,
      });

      for (const item of progress.repeat) {
        await db.insert(repeatFlags).values({
          studentId: sessionMeta.studentId,
          enrolmentId: sessionMeta.enrolmentId,
          topicId: sessionMeta.topicId,
          concept: item.concept,
          reason: item.reason,
          priority: item.priority,
          status: "active",
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to end session" }, { status: 500 });
  }
}
