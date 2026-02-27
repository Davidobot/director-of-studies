import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { parentStudentLinks, profiles, students } from "@/db/schema";
import { requireParent } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireParent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const links = await db
    .select({
      studentId: parentStudentLinks.studentId,
      relationship: parentStudentLinks.relationship,
      studentName: profiles.displayName,
      studentEmail: profiles.email,
      schoolYear: students.schoolYear,
    })
    .from(parentStudentLinks)
    .innerJoin(students, eq(students.id, parentStudentLinks.studentId))
    .innerJoin(profiles, eq(profiles.id, students.id))
    .where(eq(parentStudentLinks.parentId, auth.parentId));

  return NextResponse.json({ links });
}

export async function POST(request: Request) {
  const auth = await requireParent();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as { studentEmail?: string; relationship?: string };
  const studentEmail = (body.studentEmail ?? "").trim().toLowerCase();
  const relationship = (body.relationship ?? "guardian").trim();

  if (!studentEmail) {
    return NextResponse.json({ error: "studentEmail is required" }, { status: 400 });
  }

  const studentRows = await db
    .select({ studentId: students.id })
    .from(students)
    .innerJoin(profiles, eq(profiles.id, students.id))
    .where(and(eq(profiles.email, studentEmail), eq(profiles.accountType, "student")));

  if (studentRows.length === 0) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  await db
    .insert(parentStudentLinks)
    .values({
      parentId: auth.parentId,
      studentId: studentRows[0].studentId,
      relationship: relationship.length > 0 ? relationship : "guardian",
    })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true });
}
