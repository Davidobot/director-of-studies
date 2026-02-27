import { NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { parentStudentLinks, studentInviteCodes } from "@/db/schema";
import { requireParent } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireParent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as { code?: string; relationship?: string };
  const code = (body.code ?? "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
  }

  const now = new Date();
  const inviteRows = await db
    .select({ id: studentInviteCodes.id, studentId: studentInviteCodes.studentId })
    .from(studentInviteCodes)
    .where(
      and(
        eq(studentInviteCodes.code, code),
        isNull(studentInviteCodes.usedAt),
        gt(studentInviteCodes.expiresAt, now)
      )
    )
    .limit(1);

  if (inviteRows.length === 0) {
    return NextResponse.json({ error: "Invalid or expired invite code" }, { status: 404 });
  }

  const invite = inviteRows[0];

  await db
    .insert(parentStudentLinks)
    .values({
      parentId: auth.parentId,
      studentId: invite.studentId,
      relationship: body.relationship ?? "guardian",
    })
    .onConflictDoNothing();

  await db
    .update(studentInviteCodes)
    .set({ usedAt: new Date() })
    .where(eq(studentInviteCodes.id, invite.id));

  return NextResponse.json({ ok: true, studentId: invite.studentId });
}
