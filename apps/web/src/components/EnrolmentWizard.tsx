"use client";

import { useEffect, useMemo, useState } from "react";

type BoardSubject = {
  boardSubjectId: number;
  boardCode: string | null;
  boardName: string | null;
  subjectName: string;
  level: string;
  category: "academic" | "supercurricular";
  syllabusCode: string | null;
};

type Enrolment = {
  enrolmentId: number;
  boardSubjectId: number;
  examYear: number;
  currentYearOfStudy: number;
  subjectName: string;
  level: string;
  category: string;
  boardCode: string | null;
  boardName: string | null;
};

export function EnrolmentWizard() {
  const [referenceRows, setReferenceRows] = useState<BoardSubject[]>([]);
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [boardSubjectId, setBoardSubjectId] = useState<number | null>(null);
  const [examYear, setExamYear] = useState<number>(new Date().getFullYear() + 1);
  const [currentYearOfStudy, setCurrentYearOfStudy] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sortedOptions = useMemo(
    () =>
      referenceRows.map((row) => ({
        ...row,
        label: `${row.subjectName} (${row.level})${row.boardCode ? ` — ${row.boardCode}` : " — Supercurricular"}`,
      })),
    [referenceRows]
  );

  async function loadData() {
    const [refRes, enrolRes] = await Promise.all([
      fetch("/api/reference/board-subjects"),
      fetch("/api/student/enrolments"),
    ]);

    if (!refRes.ok || !enrolRes.ok) {
      setMessage("Could not load enrolment data.");
      return;
    }

    const refData = (await refRes.json()) as { boardSubjects: BoardSubject[] };
    const enrolData = (await enrolRes.json()) as { enrolments: Enrolment[] };

    setReferenceRows(refData.boardSubjects);
    setEnrolments(enrolData.enrolments);
    if (refData.boardSubjects.length > 0 && boardSubjectId === null) {
      setBoardSubjectId(refData.boardSubjects[0].boardSubjectId);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function addEnrolment() {
    if (!boardSubjectId) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/student/enrolments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardSubjectId, examYear, currentYearOfStudy }),
      });
      if (!res.ok) throw new Error("Failed to save enrolment");
      await loadData();
      setMessage("Enrolment saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  async function removeEnrolment(enrolmentId: number) {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/student/enrolments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrolmentId }),
      });
      if (!res.ok) throw new Error("Failed to remove enrolment");
      await loadData();
      setMessage("Enrolment removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-3 text-lg font-semibold">Subjects and exam boards</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-slate-400">Subject + board</label>
            <select
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              value={boardSubjectId ?? ""}
              onChange={(event) => setBoardSubjectId(Number(event.target.value))}
            >
              {sortedOptions.map((option) => (
                <option key={option.boardSubjectId} value={option.boardSubjectId}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Exam year</label>
            <input
              type="number"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              value={examYear}
              onChange={(event) => setExamYear(Number(event.target.value))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Current year of study</label>
            <input
              type="number"
              min={1}
              max={3}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              value={currentYearOfStudy}
              onChange={(event) => setCurrentYearOfStudy(Number(event.target.value))}
            />
          </div>
        </div>
        <button
          onClick={addEnrolment}
          disabled={loading || !boardSubjectId}
          className="mt-3 rounded-md bg-sky-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Saving..." : "Add / Update enrolment"}
        </button>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-2 text-sm font-semibold">Current enrolments</h3>
        {enrolments.length === 0 ? (
          <p className="text-sm text-slate-400">No enrolments yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {enrolments.map((enrolment) => (
              <li key={enrolment.enrolmentId} className="flex items-center justify-between rounded border border-slate-800 p-2">
                <div>
                  <p className="font-medium">
                    {enrolment.subjectName} ({enrolment.level}) {enrolment.boardCode ? `— ${enrolment.boardCode}` : "— Supercurricular"}
                  </p>
                  <p className="text-slate-400">
                    Exam year: {enrolment.examYear} · Year of study: {enrolment.currentYearOfStudy}
                  </p>
                </div>
                <button className="text-red-300 hover:text-red-200" onClick={() => removeEnrolment(enrolment.enrolmentId)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {message ? <p className="text-sm text-slate-300">{message}</p> : null}
    </div>
  );
}
