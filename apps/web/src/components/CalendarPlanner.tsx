"use client";

import { useEffect, useState } from "react";

type CalendarItem = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  status: "scheduled" | "completed" | "cancelled" | "missed";
};

export function CalendarPlanner() {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/calendar");
    if (!res.ok) {
      setMessage("Could not load calendar.");
      return;
    }

    const data = (await res.json()) as { tutorials: CalendarItem[] };
    setItems(data.tutorials);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    if (!title || !scheduledAt) {
      setMessage("Title and date/time are required.");
      return;
    }

    const res = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, scheduledAt, durationMinutes }),
    });

    if (!res.ok) {
      setMessage("Failed to create tutorial schedule.");
      return;
    }

    setTitle("");
    setScheduledAt("");
    setDurationMinutes(30);
    setMessage("Tutorial scheduled.");
    await load();
  }

  async function updateStatus(id: string, status: CalendarItem["status"]) {
    const res = await fetch(`/api/calendar/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      setMessage("Failed to update schedule status.");
      return;
    }

    await load();
  }

  return (
    <div className="space-y-4">
      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Schedule tutorial</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            type="datetime-local"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
          />
          <input
            type="number"
            min={15}
            step={15}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
          />
        </div>
        <button className="mt-3 rounded-md bg-sky-600 px-4 py-2 text-white" onClick={() => void create()}>
          Add tutorial
        </button>
      </section>

      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-2 text-lg font-semibold">Upcoming and recent</h3>
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">No scheduled tutorials yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {items.map((item) => (
              <li key={item.id} className="rounded border border-slate-800 p-2">
                <p className="font-medium">{item.title}</p>
                <p className="text-slate-400">{new Date(item.scheduledAt).toLocaleString()} · {item.durationMinutes} min · {item.status}</p>
                <div className="mt-2 flex gap-2">
                  <button className="rounded border border-slate-700 px-2 py-1" onClick={() => void updateStatus(item.id, "completed")}>Completed</button>
                  <button className="rounded border border-slate-700 px-2 py-1" onClick={() => void updateStatus(item.id, "missed")}>Missed</button>
                  <button className="rounded border border-slate-700 px-2 py-1" onClick={() => void updateStatus(item.id, "cancelled")}>Cancelled</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {message ? <p className="text-sm text-slate-300">{message}</p> : null}
    </div>
  );
}
