import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { students } from "@/db/schema";
import { getServerUser } from "@/lib/supabase/server";
import { StudentInviteCode } from "@/components/StudentInviteCode";

export const dynamic = "force-dynamic";

export default async function ConsentPendingPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  // Check if this student actually needs consent
  const rows = await db
    .select({
      dateOfBirth: students.dateOfBirth,
      consentGrantedAt: students.consentGrantedAt,
    })
    .from(students)
    .where(eq(students.id, user.id));

  if (rows.length === 0) redirect("/onboarding");

  const student = rows[0];

  // If consent already granted, send to dashboard
  if (student.consentGrantedAt) redirect("/dashboard");

  // Calculate age
  const dob = new Date(student.dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  if (
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())
  ) {
    age--;
  }

  // If 13+, no consent needed
  if (age >= 13) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="mb-4 text-2xl font-bold">Parental Consent Required</h1>

      <div className="rounded-lg border border-amber-700 bg-amber-950/50 p-6 text-left">
        <p className="mb-4 text-slate-200">
          Because you&apos;re under 13, a parent or guardian must link their
          account to yours before you can use Director of Studies.
        </p>

        <h2 className="mb-2 text-lg font-semibold">How it works</h2>
        <ol className="mb-6 list-inside list-decimal space-y-2 text-sm text-slate-300">
          <li>Generate an invite code below.</li>
          <li>Share it with your parent or guardian.</li>
          <li>
            They sign up at Director of Studies, choose &quot;Parent /
            Guardian&quot; and enter your code.
          </li>
          <li>Once linked, this page will let you continue automatically.</li>
        </ol>

        <StudentInviteCode />
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Already linked?{" "}
        <a href="/auth/consent-pending" className="underline hover:text-slate-300">
          Refresh this page
        </a>{" "}
        to check.
      </p>
    </main>
  );
}
