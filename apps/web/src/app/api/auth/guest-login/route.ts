import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { boardSubjects, profiles, studentEnrolments, students } from "@/db/schema";

export const dynamic = "force-dynamic";

const GUEST_EMAIL = process.env.GUEST_DEMO_EMAIL ?? "guest@director.local";
const GUEST_PASSWORD = process.env.GUEST_DEMO_PASSWORD ?? "GuestDemo123!";
const GUEST_DISPLAY_NAME = process.env.GUEST_DEMO_NAME ?? "Guest Student";

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function ensureGuestAuthUser() {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Supabase admin config missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const { data: usersData, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listError) throw listError;

  const existing = usersData.users.find((user) => (user.email ?? "").toLowerCase() === GUEST_EMAIL.toLowerCase());

  if (existing) {
    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
      password: GUEST_PASSWORD,
      email_confirm: true,
      user_metadata: {
        displayName: GUEST_DISPLAY_NAME,
        accountType: "student",
        isDemo: true,
      },
    });

    if (updateError) throw updateError;
    return updated.user;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: GUEST_EMAIL,
    password: GUEST_PASSWORD,
    email_confirm: true,
    user_metadata: {
      displayName: GUEST_DISPLAY_NAME,
      accountType: "student",
      isDemo: true,
    },
  });

  if (createError) throw createError;
  if (!created.user) throw new Error("Failed to create guest user");
  return created.user;
}

async function ensureGuestProfileAndEnrolment(userId: string) {
  await db
    .insert(profiles)
    .values({
      id: userId,
      accountType: "student",
      displayName: GUEST_DISPLAY_NAME,
      email: GUEST_EMAIL,
      country: "GB",
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        accountType: "student",
        displayName: GUEST_DISPLAY_NAME,
        email: GUEST_EMAIL,
        country: "GB",
        updatedAt: new Date(),
      },
    });

  await db
    .insert(students)
    .values({
      id: userId,
      dateOfBirth: "2010-09-01",
      schoolYear: 10,
    })
    .onConflictDoUpdate({
      target: students.id,
      set: {
        dateOfBirth: "2010-09-01",
        schoolYear: 10,
      },
    });

  const existingEnrolments = await db.select({ id: studentEnrolments.id }).from(studentEnrolments).where(eq(studentEnrolments.studentId, userId));
  if (existingEnrolments.length > 0) return;

  const firstBoardSubject = await db
    .select({ id: boardSubjects.id })
    .from(boardSubjects)
    .orderBy(desc(boardSubjects.id))
    .limit(1);

  if (firstBoardSubject.length === 0) return;

  await db.insert(studentEnrolments).values({
    studentId: userId,
    boardSubjectId: firstBoardSubject[0].id,
    examYear: new Date().getFullYear() + 1,
    currentYearOfStudy: 1,
  });
}

export async function POST() {
  try {
    const user = await ensureGuestAuthUser();
    await ensureGuestProfileAndEnrolment(user.id);

    return NextResponse.json({
      email: GUEST_EMAIL,
      password: GUEST_PASSWORD,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare guest account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
