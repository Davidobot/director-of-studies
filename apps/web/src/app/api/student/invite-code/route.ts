import { NextResponse } from "next/server";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { studentInviteCodes } from "@/db/schema";
import { requireStudent } from "@/lib/auth";

export const dynamic = "force-dynamic";

function generateCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function GET() {
  const auth = await requireStudent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const now = new Date();
  const existing = await db
    .select({ code: studentInviteCodes.code, expiresAt: studentInviteCodes.expiresAt })
    .from(studentInviteCodes)
    .where(and(eq(studentInviteCodes.studentId, auth.studentId), isNull(studentInviteCodes.usedAt), gt(studentInviteCodes.expiresAt, now)))
    .orderBy(desc(studentInviteCodes.createdAt))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ code: existing[0].code, expiresAt: existing[0].expiresAt });
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const code = generateCode();
  await db.insert(studentInviteCodes).values({ studentId: auth.studentId, code, expiresAt });

  return NextResponse.json({ code, expiresAt });
}
