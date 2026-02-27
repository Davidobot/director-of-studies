"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

export function DoSChat() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!input.trim()) return;

    const nextUserMessage = { role: "user" as const, content: input.trim() };
    setMessages((prev) => [...prev, nextUserMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await apiFetch("/api/dos-chat", {
        method: "POST",
        userScope: "studentId",
        body: { message: nextUserMessage.content, threadId },
      });

      if (!res.ok) throw new Error("DoS chat failed");
      const data = (await res.json()) as { threadId: string; reply: string };
      setThreadId(data.threadId);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unexpected error";
      setMessages((prev) => [...prev, { role: "assistant", content: text }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded border border-slate-800 bg-slate-900 p-4">
      <h3 className="mb-2 text-lg font-semibold">Director of Studies chat</h3>
      <div className="mb-3 max-h-64 space-y-2 overflow-y-auto rounded border border-slate-800 bg-slate-950 p-2 text-sm">
        {messages.length === 0 ? (
          <p className="text-slate-400">Ask for study priorities, schedule changes, or revision strategy.</p>
        ) : (
          messages.map((message, index) => (
            <div key={`${message.role}-${index}`}>
              <p className="font-medium text-sky-300">{message.role === "user" ? "You" : "Director of Studies"}</p>
              <p className="text-slate-200">{message.content}</p>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          placeholder="What should I focus on this week?"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button className="rounded-md bg-sky-600 px-4 py-2 text-white disabled:opacity-50" disabled={loading} onClick={() => void send()}>
          {loading ? "Sending..." : "Send"}
        </button>
      </div>
    </section>
  );
}
