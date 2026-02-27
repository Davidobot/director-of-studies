import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, students } from "@/db/schema";

export async function getStudentContext(userId: string) {
  const rows = await db
    .select({
      profileId: profiles.id,
      accountType: profiles.accountType,
      displayName: profiles.displayName,
      studentId: students.id,
      schoolYear: students.schoolYear,
      dateOfBirth: students.dateOfBirth,
    })
    .from(profiles)
    .leftJoin(students, eq(students.id, profiles.id))
    .where(eq(profiles.id, userId));

  const row = rows[0];
  if (!row) return null;
  return row;
}
