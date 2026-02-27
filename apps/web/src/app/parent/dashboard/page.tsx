import { redirect } from "next/navigation";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { boardSubjects, parentStudentLinks, profiles, progressSnapshots, repeatFlags, scheduledTutorials, studentEnrolments, subjects } from "@/db/schema";
import { getServerUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ParentDashboardPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  const profile = await db.select({ accountType: profiles.accountType }).from(profiles).where(eq(profiles.id, user.id));
  if (profile.length === 0) redirect("/onboarding");
  if (profile[0].accountType !== "parent") redirect("/");

  const linkedStudents = await db
    .select({
      studentId: parentStudentLinks.studentId,
      studentName: profiles.displayName,
      studentEmail: profiles.email,
      relationship: parentStudentLinks.relationship,
    })
    .from(parentStudentLinks)
    .innerJoin(profiles, eq(profiles.id, parentStudentLinks.studentId))
    .where(eq(parentStudentLinks.parentId, user.id));

  const studentIds = linkedStudents.map((row) => row.studentId);

  const repeats = studentIds.length
    ? await db
        .select({
          studentId: repeatFlags.studentId,
          concept: repeatFlags.concept,
          reason: repeatFlags.reason,
          priority: repeatFlags.priority,
        })
        .from(repeatFlags)
        .where(and(eq(repeatFlags.status, "active"), inArray(repeatFlags.studentId, studentIds)))
        .orderBy(desc(repeatFlags.flaggedAt))
    : [];

  const upcoming = studentIds.length
    ? await db
        .select({
          studentId: scheduledTutorials.studentId,
          title: scheduledTutorials.title,
          scheduledAt: scheduledTutorials.scheduledAt,
        })
        .from(scheduledTutorials)
        .where(and(eq(scheduledTutorials.status, "scheduled"), inArray(scheduledTutorials.studentId, studentIds)))
        .orderBy(scheduledTutorials.scheduledAt)
        .limit(20)
    : [];

  const confidence = studentIds.length
    ? await db
        .select({
          studentId: progressSnapshots.studentId,
          subjectName: subjects.name,
          level: subjects.level,
          score: progressSnapshots.confidenceScore,
        })
        .from(progressSnapshots)
        .innerJoin(studentEnrolments, eq(studentEnrolments.id, progressSnapshots.enrolmentId))
        .innerJoin(boardSubjects, eq(boardSubjects.id, studentEnrolments.boardSubjectId))
        .innerJoin(subjects, eq(subjects.id, boardSubjects.subjectId))
        .where(inArray(progressSnapshots.studentId, studentIds))
        .orderBy(desc(progressSnapshots.generatedAt))
        .limit(50)
    : [];

  return (
    <main className="space-y-4">
      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <h1 className="text-2xl font-semibold">Parent / Guardian dashboard</h1>
        <p className="text-slate-300">Monitor linked students and set study restrictions/tasks.</p>
        <div className="mt-3 flex gap-2">
          <Link href="/parent/settings" className="rounded-md bg-sky-600 px-3 py-2 text-sm text-white">Parent controls</Link>
        </div>
      </section>

      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Linked students</h2>
        {linkedStudents.length === 0 ? (
          <p className="text-sm text-slate-400">No linked students yet. Use onboarding or parent settings to link by student email.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {linkedStudents.map((student) => (
              <li key={student.studentId} className="rounded border border-slate-800 p-2">
                <p className="font-medium">{student.studentName}</p>
                <p className="text-slate-400">{student.studentEmail} · {student.relationship ?? "guardian"}</p>
                <div className="mt-2 space-y-1 text-xs text-slate-300">
                  {confidence
                    .filter((item) => item.studentId === student.studentId)
                    .slice(0, 3)
                    .map((item, idx) => (
                      <p key={`${student.studentId}-confidence-${idx}`}>
                        {item.subjectName} ({item.level}) confidence: {(Number(item.score) * 100).toFixed(0)}%
                      </p>
                    ))}
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-300">
                  {repeats
                    .filter((item) => item.studentId === student.studentId)
                    .slice(0, 3)
                    .map((item, idx) => (
                      <p key={`${student.studentId}-repeat-${idx}`}>{item.priority}: {item.concept} — {item.reason}</p>
                    ))}
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-300">
                  {upcoming
                    .filter((item) => item.studentId === student.studentId)
                    .slice(0, 2)
                    .map((item, idx) => (
                      <p key={`${student.studentId}-upcoming-${idx}`}>Upcoming: {item.title} at {new Date(item.scheduledAt).toLocaleString()}</p>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
