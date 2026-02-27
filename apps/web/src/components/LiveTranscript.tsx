"use client";

import { useEffect, useState } from "react";
import { RoomEvent, type Room } from "livekit-client";

type TranscriptItem = {
  speaker: "Student" | "TutorBot";
  text: string;
  timestamp: string;
};

export function LiveTranscript({ room }: { room: Room | undefined }) {
  const [items, setItems] = useState<TranscriptItem[]>([]);

  useEffect(() => {
    if (!room) return;

    const handler = (payload: Uint8Array) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload)) as TranscriptItem & { topic?: string };
        if (data && data.text) {
          setItems((prev) => [...prev, { speaker: data.speaker, text: data.text, timestamp: data.timestamp }]);
        }
      } catch {
        return;
      }
    };

    room.on(RoomEvent.DataReceived, handler);
    return () => {
      room.off(RoomEvent.DataReceived, handler);
    };
  }, [room]);

  return (
    <div className="h-80 overflow-y-auto rounded-md border border-slate-800 bg-slate-900 p-3">
      {items.length === 0 ? <p className="text-sm text-slate-400">Transcript will appear here...</p> : null}
      <ul className="space-y-2 text-sm">
        {items.map((item, idx) => (
          <li key={`${item.timestamp}-${idx}`}>
            <span className="font-semibold text-sky-300">{item.speaker}</span>
            <span className="text-slate-500"> [{new Date(item.timestamp).toLocaleTimeString()}]</span>
            <p>{item.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
