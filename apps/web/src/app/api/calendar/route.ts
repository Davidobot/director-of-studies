import { NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { scheduledTutorials } from "@/db/schema";
import { getRequestAuth, requireStudent } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where = [eq(scheduledTutorials.studentId, auth.studentId)];
  if (from) where.push(gte(scheduledTutorials.scheduledAt, new Date(from)));
  if (to) where.push(lte(scheduledTutorials.scheduledAt, new Date(to)));

  const rows = await db
    .select()
    .from(scheduledTutorials)
    .where(and(...where))
    .orderBy(asc(scheduledTutorials.scheduledAt));

  return NextResponse.json({ tutorials: rows });
}

export async function POST(request: Request) {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const raw = getRequestAuth();
  if (!raw) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    enrolmentId?: number | null;
    topicId?: number | null;
    title?: string;
    scheduledAt?: string;
    durationMinutes?: number;
    recurrenceRule?: string | null;
  };

  if (!body.title || !body.scheduledAt) {
    return NextResponse.json({ error: "title and scheduledAt are required" }, { status: 400 });
  }

  const inserted = await db
    .insert(scheduledTutorials)
    .values({
      studentId: auth.studentId,
      enrolmentId: body.enrolmentId ?? null,
      topicId: body.topicId ?? null,
      title: body.title,
      scheduledAt: new Date(body.scheduledAt),
      durationMinutes: body.durationMinutes ?? 30,
      recurrenceRule: body.recurrenceRule ?? null,
      status: "scheduled",
      createdBy: raw.userId,
    })
    .returning({ id: scheduledTutorials.id });

  return NextResponse.json({ id: inserted[0].id });
}
