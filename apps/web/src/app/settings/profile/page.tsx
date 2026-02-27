import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, students } from "@/db/schema";
import { getServerUser } from "@/lib/supabase/server";
import { StudentInviteCode } from "@/components/StudentInviteCode";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function saveProfile(formData: FormData) {
  "use server";
  const { getServerUser: getUser } = await import("@/lib/supabase/server");
  const user = await getUser();
  if (!user) redirect("/login");

  const displayName = ((formData.get("displayName") as string) ?? "").trim();
  if (!displayName) redirect("/settings/profile?error=Display+name+is+required");

  await db
    .update(profiles)
    .set({ displayName, updatedAt: new Date() })
    .where(eq(profiles.id, user.id));

  const profileRow = await db.select({ accountType: profiles.accountType }).from(profiles).where(eq(profiles.id, user.id));
  if (profileRow[0]?.accountType === "student") {
    const dateOfBirth = ((formData.get("dateOfBirth") as string) ?? "").trim();
    const schoolYearRaw = formData.get("schoolYear") as string;
    const schoolYear = Number(schoolYearRaw);

    if (dateOfBirth && !Number.isNaN(schoolYear) && schoolYear >= 7 && schoolYear <= 13) {
      await db
        .update(students)
        .set({ dateOfBirth, schoolYear })
        .where(eq(students.id, user.id));
    }
  }

  redirect("/settings/profile?saved=1");
}

export default async function ProfileSettingsPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string };
}) {
  const user = await getServerUser();
  if (!user) redirect("/login");

  const profileRows = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (profileRows.length === 0) redirect("/onboarding");
  const profile = profileRows[0];

  const studentRows = await db.select().from(students).where(eq(students.id, user.id));
  const student = studentRows[0] ?? null;
  const isStudent = profile.accountType === "student";

  return (
    <main className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Personal settings</h1>

      {searchParams.saved ? (
        <p className="rounded-md border border-emerald-700 bg-emerald-900/40 px-4 py-2 text-sm text-emerald-300">
          Settings saved.
        </p>
      ) : null}
      {searchParams.error ? (
        <p className="rounded-md border border-red-700 bg-red-900/40 px-4 py-2 text-sm text-red-300">
          {searchParams.error}
        </p>
      ) : null}

      {/* Account details */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 text-base font-semibold">Account details</h2>
        <form action={saveProfile} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Email</label>
            <input
              readOnly
              value={user.email ?? ""}
              className="w-full cursor-default rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm opacity-60"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">Display name</label>
            <input
              name="displayName"
              defaultValue={profile.displayName}
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          {isStudent && student ? (
            <>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Date of birth</label>
                <input
                  name="dateOfBirth"
                  type="date"
                  defaultValue={student.dateOfBirth}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">School year (Years 7–13)</label>
                <input
                  name="schoolYear"
                  type="number"
                  min={7}
                  max={13}
                  defaultValue={student.schoolYear}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
            </>
          ) : null}

          <button
            type="submit"
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            Save changes
          </button>
        </form>
      </section>

      {/* Enrolment shortcut */}
      {isStudent ? (
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-1 text-base font-semibold">Subject enrolments</h2>
          <p className="mb-3 text-sm text-slate-400">
            Add or update the subjects you are studying.
          </p>
          <Link
            href="/onboarding/subjects"
            className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
          >
            Manage enrolments →
          </Link>
        </section>
      ) : null}

      {/* Parent link invite code */}
      {isStudent ? <StudentInviteCode /> : null}
    </main>
  );
}
