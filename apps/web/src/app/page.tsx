import { db } from "@/db";
import { courses, topics } from "@/db/schema";
import { CourseTopicSelector } from "@/components/CourseTopicSelector";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const allCourses = await db.select().from(courses);
  const allTopics = await db.select().from(topics);
  const defaultModels = {
    agentOpenAI: process.env.AGENT_OPENAI_MODEL ?? "gpt-4o",
    summaryOpenAI: process.env.SUMMARY_OPENAI_MODEL ?? "gpt-4o-mini",
    deepgramStt: process.env.DEEPGRAM_STT_MODEL ?? "flux-general-en",
    deepgramTts: process.env.DEEPGRAM_TTS_MODEL ?? "aura-2-draco-en",
    silenceNudgeAfterS: parseFloat(process.env.SILENCE_NUDGE_AFTER_S ?? "3.0"),
  };

  return (
    <main className="space-y-4">
      <p className="text-slate-300">Select your course and topic, then join a live tutoring call.</p>
      <CourseTopicSelector courses={allCourses} topics={allTopics} defaultModels={defaultModels} />
    </main>
  );
}
