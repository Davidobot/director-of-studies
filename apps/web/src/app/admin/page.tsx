import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/server";
import { getStudentContext } from "@/lib/student";
import { AdminDashboard } from "./AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  const context = await getStudentContext(user.id);
  if (!context || context.accountType !== "admin") {
    redirect("/");
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
      <AdminDashboard />
    </main>
  );
}
