import { redirect } from "next/navigation";
import { db } from "@/db";
import { and, eq } from "drizzle-orm";
import { parentStudentLinks, parents, profiles, studentInviteCodes, students } from "@/db/schema";
import { getServerUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function saveProfile(formData: FormData) {
  "use server";

  const user = await getServerUser();
  if (!user) redirect("/login");

  const accountType = (formData.get("accountType") as string) === "parent" ? "parent" : "student";
  const displayName = (formData.get("displayName") as string) || user.user_metadata.displayName || user.email || "";
  const country = "GB";

  await db
    .insert(profiles)
    .values({
      id: user.id,
      accountType,
      displayName,
      email: user.email ?? "",
      country,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        accountType,
        displayName,
        email: user.email ?? "",
        country,
        updatedAt: new Date(),
      },
    });

  if (accountType === "student") {
    const dateOfBirth = formData.get("dateOfBirth") as string;
    const schoolYearRaw = formData.get("schoolYear") as string;
    const schoolYear = Number(schoolYearRaw);

    if (!dateOfBirth || Number.isNaN(schoolYear) || schoolYear < 7 || schoolYear > 13) {
      redirect("/onboarding?error=Please+provide+valid+student+details");
    }

    await db
      .insert(students)
      .values({
        id: user.id,
        dateOfBirth,
        schoolYear,
      })
      .onConflictDoUpdate({
        target: students.id,
        set: {
          dateOfBirth,
          schoolYear,
        },
      });

    // Check age — if under 13, require parental consent before proceeding
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) {
      age--;
    }

    if (age < 13) {
      redirect("/auth/consent-pending");
    }

    redirect("/onboarding/subjects");
  } else {
    const inviteCode = ((formData.get("inviteCode") as string) ?? "").trim().toUpperCase();
    const studentEmail = ((formData.get("studentEmail") as string) ?? "").trim().toLowerCase();
    const relationship = ((formData.get("relationship") as string) ?? "guardian").trim();

    await db
      .insert(parents)
      .values({
        id: user.id,
      })
      .onConflictDoNothing();

    if (inviteCode.length > 0) {
      const inviteRows = await db
        .select({ id: studentInviteCodes.id, studentId: studentInviteCodes.studentId, expiresAt: studentInviteCodes.expiresAt })
        .from(studentInviteCodes)
        .where(eq(studentInviteCodes.code, inviteCode));

      if (inviteRows.length === 0) {
        redirect("/onboarding?accountType=parent&error=Invalid+invite+code");
      }

      const invite = inviteRows[0];
      if (invite.expiresAt <= new Date()) {
        redirect("/onboarding?accountType=parent&error=Invite+code+expired");
      }

      await db
        .insert(parentStudentLinks)
        .values({
          parentId: user.id,
          studentId: invite.studentId,
          relationship: relationship.length > 0 ? relationship : "guardian",
        })
        .onConflictDoNothing();

      await db.update(studentInviteCodes).set({ usedAt: new Date() }).where(eq(studentInviteCodes.id, invite.id));
    } else if (studentEmail.length > 0) {
      const matchedStudent = await db
        .select({ studentId: students.id })
        .from(students)
        .innerJoin(profiles, eq(profiles.id, students.id))
        .where(and(eq(profiles.email, studentEmail), eq(profiles.accountType, "student")));

      if (matchedStudent.length === 0) {
        redirect("/onboarding?accountType=parent&error=No+student+account+found+for+that+email");
      }

      await db
        .insert(parentStudentLinks)
        .values({
          parentId: user.id,
          studentId: matchedStudent[0].studentId,
          relationship: relationship.length > 0 ? relationship : "guardian",
        })
        .onConflictDoNothing();
    }
  }

  redirect("/");
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { accountType?: string; error?: string };
}) {
  const user = await getServerUser();
  if (!user) redirect("/login");

  const profileRow = await db.select().from(profiles).where(eq(profiles.id, user.id));
  const studentRow = await db.select({ id: students.id }).from(students).where(eq(students.id, user.id));

  if (profileRow.length > 0 && (profileRow[0].accountType === "parent" || studentRow.length > 0)) {
    redirect("/");
  }

  const initialType = searchParams.accountType === "parent" ? "parent" : "student";

  return (
    <main className="mx-auto max-w-md space-y-4">
      <form action={saveProfile} className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold">Complete your profile</h2>

        <div>
          <label className="mb-1 block text-xs text-slate-400">Account type</label>
          <select
            name="accountType"
            defaultValue={initialType}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          >
            <option value="student">Student</option>
            <option value="parent">Parent / Guardian</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">Display name</label>
          <input
            name="displayName"
            defaultValue={user.user_metadata.displayName || ""}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">Date of birth (students)</label>
          <input name="dateOfBirth" type="date" className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2" />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">School year (UK Years 7-13, students)</label>
          <input
            name="schoolYear"
            type="number"
            min={7}
            max={13}
            defaultValue={10}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">Student invite code (parents/guardians)</label>
          <input
            name="inviteCode"
            placeholder="ABC123"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">Student email (parents/guardians)</label>
          <input
            name="studentEmail"
            type="email"
            placeholder="student@example.com"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">Relationship (parents/guardians)</label>
          <input
            name="relationship"
            placeholder="mother / father / guardian"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
        </div>

        <button className="rounded-md bg-sky-600 px-4 py-2 font-medium text-white">Save and continue</button>

        {searchParams.error ? <p className="text-sm text-red-400">{searchParams.error}</p> : null}
      </form>
    </main>
  );
}
