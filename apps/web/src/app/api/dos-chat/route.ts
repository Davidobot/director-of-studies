import OpenAI from "openai";
import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { boardSubjects, dosChatMessages, dosChatThreads, progressSnapshots, repeatFlags, sessions, studentEnrolments, subjects } from "@/db/schema";
import { requireStudent } from "@/lib/auth";

export const dynamic = "force-dynamic";

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

export async function GET() {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const threads = await db
    .select({ id: dosChatThreads.id, createdAt: dosChatThreads.createdAt })
    .from(dosChatThreads)
    .where(eq(dosChatThreads.studentId, auth.studentId))
    .orderBy(desc(dosChatThreads.createdAt))
    .limit(10);

  return NextResponse.json({ threads });
}

export async function POST(request: Request) {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as { message?: string; threadId?: string };
  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  let threadId = body.threadId;
  if (!threadId) {
    const created = await db.insert(dosChatThreads).values({ studentId: auth.studentId }).returning({ id: dosChatThreads.id });
    threadId = created[0].id;
  }

  await db.insert(dosChatMessages).values({ threadId, role: "user", content: message });

  const recentMessages = await db
    .select({ role: dosChatMessages.role, content: dosChatMessages.content })
    .from(dosChatMessages)
    .where(eq(dosChatMessages.threadId, threadId))
    .orderBy(desc(dosChatMessages.createdAt))
    .limit(12);

  const enrolments = await db
    .select({ subjectName: subjects.name, level: subjects.level })
    .from(studentEnrolments)
    .innerJoin(boardSubjects, eq(boardSubjects.id, studentEnrolments.boardSubjectId))
    .innerJoin(subjects, eq(subjects.id, boardSubjects.subjectId))
    .where(eq(studentEnrolments.studentId, auth.studentId));

  const repeats = await db
    .select({ concept: repeatFlags.concept, reason: repeatFlags.reason, priority: repeatFlags.priority })
    .from(repeatFlags)
    .where(and(eq(repeatFlags.studentId, auth.studentId), eq(repeatFlags.status, "active")))
    .orderBy(desc(repeatFlags.flaggedAt))
    .limit(12);

  const snapshots = await db
    .select({
      confidenceScore: progressSnapshots.confidenceScore,
      areasToImprove: progressSnapshots.areasToImprove,
      recommendedFocus: progressSnapshots.recommendedFocus,
    })
    .from(progressSnapshots)
    .where(eq(progressSnapshots.studentId, auth.studentId))
    .orderBy(desc(progressSnapshots.generatedAt))
    .limit(6);

  const sessionCount = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(sessions)
    .where(eq(sessions.studentId, auth.studentId));

  const openai = getOpenAI();
  let assistantReply = "I can help plan your next steps. Please set OPENAI_API_KEY to enable AI recommendations.";

  if (openai) {
    const completion = await openai.chat.completions.create({
      model: process.env.SUMMARY_OPENAI_MODEL ?? "gpt-5-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a Director of Studies planning assistant. Give concise UK-school-focused tutoring guidance. Be practical and specific.",
        },
        {
          role: "system",
          content: `Student context:\nSubjects: ${JSON.stringify(enrolments)}\nActive repeats: ${JSON.stringify(repeats)}\nRecent snapshots: ${JSON.stringify(snapshots)}\nTotal sessions tracked: ${sessionCount[0]?.total ?? 0}`,
        },
        ...recentMessages
          .reverse()
          .map((item) => ({ role: item.role === "assistant" ? "assistant" : "user", content: item.content } as const)),
      ],
    });

    assistantReply = completion.choices[0]?.message?.content?.trim() || assistantReply;
  }

  await db.insert(dosChatMessages).values({ threadId, role: "assistant", content: assistantReply });

  return NextResponse.json({ threadId, reply: assistantReply });
}
