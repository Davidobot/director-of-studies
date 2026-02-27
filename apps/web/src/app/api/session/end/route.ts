import OpenAI from "openai";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessionSummaries, sessionTranscripts, sessions } from "@/db/schema";

export const dynamic = "force-dynamic";

type SummaryPayload = {
  summaryMd: string;
  keyTakeaways: string[];
  citations: string[];
};

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
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You summarize tutoring sessions. Return strict JSON with keys: summaryMd (markdown string), keyTakeaways (string array), citations (string array). Keep it concise.",
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

    const transcriptRow = await db
      .select({ transcriptText: sessionTranscripts.transcriptText })
      .from(sessionTranscripts)
      .where(eq(sessionTranscripts.sessionId, body.sessionId));

    const transcriptText = transcriptRow[0]?.transcriptText ?? "";
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
