import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/server";
import { getStudentContext } from "@/lib/student";
import { CalendarPlanner } from "@/components/CalendarPlanner";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  const context = await getStudentContext(user.id);
  if (!context) redirect("/onboarding");
  if (context.accountType !== "student") redirect("/parent/dashboard");

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Tutorial calendar</h1>
      <p className="text-slate-300">Schedule and manage upcoming tutorial calls.</p>
      <CalendarPlanner />
    </main>
  );
}
