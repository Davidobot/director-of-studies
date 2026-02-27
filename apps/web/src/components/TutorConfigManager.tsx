"use client";

import { useEffect, useReducer, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

type Persona = {
  id: number;
  name: string;
  personalityPrompt: string;
  ttsVoiceModel: string;
  ttsSpeed: string;
};

type Enrolment = {
  enrolmentId: number;
  subjectName: string;
  level: string;
  personaId: number | null;
  personaName: string | null;
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

const inputClass = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200";
const labelClass = "mb-1 block text-xs text-slate-400";

// ── PersonaForm ────────────────────────────────────────────────────────────

function PersonaForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Partial<Persona>;
  onSave: (data: Omit<Persona, "id">) => Promise<void>;
  onCancel?: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [personalityPrompt, setPersonalityPrompt] = useState(
    initial?.personalityPrompt ?? "Be warm, concise, and Socratic."
  );
  const [ttsVoiceModel, setTtsVoiceModel] = useState(
    initial?.ttsVoiceModel ?? "aura-2-draco-en"
  );
  const [ttsSpeed, setTtsSpeed] = useState(initial?.ttsSpeed ?? "1.0");

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelClass}>Tutor name *</label>
        <input
          className={inputClass}
          placeholder="e.g. Dr Smith"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <label className={labelClass}>Voice</label>
        <select
          className={inputClass}
          value={ttsVoiceModel}
          onChange={(e) => setTtsVoiceModel(e.target.value)}
        >
          {VOICE_OPTIONS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Speech speed</label>
        <input
          className={inputClass}
          placeholder="1.0"
          value={ttsSpeed}
          onChange={(e) => setTtsSpeed(e.target.value)}
        />
      </div>

      <div className="sm:col-span-2">
        <label className={labelClass}>Personality prompt</label>
        <textarea
          className={inputClass}
          rows={3}
          value={personalityPrompt}
          onChange={(e) => setPersonalityPrompt(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2 sm:col-span-2">
        <button
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          disabled={saving || !name.trim()}
          onClick={() =>
            void onSave({ name: name.trim(), personalityPrompt, ttsVoiceModel, ttsSpeed })
          }
        >
          {saving ? "Saving…" : "Save tutor"}
        </button>
        {onCancel && (
          <button
            className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ── PersonaCard ────────────────────────────────────────────────────────────

function PersonaCard({
  persona,
  onUpdate,
  onDelete,
}: {
  persona: Persona;
  onUpdate: (p: Persona) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave(data: Omit<Persona, "id">) {
    setSaving(true);
    try {
      const res = await fetch(`/api/tutor-personas/${persona.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update tutor");
      const json = (await res.json()) as { persona: Persona };
      onUpdate(json.persona);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete tutor "${persona.name}"? This will unassign it from all subjects.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/tutor-personas/${persona.id}`, { method: "DELETE" });
      onDelete(persona.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
      {editing ? (
        <PersonaForm
          initial={persona}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
          saving={saving}
        />
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium text-slate-100">{persona.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">{persona.ttsVoiceModel} · speed {persona.ttsSpeed}</p>
            <p className="mt-1 text-sm text-slate-400 italic">&ldquo;{persona.personalityPrompt}&rdquo;</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              className="rounded border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button
              className="rounded border border-rose-800 px-3 py-1 text-xs text-rose-400 hover:bg-rose-900/30 disabled:opacity-50"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? "…" : "Delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reducer ────────────────────────────────────────────────────────────────

type State = {
  personas: Persona[];
  enrolments: Enrolment[];
  loaded: boolean;
};

type Action =
  | { type: "loaded"; personas: Persona[]; enrolments: Enrolment[] }
  | { type: "addPersona"; persona: Persona }
  | { type: "updatePersona"; persona: Persona }
  | { type: "deletePersona"; id: number }
  | { type: "assignPersona"; enrolmentId: number; personaId: number | null; personaName: string | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "loaded":
      return { ...state, personas: action.personas, enrolments: action.enrolments, loaded: true };
    case "addPersona":
      return {
        ...state,
        personas: [...state.personas, action.persona].sort((a, b) => a.name.localeCompare(b.name)),
      };
    case "updatePersona":
      return {
        ...state,
        personas: state.personas.map((p) => (p.id === action.persona.id ? action.persona : p)),
        enrolments: state.enrolments.map((e) =>
          e.personaId === action.persona.id ? { ...e, personaName: action.persona.name } : e
        ),
      };
    case "deletePersona":
      return {
        ...state,
        personas: state.personas.filter((p) => p.id !== action.id),
        enrolments: state.enrolments.map((e) =>
          e.personaId === action.id ? { ...e, personaId: null, personaName: null } : e
        ),
      };
    case "assignPersona":
      return {
        ...state,
        enrolments: state.enrolments.map((e) =>
          e.enrolmentId === action.enrolmentId
            ? { ...e, personaId: action.personaId, personaName: action.personaName }
            : e
        ),
      };
  }
}

// ── Main component ─────────────────────────────────────────────────────────

export function TutorConfigManager() {
  const [state, dispatch] = useReducer(reducer, { personas: [], enrolments: [], loaded: false });
  const [addingNew, setAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash(msg: string) {
    setMessage(msg);
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    msgTimerRef.current = setTimeout(() => setMessage(null), 3000);
  }

  useEffect(() => {
    void (async () => {
      const [pRes, eRes] = await Promise.all([
        fetch("/api/tutor-personas"),
        fetch("/api/tutor-config"),
      ]);
      if (!pRes.ok || !eRes.ok) { flash("Could not load tutor settings."); return; }
      const { personas } = (await pRes.json()) as { personas: Persona[] };
      const { enrolments } = (await eRes.json()) as { enrolments: Enrolment[] };
      dispatch({ type: "loaded", personas, enrolments });
    })();
  }, []);

  async function handleCreate(data: Omit<Persona, "id">) {
    setSaving(true);
    try {
      const res = await fetch("/api/tutor-personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create tutor");
      const json = (await res.json()) as { persona: Persona };
      dispatch({ type: "addPersona", persona: json.persona });
      setAddingNew(false);
      flash(`Tutor "${json.persona.name}" created.`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssign(enrolmentId: number, personaId: number | null) {
    const res = await fetch("/api/tutor-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrolmentId, personaId }),
    });
    if (!res.ok) { flash("Failed to update assignment."); return; }
    const persona = personaId !== null ? state.personas.find((p) => p.id === personaId) ?? null : null;
    dispatch({ type: "assignPersona", enrolmentId, personaId, personaName: persona?.name ?? null });
  }

  if (!state.loaded) {
    return <p className="text-sm text-slate-400">Loading tutor settings…</p>;
  }

  return (
    <div className="space-y-8">

      {/* ── Section 1: Personas ─────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Your tutors</h2>
            <p className="mt-0.5 text-sm text-slate-400">
              Create named tutor personas — each has its own voice and teaching style.
              A persona can be assigned to any number of subjects.
            </p>
          </div>
          {!addingNew && (
            <button
              className="shrink-0 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
              onClick={() => setAddingNew(true)}
            >
              + New tutor
            </button>
          )}
        </div>

        {addingNew && (
          <div className="mb-4 rounded-lg border border-sky-700 bg-slate-900 p-4">
            <p className="mb-3 text-sm font-medium text-sky-300">New tutor</p>
            <PersonaForm
              onSave={handleCreate}
              onCancel={() => setAddingNew(false)}
              saving={saving}
            />
          </div>
        )}

        {state.personas.length === 0 && !addingNew ? (
          <p className="rounded-lg border border-dashed border-slate-700 px-4 py-6 text-center text-sm text-slate-500">
            No tutors yet — click &ldquo;+ New tutor&rdquo; to create one.
          </p>
        ) : (
          <div className="space-y-3">
            {state.personas.map((p) => (
              <PersonaCard
                key={p.id}
                persona={p}
                onUpdate={(updated) => dispatch({ type: "updatePersona", persona: updated })}
                onDelete={(id) => dispatch({ type: "deletePersona", id })}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Section 2: Subject assignments ─────────────── */}
      {state.enrolments.length > 0 && (
        <section>
          <h2 className="mb-1 text-base font-semibold">Subject assignments</h2>
          <p className="mb-3 text-sm text-slate-400">
            Choose which tutor to use for each subject. Changes take effect on the next call.
          </p>
          <div className="space-y-2">
            {state.enrolments.map((enrolment) => (
              <div
                key={enrolment.enrolmentId}
                className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{enrolment.subjectName}</p>
                  <p className="text-xs text-slate-500">{enrolment.level}</p>
                </div>
                <select
                  className="shrink-0 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200"
                  value={enrolment.personaId ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    void handleAssign(enrolment.enrolmentId, val === "" ? null : Number(val));
                  }}
                >
                  <option value="">— No tutor —</option>
                  {state.personas.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {message && <p className="text-sm text-slate-300">{message}</p>}
    </div>
  );
}
