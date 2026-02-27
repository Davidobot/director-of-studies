import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, students } from "@/db/schema";
import { getServerUser } from "@/lib/supabase/server";
import { EnrolmentWizard } from "@/components/EnrolmentWizard";

export const dynamic = "force-dynamic";

export default async function SubjectOnboardingPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  const profileRows = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (profileRows.length === 0) redirect("/onboarding");
  if (profileRows[0].accountType !== "student") redirect("/");

  const studentRows = await db.select({ id: students.id }).from(students).where(eq(students.id, user.id));
  if (studentRows.length === 0) redirect("/onboarding");

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Choose your subjects</h1>
      <p className="text-slate-300">Add each subject you are taking, including supercurricular strands where relevant.</p>
      <EnrolmentWizard />
    </main>
  );
}
