import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/server";
import { getStudentContext } from "@/lib/student";
import { TutorConfigManager } from "@/components/TutorConfigManager";

export const dynamic = "force-dynamic";

export default async function TutorSettingsPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  const student = await getStudentContext(user.id);
  if (!student) redirect("/onboarding");
  if (student.accountType !== "student") redirect("/");

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Subject tutor settings</h1>
      <p className="text-slate-300">Set tutor voice and personality per subject.</p>
      <TutorConfigManager />
    </main>
  );
}
