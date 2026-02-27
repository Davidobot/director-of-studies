"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocalParticipant, useRoomContext } from "@livekit/components-react";
import { apiFetch } from "@/lib/api-client";

export function CallControls({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [ending, setEnding] = useState(false);

  async function endCall() {
    setEnding(true);
    // Fire-and-forget: mark session ended + generate summary in the background.
    // Do not await — the OpenAI summarisation call can take 10–30 s and would
    // leave the button stuck on "Ending..." the whole time.
    apiFetch("/api/session/end", {
      method: "POST",
      userScope: "studentId",
      body: { sessionId },
    }).catch(() => {
      // best-effort; summary page will show a fallback if it never completes
    });
    await room.disconnect();
    router.push(`/sessions/${sessionId}`);
  }

  async function toggleMic() {
    await localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled);
  }

  return (
    <div className="flex gap-2">
      <button className="rounded bg-slate-700 px-3 py-2" onClick={toggleMic}>
        {localParticipant.isMicrophoneEnabled ? "Mute" : "Unmute"}
      </button>
      <button disabled={ending} className="rounded bg-red-600 px-3 py-2 disabled:opacity-50" onClick={endCall}>
        {ending ? "Ending..." : "End Call"}
      </button>
    </div>
  );
}
