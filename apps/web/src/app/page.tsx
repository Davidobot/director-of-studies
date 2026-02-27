import { db } from "@/db";
import { courses, topics } from "@/db/schema";
import { CourseTopicSelector } from "@/components/CourseTopicSelector";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const allCourses = await db.select().from(courses);
  const allTopics = await db.select().from(topics);
  const models = {
    agentOpenAI: process.env.AGENT_OPENAI_MODEL ?? "gpt-4o",
    summaryOpenAI: process.env.SUMMARY_OPENAI_MODEL ?? "gpt-5-mini",
    deepgramStt: process.env.DEEPGRAM_STT_MODEL ?? "flux",
    deepgramTts: process.env.DEEPGRAM_TTS_MODEL ?? "aura-2",
  };

  return (
    <main className="space-y-4">
      <p className="text-slate-300">Select your course and topic, then join a live tutoring call.</p>
      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-200">Active Models</h2>
        <div className="grid gap-1 text-sm text-slate-300 sm:grid-cols-2">
          <p>Agent LLM: {models.agentOpenAI}</p>
          <p>Summary LLM: {models.summaryOpenAI}</p>
          <p>Speech-to-Text: {models.deepgramStt}</p>
          <p>Text-to-Speech: {models.deepgramTts}</p>
        </div>
      </section>
      <CourseTopicSelector courses={allCourses} topics={allTopics} />
    </main>
  );
}
