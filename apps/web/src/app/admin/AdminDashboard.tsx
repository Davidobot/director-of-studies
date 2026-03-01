"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type AdminStats = {
  totalStudents: number;
  totalParents: number;
  sessions24h: number;
  sessions7d: number;
  failedSessions: number;
  activeSubscribers: number;
  totalHoursConsumed: number;
};

type FeedbackItem = {
  id: number;
  profileId: string;
  feedbackType: string;
  sessionId: string | null;
  rating: number | null;
  comment: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  email: string | null;
  displayName: string | null;
};

type FeedbackResponse = {
  items: FeedbackItem[];
  total: number;
  page: number;
  perPage: number;
};

type WaitlistItem = {
  id: number;
  email: string;
  name: string | null;
  role: "student" | "parent" | null;
  school: string | null;
  schoolYear: string | null;
  subjectInterests: string[];
  examBoard: string | null;
  status: "pending" | "invited";
  createdAt: string | null;
  updatedAt: string | null;
};

type WaitlistResponse = {
  items: WaitlistItem[];
  total: number;
  page: number;
  perPage: number;
};

type AdminTab = "overview" | "waitlist";

const statCards: { key: keyof AdminStats; label: string; color?: string }[] = [
  { key: "totalStudents", label: "Total Students" },
  { key: "totalParents", label: "Total Parents" },
  { key: "sessions24h", label: "Sessions (24h)" },
  { key: "sessions7d", label: "Sessions (7d)" },
  { key: "failedSessions", label: "Failed Sessions", color: "text-red-300" },
  { key: "activeSubscribers", label: "Active Subscribers", color: "text-emerald-300" },
  { key: "totalHoursConsumed", label: "Total Hours" },
];

function StarRating({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-slate-600">—</span>;
  return (
    <span className="text-amber-400">
      {"★".repeat(rating)}
      {"☆".repeat(5 - rating)}
    </span>
  );
}

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [feedback, setFeedback] = useState<FeedbackResponse | null>(null);
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [feedbackFilter, setFeedbackFilter] = useState<string>("");
  const [waitlist, setWaitlist] = useState<WaitlistResponse | null>(null);
  const [waitlistPage, setWaitlistPage] = useState(1);
  const [waitlistFilter, setWaitlistFilter] = useState<"" | "pending" | "invited">("");
  const [waitlistBusyId, setWaitlistBusyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadStats() {
    try {
      const res = await apiFetch("/api/admin/stats");
      if (!res.ok) throw new Error("Failed to load stats");
      const data = (await res.json()) as AdminStats;
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    }
  }

  async function loadFeedback(page: number, type: string) {
    try {
      const params = new URLSearchParams({ page: String(page), per_page: "20" });
      if (type) params.set("feedback_type", type);
      const res = await apiFetch(`/api/admin/feedback?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load feedback");
      const data = (await res.json()) as FeedbackResponse;
      setFeedback(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feedback");
    }
  }

  async function loadWaitlist(page: number, status: "" | "pending" | "invited") {
    try {
      const params = new URLSearchParams({ page: String(page), per_page: "20" });
      if (status) params.set("status", status);
      const res = await apiFetch(`/api/admin/waitlist?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load waitlist");
      const data = (await res.json()) as WaitlistResponse;
      setWaitlist(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load waitlist");
    }
  }

  async function markInvited(signupId: number) {
    setWaitlistBusyId(signupId);
    try {
      const res = await apiFetch(`/api/admin/waitlist/${signupId}/status`, {
        method: "PATCH",
        body: { status: "invited" },
      });
      if (!res.ok) throw new Error("Failed to update status");
      await loadWaitlist(waitlistPage, waitlistFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setWaitlistBusyId(null);
    }
  }

  async function exportWaitlistCsv() {
    try {
      const params = new URLSearchParams();
      if (waitlistFilter) params.set("status", waitlistFilter);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const res = await apiFetch(`/api/admin/waitlist/export${suffix}`);
      if (!res.ok) throw new Error("Failed to export waitlist CSV");

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "waitlist.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export waitlist CSV");
    }
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([loadStats(), loadFeedback(1, ""), loadWaitlist(1, "")]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void loadFeedback(feedbackPage, feedbackFilter);
  }, [feedbackPage, feedbackFilter]);

  useEffect(() => {
    void loadWaitlist(waitlistPage, waitlistFilter);
  }, [waitlistPage, waitlistFilter]);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading admin data...</p>;
  }

  if (error) {
    return <p className="rounded-md border border-red-700 bg-red-900/30 px-4 py-2 text-sm text-red-300">{error}</p>;
  }

  const totalPages = feedback ? Math.ceil(feedback.total / feedback.perPage) : 1;
  const waitlistTotalPages = waitlist ? Math.ceil(waitlist.total / waitlist.perPage) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveTab("overview")}
          className={`rounded-md border px-3 py-1.5 text-sm ${
            activeTab === "overview"
              ? "border-sky-700 bg-sky-900/40 text-sky-100"
              : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab("waitlist")}
          className={`rounded-md border px-3 py-1.5 text-sm ${
            activeTab === "waitlist"
              ? "border-sky-700 bg-sky-900/40 text-sky-100"
              : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
          }`}
        >
          Waitlist
        </button>
      </div>

      {activeTab === "overview" ? (
        <>
          {stats ? (
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {statCards.map((card) => (
                <div key={card.key} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <p className="text-xs text-slate-400">{card.label}</p>
                  <p className={`text-2xl font-semibold ${card.color ?? "text-slate-100"}`}>
                    {stats[card.key]}
                  </p>
                </div>
              ))}
            </section>
          ) : null}

          <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">User Feedback</h2>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Filter:</label>
                <select
                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200"
                  value={feedbackFilter}
                  onChange={(e) => {
                    setFeedbackFilter(e.target.value);
                    setFeedbackPage(1);
                  }}
                >
                  <option value="">All</option>
                  <option value="session">Session</option>
                  <option value="general">General</option>
                  <option value="course_suggestion">Course Suggestions</option>
                </select>
              </div>
            </div>

            {feedback && feedback.items.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                        <th className="pb-2 pr-3">Date</th>
                        <th className="pb-2 pr-3">Type</th>
                        <th className="pb-2 pr-3">User</th>
                        <th className="pb-2 pr-3">Rating</th>
                        <th className="pb-2">Comment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feedback.items.map((item) => (
                        <tr key={item.id} className="border-b border-slate-800/50">
                          <td className="py-2 pr-3 text-xs text-slate-500 whitespace-nowrap">
                            {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={`rounded px-1.5 py-0.5 text-xs ${
                                item.feedbackType === "session"
                                  ? "bg-sky-900/60 text-sky-200"
                                  : item.feedbackType === "course_suggestion"
                                    ? "bg-violet-900/60 text-violet-200"
                                    : "bg-slate-700 text-slate-200"
                              }`}
                            >
                              {item.feedbackType.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-slate-300">
                            {item.displayName ?? item.email ?? "Unknown"}
                          </td>
                          <td className="py-2 pr-3">
                            <StarRating rating={item.rating} />
                          </td>
                          <td className="py-2 text-slate-300 max-w-xs truncate">
                            {item.comment ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex items-center justify-between text-sm">
                  <p className="text-slate-500">
                    {feedback.total} total · page {feedback.page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={feedbackPage <= 1}
                      onClick={() => setFeedbackPage((p) => Math.max(1, p - 1))}
                      className="rounded border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                    >
                      ← Prev
                    </button>
                    <button
                      disabled={feedbackPage >= totalPages}
                      onClick={() => setFeedbackPage((p) => p + 1)}
                      className="rounded border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">No feedback yet.</p>
            )}
          </section>
        </>
      ) : (
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Waitlist Sign-ups</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Status:</label>
              <select
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200"
                value={waitlistFilter}
                onChange={(e) => {
                  setWaitlistFilter((e.target.value as "" | "pending" | "invited") ?? "");
                  setWaitlistPage(1);
                }}
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="invited">Invited</option>
              </select>
              <button
                onClick={exportWaitlistCsv}
                className="rounded border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:bg-slate-800"
              >
                Export CSV
              </button>
              </div>
            </div>

          <p className="mb-3 text-sm text-slate-400">Total sign-ups: {waitlist?.total ?? 0}</p>

          {waitlist && waitlist.items.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                      <th className="pb-2 pr-3">Date</th>
                      <th className="pb-2 pr-3">Name</th>
                      <th className="pb-2 pr-3">Email</th>
                      <th className="pb-2 pr-3">Role</th>
                      <th className="pb-2 pr-3">School</th>
                      <th className="pb-2 pr-3">School Year</th>
                      <th className="pb-2 pr-3">Exam Board</th>
                      <th className="pb-2 pr-3">Subjects</th>
                      <th className="pb-2 pr-3">Status</th>
                      <th className="pb-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitlist.items.map((item) => (
                      <tr key={item.id} className="border-b border-slate-800/50">
                        <td className="py-2 pr-3 text-xs text-slate-500 whitespace-nowrap">
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-2 pr-3 text-slate-300">{item.name ?? "—"}</td>
                        <td className="py-2 pr-3 text-slate-300">{item.email}</td>
                        <td className="py-2 pr-3 text-slate-300 capitalize">{item.role ?? "—"}</td>
                        <td className="py-2 pr-3 text-slate-300">{item.school ?? "—"}</td>
                        <td className="py-2 pr-3 text-slate-300">{item.schoolYear ?? "—"}</td>
                        <td className="py-2 pr-3 text-slate-300">{item.examBoard ?? "—"}</td>
                        <td className="py-2 pr-3 text-slate-300 max-w-[14rem] truncate">
                          {item.subjectInterests.length > 0 ? item.subjectInterests.join(", ") : "—"}
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs ${
                              item.status === "invited"
                                ? "bg-emerald-900/60 text-emerald-200"
                                : "bg-amber-900/60 text-amber-200"
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2">
                          {item.status === "pending" ? (
                            <button
                              disabled={waitlistBusyId === item.id}
                              onClick={() => void markInvited(item.id)}
                              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                            >
                              {waitlistBusyId === item.id ? "Saving..." : "Mark invited"}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm">
                <p className="text-slate-500">
                  {waitlist.total} total · page {waitlist.page} of {waitlistTotalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={waitlistPage <= 1}
                    onClick={() => setWaitlistPage((p) => Math.max(1, p - 1))}
                    className="rounded border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <button
                    disabled={waitlistPage >= waitlistTotalPages}
                    onClick={() => setWaitlistPage((p) => p + 1)}
                    className="rounded border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">No waitlist sign-ups yet.</p>
          )}
        </section>
      )}
    </div>
  );
}
