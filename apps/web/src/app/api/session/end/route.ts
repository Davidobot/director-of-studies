import OpenAI from "openai";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessionSummaries, sessionTranscripts, sessions } from "@/db/schema";

export const dynamic = "force-dynamic";
const SUMMARY_OPENAI_MODEL = process.env.SUMMARY_OPENAI_MODEL ?? "gpt-4o";

type SummaryPayload = {
  summaryMd: string;        // Narrative assessment of the student's performance
  keyTakeaways: string[];   // Topics and concepts covered during the session
  citations: string[];      // Personalised study recommendations
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionId: string };

    await db
      .update(sessions)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(sessions.id, body.sessionId));

    const transcriptText = await waitForTranscriptText(body.sessionId);
    const summary = await summarizeTranscript(transcriptText);

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

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to end session" }, { status: 500 });
  }
}
