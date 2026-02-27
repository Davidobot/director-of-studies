"use client";

import { useEffect, useState } from "react";

type LinkedStudent = {
  studentId: string;
  studentName: string;
  studentEmail: string;
  relationship: string | null;
};

type Restriction = {
  maxDailyMinutes: number | null;
  maxWeeklyMinutes: number | null;
  blockedTimes: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
};

export function ParentRestrictionsManager() {
  const [students, setStudents] = useState<LinkedStudent[]>([]);
  const [studentId, setStudentId] = useState<string>("");
  const [maxDailyMinutes, setMaxDailyMinutes] = useState<number>(60);
  const [maxWeeklyMinutes, setMaxWeeklyMinutes] = useState<number>(300);
  const [blockedDay, setBlockedDay] = useState<number>(0);
  const [blockedStart, setBlockedStart] = useState("20:00");
  const [blockedEnd, setBlockedEnd] = useState("23:00");
  const [mandatoryConcept, setMandatoryConcept] = useState("");
  const [mandatoryReason, setMandatoryReason] = useState("");
  const [mandatoryEnrolmentId, setMandatoryEnrolmentId] = useState<number>(1);
  const [message, setMessage] = useState<string | null>(null);

  async function loadStudents() {
    const res = await fetch("/api/parent/links");
    if (!res.ok) {
      setMessage("Could not load linked students.");
      return;
    }

    const data = (await res.json()) as { links: LinkedStudent[] };
    setStudents(data.links);
    if (data.links.length > 0) setStudentId(data.links[0].studentId);
  }

  useEffect(() => {
    void loadStudents();
  }, []);

  async function save() {
    if (!studentId) {
      setMessage("Select a student first.");
      return;
    }

    const payload = {
      studentId,
      maxDailyMinutes,
      maxWeeklyMinutes,
      blockedTimes: [{ dayOfWeek: blockedDay, startTime: blockedStart, endTime: blockedEnd }],
      mandatoryRevision: mandatoryConcept
        ? [{ enrolmentId: mandatoryEnrolmentId, concept: mandatoryConcept, reason: mandatoryReason || "Parent assigned revision" }]
        : [],
    };

    const res = await fetch("/api/parent/restrictions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      setMessage("Failed to save restrictions.");
      return;
    }

    setMessage("Restrictions saved.");
  }

  return (
    <div className="space-y-4">
      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Parent controls</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Linked student</label>
            <select className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2" value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              {students.map((student) => (
                <option key={student.studentId} value={student.studentId}>{student.studentName} ({student.studentEmail})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Max daily tutorial minutes</label>
            <input type="number" className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2" value={maxDailyMinutes} onChange={(event) => setMaxDailyMinutes(Number(event.target.value))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Max weekly tutorial minutes</label>
            <input type="number" className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2" value={maxWeeklyMinutes} onChange={(event) => setMaxWeeklyMinutes(Number(event.target.value))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Blocked day of week (0=Sun)</label>
            <input type="number" min={0} max={6} className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2" value={blockedDay} onChange={(event) => setBlockedDay(Number(event.target.value))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Blocked from</label>
            <input type="time" className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2" value={blockedStart} onChange={(event) => setBlockedStart(event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Blocked to</label>
            <input type="time" className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2" value={blockedEnd} onChange={(event) => setBlockedEnd(event.target.value)} />
          </div>
        </div>
      </section>

      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-2 text-lg font-semibold">Assign mandatory revision</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="number"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={mandatoryEnrolmentId}
            onChange={(event) => setMandatoryEnrolmentId(Number(event.target.value))}
            placeholder="Enrolment ID"
          />
          <input
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={mandatoryConcept}
            onChange={(event) => setMandatoryConcept(event.target.value)}
            placeholder="Concept"
          />
          <input
            className="sm:col-span-2 rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={mandatoryReason}
            onChange={(event) => setMandatoryReason(event.target.value)}
            placeholder="Reason"
          />
        </div>
      </section>

      <button className="rounded-md bg-sky-600 px-4 py-2 text-white" onClick={() => void save()}>Save controls</button>
      {message ? <p className="text-sm text-slate-300">{message}</p> : null}
    </div>
  );
}
