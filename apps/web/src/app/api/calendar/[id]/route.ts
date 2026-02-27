import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { scheduledTutorials } from "@/db/schema";
import { requireStudent } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as {
    title?: string;
    scheduledAt?: string;
    durationMinutes?: number;
    status?: "scheduled" | "completed" | "cancelled" | "missed";
    recurrenceRule?: string | null;
  };

  await db
    .update(scheduledTutorials)
    .set({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.scheduledAt !== undefined && { scheduledAt: new Date(body.scheduledAt) }),
      ...(body.durationMinutes !== undefined && { durationMinutes: body.durationMinutes }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.recurrenceRule !== undefined && { recurrenceRule: body.recurrenceRule }),
      updatedAt: new Date(),
    })
    .where(and(eq(scheduledTutorials.id, params.id), eq(scheduledTutorials.studentId, auth.studentId)));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  await db
    .delete(scheduledTutorials)
    .where(and(eq(scheduledTutorials.id, params.id), eq(scheduledTutorials.studentId, auth.studentId)));

  return NextResponse.json({ ok: true });
}
