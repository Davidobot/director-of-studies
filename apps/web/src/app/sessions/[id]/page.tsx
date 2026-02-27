import ReactMarkdown from "react-markdown";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courses, sessionSummaries, sessionTranscripts, sessions, topics } from "@/db/schema";

export const dynamic = "force-dynamic";

// Polls until the summary is ready. Used when the user navigates to the
// session page immediately after ending a call (summarisation is async).
function SummaryPending() {
  return (
    <>
      {/* Refresh the server component every 3 seconds until summary arrives */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <meta httpEquiv="refresh" content="3" />
      <p className="text-slate-400">Generating summary…</p>
    </>
  );
}

export default async function SessionDetailPage({ params }: { params: { id: string } }) {
  const rows = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      createdAt: sessions.createdAt,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      courseName: courses.name,
      topicName: topics.name,
      transcriptJson: sessionTranscripts.transcriptJson,
      transcriptText: sessionTranscripts.transcriptText,
      summaryMd: sessionSummaries.summaryMd,
      keyTakeawaysJson: sessionSummaries.keyTakeawaysJson,
      citationsJson: sessionSummaries.citationsJson,
    })
    .from(sessions)
    .innerJoin(courses, eq(sessions.courseId, courses.id))
    .innerJoin(topics, eq(sessions.topicId, topics.id))
    .leftJoin(sessionTranscripts, eq(sessionTranscripts.sessionId, sessions.id))
    .leftJoin(sessionSummaries, eq(sessionSummaries.sessionId, sessions.id))
    .where(eq(sessions.id, params.id));

  const session = rows[0];

  if (!session) {
    return <p>Session not found.</p>;
  }

  const transcript = (session.transcriptJson as Array<{ speaker: string; text: string; timestamp: string }> | null) ?? [];
  const takeaways = (session.keyTakeawaysJson as string[] | null) ?? [];
  const citations = (session.citationsJson as string[] | null) ?? [];

  return (
    <main className="space-y-6">
      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-xl font-semibold">{session.courseName} — {session.topicName}</h2>
        <p className="text-sm text-slate-400">Status: {session.status}</p>
      </section>

      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-2 text-lg font-semibold">Transcript</h3>
        {transcript.length === 0 ? (
          <p className="text-slate-400">No transcript yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {transcript.map((item, idx) => (
              <li key={`${item.timestamp}-${idx}`}>
                <span className="font-medium text-sky-300">{item.speaker}</span>
                <span className="text-slate-500"> [{new Date(item.timestamp).toLocaleTimeString()}]</span>
                <p>{item.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-2 text-lg font-semibold">Student Performance</h3>
        {session.summaryMd ? (
          <ReactMarkdown>{session.summaryMd}</ReactMarkdown>
        ) : session.status === "ended" ? (
          <SummaryPending />
        ) : (
          <p className="text-slate-400">No summary available.</p>
        )}
        {takeaways.length > 0 && (
          <>
            <h4 className="mt-4 font-semibold">Topics covered</h4>
            <ul className="list-disc pl-6">
              {takeaways.map((takeaway, idx) => (
                <li key={`${takeaway}-${idx}`}>{takeaway}</li>
              ))}
            </ul>
          </>
        )}
        {citations.length > 0 && (
          <>
            <h4 className="mt-4 font-semibold">Study recommendations</h4>
            <ul className="list-disc pl-6">
              {citations.map((citation, idx) => (
                <li key={`${citation}-${idx}`}>{citation}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
