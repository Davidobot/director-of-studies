import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { courses, sessions, topics } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      roomName: sessions.roomName,
      createdAt: sessions.createdAt,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      courseName: courses.name,
      topicName: topics.name,
    })
    .from(sessions)
    .innerJoin(courses, eq(sessions.courseId, courses.id))
    .innerJoin(topics, eq(sessions.topicId, topics.id))
    .orderBy(desc(sessions.createdAt));

  return NextResponse.json({ sessions: rows });
}
