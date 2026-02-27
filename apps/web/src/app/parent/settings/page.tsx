import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getServerUser } from "@/lib/supabase/server";
import { ParentRestrictionsManager } from "@/components/ParentRestrictionsManager";

export const dynamic = "force-dynamic";

export default async function ParentSettingsPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  const profile = await db.select({ accountType: profiles.accountType }).from(profiles).where(eq(profiles.id, user.id));
  if (profile.length === 0) redirect("/onboarding");
  if (profile[0].accountType !== "parent") redirect("/");

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Parent controls</h1>
      <p className="text-slate-300">Set student restrictions and assign mandatory revision tasks.</p>
      <ParentRestrictionsManager />
    </main>
  );
}
