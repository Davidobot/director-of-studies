"use client";

import { useEffect, useState } from "react";

type ConfigRow = {
  enrolmentId: number;
  subjectName: string;
  level: string;
  tutorName: string | null;
  personalityPrompt: string | null;
  ttsVoiceModel: string | null;
  ttsSpeed: string | null;
};

const VOICE_OPTIONS = [
  "aura-2-draco-en",
  "aura-2-thalia-en",
  "aura-2-andromeda-en",
  "aura-2-luna-en",
  "aura-2-helios-en",
  "aura-2-orion-en",
  "aura-2-stella-en",
  "aura-2-asteria-en",
] as const;

export function TutorConfigManager() {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadConfigs() {
    const res = await fetch("/api/tutor-config");
    if (!res.ok) {
      setMessage("Could not load tutor config.");
      return;
    }

    const data = (await res.json()) as { configs: ConfigRow[] };
    setRows(data.configs);
  }

  useEffect(() => {
    void loadConfigs();
  }, []);

  async function saveConfig(row: ConfigRow) {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/tutor-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });
      if (!res.ok) throw new Error("Failed to save tutor settings");
      setMessage(`Saved tutor settings for ${row.subjectName}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(index: number, next: Partial<ConfigRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...next } : row)));
  }

  return (
    <div className="space-y-4">
      {rows.map((row, index) => (
        <section key={row.enrolmentId} className="rounded border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-semibold">
            {row.subjectName} ({row.level})
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Tutor name</label>
              <input
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                value={row.tutorName ?? "TutorBot"}
                onChange={(event) => updateRow(index, { tutorName: event.target.value })}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Voice model</label>
              <select
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                value={row.ttsVoiceModel ?? "aura-2-draco-en"}
                onChange={(event) => updateRow(index, { ttsVoiceModel: event.target.value })}
              >
                {VOICE_OPTIONS.map((voice) => (
                  <option key={voice} value={voice}>{voice}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Speech speed</label>
              <input
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                value={row.ttsSpeed ?? "1.0"}
                onChange={(event) => updateRow(index, { ttsSpeed: event.target.value })}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-slate-400">Personality prompt</label>
              <textarea
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                rows={3}
                value={row.personalityPrompt ?? "Be warm, concise, and Socratic."}
                onChange={(event) => updateRow(index, { personalityPrompt: event.target.value })}
              />
            </div>
          </div>

          <button
            className="mt-3 rounded-md bg-sky-600 px-4 py-2 text-white disabled:opacity-50"
            disabled={loading}
            onClick={() => void saveConfig(row)}
          >
            Save tutor settings
          </button>
        </section>
      ))}

      {message ? <p className="text-sm text-slate-300">{message}</p> : null}
    </div>
  );
}
