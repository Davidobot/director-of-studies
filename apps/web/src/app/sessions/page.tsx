import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { courses, sessions, topics } from "@/db/schema";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/server";
import { getStudentContext } from "@/lib/student";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  const studentContext = await getStudentContext(user.id);
  if (!studentContext) {
    redirect("/onboarding");
  }

  if (studentContext.accountType === "parent") {
    redirect("/");
  }

  if (!studentContext.studentId) {
    redirect("/onboarding");
  }

  const rows = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      createdAt: sessions.createdAt,
      courseName: courses.name,
      topicName: topics.name,
    })
    .from(sessions)
    .innerJoin(courses, eq(sessions.courseId, courses.id))
    .innerJoin(topics, eq(sessions.topicId, topics.id))
    .where(and(eq(sessions.studentId, studentContext.studentId)))
    .orderBy(desc(sessions.createdAt));

  return (
    <main>
      <h2 className="mb-4 text-xl font-semibold">Session History</h2>
      {rows.length === 0 ? (
        <p className="text-slate-400">No sessions yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Link key={row.id} href={`/sessions/${row.id}`} className="block rounded border border-slate-800 bg-slate-900 p-4">
              <p className="font-medium">{row.courseName} — {row.topicName}</p>
              <p className="text-sm text-slate-400">{row.status} · {row.createdAt?.toISOString()}</p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
