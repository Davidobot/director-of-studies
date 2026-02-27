import { redirect } from "next/navigation";
import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { getServerUser } from "@/lib/supabase/server";
import { getStudentContext } from "@/lib/student";
import { DoSChat } from "@/components/DoSChat";
import { db } from "@/db";
import { boardSubjects, progressSnapshots, repeatFlags, scheduledTutorials, sessions, studentEnrolments, subjects } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  const student = await getStudentContext(user.id);
  if (!student) redirect("/onboarding");
  if (student.accountType !== "student") redirect("/parent/dashboard");
  if (!student.studentId) redirect("/onboarding");
  const studentId = student.studentId;

  const statsRows = await db
    .select({
      totalSessions: sql<number>`COUNT(*)`,
      sessionsThisWeek: sql<number>`COUNT(*) FILTER (WHERE ${sessions.createdAt} >= NOW() - interval '7 days')`,
    })
    .from(sessions)
    .where(eq(sessions.studentId, studentId));

  const subjectProgress = await db
    .select({
      enrolmentId: studentEnrolments.id,
      subjectName: subjects.name,
      level: subjects.level,
      avgConfidence: sql<number>`COALESCE(AVG((${progressSnapshots.confidenceScore})::numeric), 0)`,
    })
    .from(studentEnrolments)
    .innerJoin(boardSubjects, eq(boardSubjects.id, studentEnrolments.boardSubjectId))
    .innerJoin(subjects, eq(subjects.id, boardSubjects.subjectId))
    .leftJoin(
      progressSnapshots,
      and(eq(progressSnapshots.studentId, studentId), eq(progressSnapshots.enrolmentId, studentEnrolments.id))
    )
    .where(eq(studentEnrolments.studentId, studentId))
    .groupBy(studentEnrolments.id, subjects.name, subjects.level)
    .orderBy(subjects.name);

  const activeRepeatFlags = await db
    .select({
      id: repeatFlags.id,
      concept: repeatFlags.concept,
      reason: repeatFlags.reason,
      priority: repeatFlags.priority,
      subjectName: subjects.name,
    })
    .from(repeatFlags)
    .innerJoin(studentEnrolments, eq(studentEnrolments.id, repeatFlags.enrolmentId))
    .innerJoin(boardSubjects, eq(boardSubjects.id, studentEnrolments.boardSubjectId))
    .innerJoin(subjects, eq(subjects.id, boardSubjects.subjectId))
    .where(and(eq(repeatFlags.studentId, studentId), eq(repeatFlags.status, "active")))
    .orderBy(repeatFlags.priority, desc(repeatFlags.flaggedAt));

  const upcoming = await db
    .select({
      id: scheduledTutorials.id,
      title: scheduledTutorials.title,
      scheduledAt: scheduledTutorials.scheduledAt,
      status: scheduledTutorials.status,
    })
    .from(scheduledTutorials)
    .where(and(eq(scheduledTutorials.studentId, studentId), eq(scheduledTutorials.status, "scheduled")))
    .orderBy(scheduledTutorials.scheduledAt)
    .limit(5);

  const stats = statsRows[0] ?? { totalSessions: 0, sessionsThisWeek: 0 };

  return (
    <main className="space-y-4">
      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <h1 className="text-2xl font-semibold">Director of Studies dashboard</h1>
        <p className="text-slate-300">Track subject momentum, repeat flags, and next tutorial priorities.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className="rounded-md bg-sky-600 px-3 py-2 text-sm text-white" href="/">Start tutorial</Link>
          <Link className="rounded-md border border-slate-700 px-3 py-2 text-sm" href="/calendar">Open calendar</Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-400">Total sessions</p>
          <p className="text-2xl font-semibold">{stats.totalSessions}</p>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-400">Sessions this week</p>
          <p className="text-2xl font-semibold">{stats.sessionsThisWeek}</p>
        </div>
      </section>

      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Subject progress</h2>
        {subjectProgress.length === 0 ? (
          <p className="text-sm text-slate-400">No progress snapshots yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {subjectProgress.map((item) => (
              <li key={item.enrolmentId} className="rounded border border-slate-800 p-2">
                <p className="font-medium">{item.subjectName} ({item.level})</p>
                <p className="text-slate-400">Average confidence: {(Number(item.avgConfidence) * 100).toFixed(0)}%</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Needs repeating</h2>
        {activeRepeatFlags.length === 0 ? (
          <p className="text-sm text-slate-400">No active repeat flags.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {activeRepeatFlags.map((flag) => (
              <li key={flag.id} className="rounded border border-slate-800 p-2">
                <p className="font-medium">{flag.subjectName}: {flag.concept} ({flag.priority})</p>
                <p className="text-slate-400">{flag.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Upcoming tutorials</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-400">No tutorials scheduled yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {upcoming.map((item) => (
              <li key={item.id} className="rounded border border-slate-800 p-2">
                <p className="font-medium">{item.title}</p>
                <p className="text-slate-400">{new Date(item.scheduledAt).toLocaleString()} · {item.status}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DoSChat />
    </main>
  );
}
