"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

type FeedbackType = "session" | "general" | "course_suggestion";

export function FeedbackButton({
  feedbackType,
  sessionId,
  buttonLabel = "Send feedback",
  buttonClassName,
}: {
  feedbackType: FeedbackType;
  sessionId?: string;
  buttonLabel?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showStars = feedbackType !== "course_suggestion";
  const placeholder =
    feedbackType === "course_suggestion"
      ? "What course would you like us to add? Include the subject, exam board, and level if possible."
      : feedbackType === "session"
        ? "How was your tutoring session? Any suggestions?"
        : "Tell us what you think — what's working, what could be better?";

  async function handleSubmit() {
    if (showStars && !rating) {
      setError("Please select a rating");
      return;
    }
    if (feedbackType === "course_suggestion" && !comment.trim()) {
      setError("Please describe the course you'd like");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await apiFetch("/api/feedback", {
        method: "POST",
        body: {
          feedbackType,
          sessionId: sessionId ?? null,
          rating: showStars ? rating : null,
          comment: comment.trim() || null,
        },
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail || "Could not submit feedback");
      }

      setSubmitted(true);
      setTimeout(() => {
        setOpen(false);
        // Reset for reuse
        setTimeout(() => {
          setSubmitted(false);
          setRating(null);
          setComment("");
        }, 300);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  const defaultBtnClass =
    "rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={buttonClassName ?? defaultBtnClass}
      >
        {buttonLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl">
            {submitted ? (
              <div className="text-center">
                <p className="text-lg font-medium text-emerald-300">Thank you!</p>
                <p className="mt-1 text-sm text-slate-400">Your feedback has been submitted.</p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">
                    {feedbackType === "course_suggestion"
                      ? "Suggest a course"
                      : feedbackType === "session"
                        ? "Rate this session"
                        : "Send feedback"}
                  </h3>
                  <button
                    onClick={() => setOpen(false)}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    ✕
                  </button>
                </div>

                {showStars ? (
                  <div className="mb-4">
                    <label className="mb-2 block text-sm text-slate-400">Rating</label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          className={`text-2xl transition-colors ${
                            rating !== null && star <= rating
                              ? "text-amber-400"
                              : "text-slate-600 hover:text-amber-300"
                          }`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mb-4">
                  <label className="mb-1 block text-sm text-slate-400">
                    {feedbackType === "course_suggestion" ? "Your suggestion" : "Comments (optional)"}
                  </label>
                  <textarea
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={placeholder}
                  />
                </div>

                {error ? (
                  <p className="mb-3 text-sm text-red-400">{error}</p>
                ) : null}

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleSubmit()}
                    disabled={submitting}
                    className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    {submitting ? "Submitting..." : "Submit"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
