import { db } from "@/db";
import { boardSubjects, courses, studentEnrolments, topics } from "@/db/schema";
import { CourseTopicSelector } from "@/components/CourseTopicSelector";
import { getServerUser } from "@/lib/supabase/server";
import { getStudentContext } from "@/lib/student";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  const studentContext = await getStudentContext(user.id);
  if (!studentContext) {
    redirect("/onboarding");
  }

  if (studentContext.accountType === "parent") {
    return (
      <main className="space-y-4">
        <h2 className="text-xl font-semibold">Parent / Guardian Account</h2>
        <p className="text-slate-300">
          View linked student progress and manage restrictions from the parent dashboard.
        </p>
        <Link href="/parent/dashboard" className="inline-block rounded-md bg-sky-600 px-4 py-2 text-white">
          Open parent dashboard
        </Link>
      </main>
    );
  }

  if (!studentContext.studentId) {
    redirect("/onboarding");
  }

  const enrolmentRows = await db
    .select({
      enrolmentId: studentEnrolments.id,
      subjectId: boardSubjects.subjectId,
      examBoardId: boardSubjects.examBoardId,
    })
    .from(studentEnrolments)
    .innerJoin(boardSubjects, eq(boardSubjects.id, studentEnrolments.boardSubjectId))
    .where(eq(studentEnrolments.studentId, studentContext.studentId));

  if (enrolmentRows.length === 0) {
    redirect("/onboarding/subjects");
  }

  const allowedCourseIds = new Set<number>();

  const allCourses = await db.select().from(courses);
  for (const course of allCourses) {
    const matched = enrolmentRows.some((enrolment) => {
      if (course.subjectId !== enrolment.subjectId) return false;
      if (enrolment.examBoardId === null) return true;
      return course.examBoardId === enrolment.examBoardId;
    });

    if (matched) {
      allowedCourseIds.add(course.id);
    }
  }

  const filteredCourses = allCourses.filter((course) => allowedCourseIds.has(course.id));
  const allTopics = await db.select().from(topics);
  const filteredTopics = allTopics.filter((topic) => allowedCourseIds.has(topic.courseId));
  const defaultModels = {
    agentOpenAI: process.env.AGENT_OPENAI_MODEL ?? "gpt-4o",
    summaryOpenAI: process.env.SUMMARY_OPENAI_MODEL ?? "gpt-4o-mini",
    deepgramStt: process.env.DEEPGRAM_STT_MODEL ?? "flux-general-en",
    deepgramTts: process.env.DEEPGRAM_TTS_MODEL ?? "aura-2-draco-en",
    silenceNudgeAfterS: parseFloat(process.env.SILENCE_NUDGE_AFTER_S ?? "3.0"),
  };

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard" className="rounded-md border border-slate-700 px-3 py-2 text-sm">Dashboard</Link>
        <Link href="/calendar" className="rounded-md border border-slate-700 px-3 py-2 text-sm">Calendar</Link>
        <Link href="/settings/tutors" className="rounded-md border border-slate-700 px-3 py-2 text-sm">Tutor settings</Link>
      </div>
      <p className="text-slate-300">Select your course and topic, then join a live tutoring call.</p>
      <CourseTopicSelector courses={filteredCourses} topics={filteredTopics} defaultModels={defaultModels} />
    </main>
  );
}
