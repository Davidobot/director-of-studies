import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courses, sessionSummaries, sessionTranscripts, sessions, topics } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const rows = await db
    .select({
      id: sessions.id,
      roomName: sessions.roomName,
      participantToken: sessions.participantToken,
      status: sessions.status,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      createdAt: sessions.createdAt,
      courseId: sessions.courseId,
      topicId: sessions.topicId,
      courseName: courses.name,
      topicName: topics.name,
      transcriptJson: sessionTranscripts.transcriptJson,
      transcriptText: sessionTranscripts.transcriptText,
      summaryMd: sessionSummaries.summaryMd,
      keyTakeawaysJson: sessionSummaries.keyTakeawaysJson,
      citationsJson: sessionSummaries.citationsJson,
    })
    .from(sessions)
    .innerJoin(courses, eq(sessions.courseId, courses.id))
    .innerJoin(topics, eq(sessions.topicId, topics.id))
    .leftJoin(sessionTranscripts, eq(sessionTranscripts.sessionId, sessions.id))
    .leftJoin(sessionSummaries, eq(sessionSummaries.sessionId, sessions.id))
    .where(eq(sessions.id, params.id));

  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = rows[0];
  return NextResponse.json({ session });
}
