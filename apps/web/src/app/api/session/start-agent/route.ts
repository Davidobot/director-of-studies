import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionId: string };
    const session = await db.select().from(sessions).where(eq(sessions.id, body.sessionId));

    if (session.length === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const current = session[0];

    const response = await fetch(`${process.env.AGENT_URL ?? "http://agent:8000"}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomName: current.roomName,
        sessionId: current.id,
        courseId: current.courseId,
        topicId: current.topicId,
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
      .where(eq(sessions.id, body.sessionId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to start agent" }, { status: 500 });
  }
}
