"use client";

import { useEffect, useState } from "react";
import { apiFetch, getCurrentUserId } from "@/lib/api-client";

type CalendarItem = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  status: "scheduled" | "completed" | "cancelled" | "missed";
};

const STATUS_COLOURS: Record<CalendarItem["status"], string> = {
  scheduled: "bg-sky-500",
  completed: "bg-emerald-500",
  cancelled: "bg-slate-500",
  missed: "bg-rose-500",
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  // Monday-first: getDay() returns 0=Sun … 6=Sat; convert to 0=Mon … 6=Sun
  const dayOfWeek = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(start.getDate() - dayOfWeek);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return days;
}

export function CalendarPlanner() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await apiFetch("/api/calendar", { userScope: "studentId" });
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
    const userId = await getCurrentUserId();
    const res = await apiFetch("/api/calendar", {
      method: "POST",
      userScope: "studentId",
      body: { title, scheduledAt, durationMinutes, createdBy: userId },
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
    const res = await apiFetch(`/api/calendar/${id}`, {
      method: "PUT",
      userScope: "studentId",
      body: { status },
    });
    if (!res.ok) {
      setMessage("Failed to update schedule status.");
      return;
    }
    await load();
  }

  function prevMonth() {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
    setSelectedDate(null);
  }

  function nextMonth() {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
    setSelectedDate(null);
  }

  // Group items by date key
  const itemsByDate = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const key = toDateKey(new Date(item.scheduledAt));
    if (!itemsByDate.has(key)) itemsByDate.set(key, []);
    itemsByDate.get(key)!.push(item);
  }

  const calDays = buildCalendarDays(currentMonth.getFullYear(), currentMonth.getMonth());
  const todayKey = toDateKey(today);

  const selectedItems = selectedDate ? (itemsByDate.get(selectedDate) ?? []) : [];

  const monthLabel = currentMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      {/* Month navigation */}
      <div className="flex items-center gap-4">
        <button
          onClick={prevMonth}
          className="rounded-md border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800"
        >
          ‹ Prev
        </button>
        <span className="min-w-[160px] text-center text-base font-semibold">{monthLabel}</span>
        <button
          onClick={nextMonth}
          className="rounded-md border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800"
        >
          Next ›
        </button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-2 sm:p-4">
        {/* Weekday headers */}
        <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-slate-500">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-px">
          {calDays.map((day) => {
            const key = toDateKey(day);
            const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
            const isToday = key === todayKey;
            const isSelected = key === selectedDate;
            const dayItems = itemsByDate.get(key) ?? [];

            return (
              <button
                key={key}
                onClick={() => setSelectedDate(isSelected ? null : key)}
                className={[
                  "relative flex min-h-[56px] flex-col rounded-md p-1 text-left transition-colors",
                  isCurrentMonth ? "text-slate-200" : "text-slate-600",
                  isSelected ? "bg-sky-900/60 ring-1 ring-sky-500" : "hover:bg-slate-800",
                  isToday && !isSelected ? "ring-1 ring-sky-600" : "",
                ].join(" ")}
              >
                <span className={`mb-1 text-xs font-medium ${isToday ? "text-sky-400" : ""}`}>
                  {day.getDate()}
                </span>
                <div className="flex flex-wrap gap-0.5">
                  {dayItems.slice(0, 3).map((item) => (
                    <span
                      key={item.id}
                      title={item.title}
                      className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOURS[item.status]}`}
                    />
                  ))}
                  {dayItems.length > 3 && (
                    <span className="text-[10px] text-slate-500">+{dayItems.length - 3}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        {(Object.entries(STATUS_COLOURS) as [CalendarItem["status"], string][]).map(([status, cls]) => (
          <span key={status} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${cls}`} />
            {status}
          </span>
        ))}
      </div>

      {/* Selected day details */}
      {selectedDate && (
        <section className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h3>
          {selectedItems.length === 0 ? (
            <p className="text-sm text-slate-400">No tutorials scheduled. Add one below.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {selectedItems.map((item) => (
                <li key={item.id} className="rounded border border-slate-800 p-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{item.title}</p>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] text-white ${STATUS_COLOURS[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="text-slate-400">
                    {new Date(item.scheduledAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · {item.durationMinutes} min
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800" onClick={() => void updateStatus(item.id, "completed")}>Completed</button>
                    <button className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800" onClick={() => void updateStatus(item.id, "missed")}>Missed</button>
                    <button className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800" onClick={() => void updateStatus(item.id, "cancelled")}>Cancelled</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Schedule a new tutorial */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-3 text-base font-semibold">Schedule a tutorial</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            type="datetime-local"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            value={scheduledAt || (selectedDate ? `${selectedDate}T09:00` : "")}
            onChange={(event) => setScheduledAt(event.target.value)}
          />
          <input
            type="number"
            min={15}
            step={15}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            value={durationMinutes}
            placeholder="Duration (min)"
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
          />
        </div>
        <button
          className="mt-3 rounded-md bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-500 disabled:opacity-50"
          onClick={() => void create()}
        >
          Add tutorial
        </button>
      </section>

      {message ? <p className="text-sm text-slate-300">{message}</p> : null}

      {/* iCal subscribe section */}
      <CalendarSubscribe />

      {/* Calendar integrations */}
      <CalendarIntegrations />
    </div>
  );
}

function CalendarSubscribe() {
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function loadToken() {
    const res = await apiFetch("/api/calendar/feed-token", { userScope: "studentId" });
    if (res.ok) {
      const data = (await res.json()) as { token: string | null; feedUrl: string | null };
      setFeedUrl(data.feedUrl);
    }
  }

  async function regenerate() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/calendar/feed-token/regenerate", {
        method: "POST",
        userScope: "studentId",
      });
      if (res.ok) {
        const data = (await res.json()) as { token: string; feedUrl: string };
        setFeedUrl(data.feedUrl);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadToken();
  }, []);

  function copyUrl() {
    if (!feedUrl) return;
    void navigator.clipboard.writeText(feedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Build webcal:// URL for Apple Calendar / other clients
  const webcalUrl = feedUrl?.replace(/^https?:\/\//, "webcal://") ?? null;
  const googleAddUrl = feedUrl
    ? `https://www.google.com/calendar/render?cid=${encodeURIComponent(feedUrl)}`
    : null;

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-2 text-base font-semibold">Subscribe to your calendar</h2>
      <p className="mb-3 text-sm text-slate-400">
        Get an iCal link to subscribe in Google Calendar, Apple Calendar, or any calendar app.
      </p>

      {feedUrl ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={feedUrl}
              className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono"
            />
            <button
              onClick={copyUrl}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {googleAddUrl && (
              <a
                href={googleAddUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
              >
                Add to Google Calendar
              </a>
            )}
            {webcalUrl && (
              <a
                href={webcalUrl}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
              >
                Add to Apple Calendar
              </a>
            )}
          </div>

          <button
            onClick={() => void regenerate()}
            disabled={loading}
            className="text-xs text-slate-500 underline hover:text-slate-300"
          >
            {loading ? "Regenerating…" : "Regenerate feed URL"}
          </button>
        </div>
      ) : (
        <button
          onClick={() => void regenerate()}
          disabled={loading}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-500"
        >
          {loading ? "Generating…" : "Generate iCal feed URL"}
        </button>
      )}
    </section>
  );
}

type Integration = {
  id: string;
  provider: string;
  enabled: boolean;
  createdAt: string | null;
};

function CalendarIntegrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadIntegrations() {
    const res = await apiFetch("/api/calendar/integrations", { userScope: "studentId" });
    if (res.ok) {
      const data = (await res.json()) as { integrations: Integration[] };
      setIntegrations(data.integrations);
    }
  }

  useEffect(() => {
    void loadIntegrations();
  }, []);

  async function connectGoogle() {
    setLoading(true);
    try {
      // Enable Google integration in our DB
      await apiFetch("/api/calendar/integrations", {
        method: "POST",
        userScope: "studentId",
        body: { provider: "google", enabled: true },
      });
      await loadIntegrations();
    } finally {
      setLoading(false);
    }
  }

  async function disconnectIntegration(id: string) {
    setLoading(true);
    try {
      await apiFetch(`/api/calendar/integrations/${id}`, {
        method: "DELETE",
        userScope: "studentId",
      });
      await loadIntegrations();
    } finally {
      setLoading(false);
    }
  }

  const googleIntegration = integrations.find((i) => i.provider === "google");

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-2 text-base font-semibold">Calendar integrations</h2>
      <p className="mb-3 text-sm text-slate-400">
        Connect external calendar providers to sync your tutorials.
      </p>

      <div className="space-y-3">
        {/* Google Calendar */}
        <div className="flex items-center justify-between rounded border border-slate-700 p-3">
          <div>
            <p className="text-sm font-medium">Google Calendar</p>
            <p className="text-xs text-slate-400">
              {googleIntegration
                ? `Connected · ${googleIntegration.enabled ? "Active" : "Paused"}`
                : "Not connected"}
            </p>
          </div>
          {googleIntegration ? (
            <button
              onClick={() => void disconnectIntegration(googleIntegration.id)}
              disabled={loading}
              className="rounded-md border border-red-800 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900/40"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => void connectGoogle()}
              disabled={loading}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-500"
            >
              {loading ? "Connecting…" : "Connect"}
            </button>
          )}
        </div>

        {/* Apple / CalDAV  — stub */}
        <div className="flex items-center justify-between rounded border border-slate-700 p-3 opacity-60">
          <div>
            <p className="text-sm font-medium">Apple Calendar / CalDAV</p>
            <p className="text-xs text-slate-400">Use the iCal feed URL above to subscribe</p>
          </div>
          <span className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-500">
            Via iCal feed
          </span>
        </div>
      </div>
    </section>
  );
}
