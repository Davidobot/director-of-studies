import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { parents, profiles, students } from "@/db/schema";

export type AuthContext = {
  userId: string;
  email: string | null;
};

export function getRequestAuth(): AuthContext | null {
  const requestHeaders = headers();
  const userId = requestHeaders.get("x-user-id");
  const email = requestHeaders.get("x-user-email");
  if (!userId) return null;
  return { userId, email };
}

export async function requireStudent() {
  const auth = getRequestAuth();
  if (!auth) return { error: "Unauthorized", status: 401 as const };

  const profileRows = await db
    .select({ id: profiles.id, accountType: profiles.accountType })
    .from(profiles)
    .where(eq(profiles.id, auth.userId));

  if (profileRows.length === 0) {
    return { error: "Profile incomplete. Complete onboarding first.", status: 403 as const };
  }

  if (profileRows[0].accountType !== "student") {
    return { error: "Student account required", status: 403 as const };
  }

  const studentRows = await db.select({ id: students.id }).from(students).where(eq(students.id, auth.userId));

  if (studentRows.length === 0) {
    return { error: "Student profile incomplete. Complete onboarding first.", status: 403 as const };
  }

  return { studentId: auth.userId as string };
}

export async function requireParent() {
  const auth = getRequestAuth();
  if (!auth) return { error: "Unauthorized", status: 401 as const };

  const profileRows = await db
    .select({ id: profiles.id, accountType: profiles.accountType })
    .from(profiles)
    .where(eq(profiles.id, auth.userId));

  if (profileRows.length === 0) {
    return { error: "Profile incomplete. Complete onboarding first.", status: 403 as const };
  }

  if (profileRows[0].accountType !== "parent") {
    return { error: "Parent account required", status: 403 as const };
  }

  const parentRows = await db.select({ id: parents.id }).from(parents).where(eq(parents.id, auth.userId));
  if (parentRows.length === 0) {
    return { error: "Parent profile incomplete. Complete onboarding first.", status: 403 as const };
  }

  return { parentId: auth.userId as string };
}
