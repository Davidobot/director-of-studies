"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Topic = { id: number; name: string; courseId: number };
type Course = { id: number; name: string };

export function CourseTopicSelector({ courses, topics }: { courses: Course[]; topics: Topic[] }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState<number>(courses[0]?.id ?? 1);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredTopics = useMemo(() => topics.filter((topic) => topic.courseId === courseId), [topics, courseId]);

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
        body: JSON.stringify({ sessionId: session.sessionId }),
      });

      if (!startRes.ok) {
        let message = "Could not start agent";

        try {
          const body = (await startRes.json()) as { error?: string };
          if (typeof body.error === "string" && body.error.length > 0) {
            message = body.error;
          }
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
    <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6">
      <div>
        <label className="mb-2 block text-sm font-medium">Course</label>
        <select
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          value={courseId}
          onChange={(event) => {
            const nextCourseId = Number(event.target.value);
            setCourseId(nextCourseId);
            const firstTopic = topics.find((topic) => topic.courseId === nextCourseId);
            setTopicId(firstTopic?.id ?? null);
          }}
        >
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
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
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
        </select>
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
  );
}
