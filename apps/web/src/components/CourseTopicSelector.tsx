"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Topic = { id: number; name: string; courseId: number };
type Course = { id: number; name: string };

type DefaultModels = {
  agentOpenAI: string;
  summaryOpenAI: string;
  deepgramStt: string;
  deepgramTts: string;
  silenceNudgeAfterS: number;
};

const AGENT_LLM_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o3-mini"] as const;
const DEEPGRAM_STT_MODELS = ["flux-general-en", "nova-3", "nova-2"] as const;
const DEEPGRAM_TTS_MODELS = [
  "aura-2-draco-en",
  "aura-2-thalia-en",
  "aura-2-andromeda-en",
  "aura-2-luna-en",
  "aura-2-helios-en",
  "aura-2-orion-en",
  "aura-2-stella-en",
  "aura-2-asteria-en",
] as const;

const selectClass = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200 text-sm";
const labelClass = "mb-1 block text-xs text-slate-400";

export function CourseTopicSelector({
  courses,
  topics,
  defaultModels,
  tutorNameByCourseId = {},
}: {
  courses: Course[];
  topics: Topic[];
  defaultModels: DefaultModels;
  tutorNameByCourseId?: Record<number, string | null>;
}) {
  const router = useRouter();
  const [courseId, setCourseId] = useState<number>(courses[0]?.id ?? 1);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [agentOpenAI, setAgentOpenAI] = useState(defaultModels.agentOpenAI);
  const [deepgramStt, setDeepgramStt] = useState(defaultModels.deepgramStt);
  const [deepgramTts, setDeepgramTts] = useState(defaultModels.deepgramTts);
  const [silenceNudgeAfterS, setSilenceNudgeAfterS] = useState(defaultModels.silenceNudgeAfterS);

  const filteredTopics = useMemo(() => topics.filter((t) => t.courseId === courseId), [topics, courseId]);
  const selectedTopicId = topicId ?? filteredTopics[0]?.id;

  async function joinCall() {
    if (!selectedTopicId) return;
    setLoading(true);
    setError(null);
    try {
      const createRes = await fetch("/api/session/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, topicId: selectedTopicId }),
      });
      if (!createRes.ok) throw new Error("Could not create session");
      const session = await createRes.json();

      const startRes = await fetch("/api/session/start-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          agentOpenAIModel: agentOpenAI,
          deepgramSttModel: deepgramStt,
          deepgramTtsModel: deepgramTts,
          silenceNudgeAfterS,
        }),
      });
      if (!startRes.ok) {
        let message = "Could not start agent";
        try {
          const body = (await startRes.json()) as { error?: string };
          if (typeof body.error === "string" && body.error.length > 0) message = body.error;
        } catch {
          // keep default message when response body is not JSON
        }
        throw new Error(message);
      }
      router.push(`/call/${session.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Model settings */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Model Settings</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Agent LLM</label>
            <select className={selectClass} value={agentOpenAI} onChange={(e) => setAgentOpenAI(e.target.value)}>
              {AGENT_LLM_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Summary LLM</label>
            <input
              readOnly
              className={`${selectClass} cursor-default opacity-60`}
              value={defaultModels.summaryOpenAI}
              title="Configured via SUMMARY_OPENAI_MODEL env var"
            />
          </div>
          <div>
            <label className={labelClass}>Speech-to-Text</label>
            <select className={selectClass} value={deepgramStt} onChange={(e) => setDeepgramStt(e.target.value)}>
              {DEEPGRAM_STT_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Text-to-Speech</label>
            <select className={selectClass} value={deepgramTts} onChange={(e) => setDeepgramTts(e.target.value)}>
              {DEEPGRAM_TTS_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Silence nudge delay (seconds)</label>
            <input
              type="number"
              min={1}
              max={30}
              step={0.5}
              className={selectClass}
              value={silenceNudgeAfterS}
              onChange={(e) => setSilenceNudgeAfterS(Number(e.target.value))}
            />
          </div>
        </div>
      </section>

      {/* Course / topic */}
      <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6">
        <div>
          <label className="mb-2 block text-sm font-medium">Course</label>
          <select
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={courseId}
            onChange={(event) => {
              const nextCourseId = Number(event.target.value);
              setCourseId(nextCourseId);
              const firstTopic = topics.find((t) => t.courseId === nextCourseId);
              setTopicId(firstTopic?.id ?? null);
            }}
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">Topic</label>
          <select
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={selectedTopicId}
            onChange={(event) => setTopicId(Number(event.target.value))}
          >
            {filteredTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>{topic.name}</option>
            ))}
          </select>
        </div>
        {/* Tutor for this call */}
        <div className="rounded-md border border-slate-700 bg-slate-950 px-4 py-3 text-sm">
          <span className="text-slate-400">Tutor: </span>
          {tutorNameByCourseId[courseId] ? (
            <span className="font-medium text-slate-200">{tutorNameByCourseId[courseId]}</span>
          ) : (
            <span className="italic text-slate-500">none configured — will use default settings</span>
          )}
          <a href="/settings/tutors" className="ml-3 text-xs text-sky-400 hover:underline">
            Edit tutor settings →
          </a>
        </div>
        <button
          onClick={joinCall}
          disabled={loading || !selectedTopicId}
          className="rounded-md bg-sky-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {loading ? "Starting..." : "Join Call"}
        </button>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}
