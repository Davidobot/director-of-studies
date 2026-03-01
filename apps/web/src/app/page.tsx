import { db } from "@/db";
import { boardSubjects, courses, studentEnrolments, topics, tutorConfigs, tutorPersonas } from "@/db/schema";
import { CourseTopicSelector } from "@/components/CourseTopicSelector";
import { FeedbackButton } from "@/components/FeedbackButton";
import { getServerUser } from "@/lib/supabase/server";
import { getStudentContext } from "@/lib/student";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
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

  // Build courseId → enrolmentId map so we can look up the matching tutor config
  const courseEnrolmentMap = new Map<number, number>();
  for (const course of filteredCourses) {
    const enrolment = enrolmentRows.find((e) => {
      if (course.subjectId !== e.subjectId) return false;
      if (e.examBoardId === null) return true;
      return course.examBoardId === e.examBoardId;
    });
    if (enrolment) courseEnrolmentMap.set(course.id, enrolment.enrolmentId);
  }

  const allEnrolmentIds = [...courseEnrolmentMap.values()];
  const tutorConfigRows =
    allEnrolmentIds.length > 0
      ? await db
          .select({ enrolmentId: tutorConfigs.enrolmentId, personaName: tutorPersonas.name })
          .from(tutorConfigs)
          .leftJoin(tutorPersonas, eq(tutorPersonas.id, tutorConfigs.personaId))
          .where(
            and(
              eq(tutorConfigs.studentId, studentContext.studentId),
              inArray(tutorConfigs.enrolmentId, allEnrolmentIds),
            ),
          )
      : [];

  const tutorNameByCourseId: Record<number, string | null> = {};
  for (const [courseId, enrolmentId] of courseEnrolmentMap.entries()) {
    const config = tutorConfigRows.find((r) => r.enrolmentId === enrolmentId);
    tutorNameByCourseId[courseId] = config?.personaName ?? null;
  }

  const defaultModels = {
    agentOpenAI: process.env.AGENT_OPENAI_MODEL ?? "gpt-4o",
    summaryOpenAI: process.env.SUMMARY_OPENAI_MODEL ?? "gpt-4o-mini",
    deepgramStt: process.env.DEEPGRAM_STT_MODEL ?? "flux-general-en",
    deepgramTts: process.env.DEEPGRAM_TTS_MODEL ?? "aura-2-draco-en",
    silenceNudgeAfterS: parseFloat(process.env.SILENCE_NUDGE_SHORT_S ?? "3.0"),
  };

  if (filteredCourses.length === 0) {
    return (
      <main className="space-y-4">
        <h2 className="text-xl font-semibold">No courses available</h2>
        <p className="text-slate-300">
          Your enrolled subjects don&apos;t have any course content set up yet. This usually means the
          reference content hasn&apos;t been loaded into the database, or your subjects haven&apos;t
          been matched to course material.
        </p>
        <ul className="list-disc pl-5 text-sm text-slate-400 space-y-1">
          <li>Run <code className="text-sky-400">make seed</code> to load reference courses and topics.</li>
          <li>
            Then go to{" "}
            <Link href="/onboarding/subjects" className="text-sky-400 underline">Subject settings</Link>{" "}
            and make sure your subjects match an available course.
          </li>
        </ul>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <h2 className="text-xl font-semibold">Start a tutoring call</h2>
      <p className="text-slate-300">Select your course and topic, then join a live tutoring call.</p>
      <CourseTopicSelector courses={filteredCourses} topics={filteredTopics} defaultModels={defaultModels} tutorNameByCourseId={tutorNameByCourseId} />

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <p className="mb-2 text-sm text-slate-300">Can&apos;t find your course or subject?</p>
        <FeedbackButton
          feedbackType="course_suggestion"
          buttonLabel="Suggest a course"
          buttonClassName="rounded-md border border-violet-600 px-3 py-2 text-sm text-violet-200 hover:bg-violet-900/40"
        />
      </div>
    </main>
  );
}
