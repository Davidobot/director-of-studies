import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { courses, sessions, topics } from "@/db/schema";
import { createParticipantToken, ensureRoom } from "@/lib/livekit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { courseId: number; topicId: number };
    const { courseId, topicId } = body;

    const course = await db.select().from(courses).where(eq(courses.id, courseId));
    const topic = await db.select().from(topics).where(and(eq(topics.id, topicId), eq(topics.courseId, courseId)));

    if (course.length === 0 || topic.length === 0) {
      return NextResponse.json({ error: "Invalid course/topic" }, { status: 400 });
    }

    const sessionId = crypto.randomUUID();
    const roomName = `dos-${sessionId}`;

    await ensureRoom(roomName);
    const participantToken = await createParticipantToken(roomName, "student");

    await db.insert(sessions).values({
      id: sessionId,
      courseId,
      topicId,
      roomName,
      participantToken,
      status: "pending",
    });

    return NextResponse.json({ sessionId, roomName, participantToken });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
