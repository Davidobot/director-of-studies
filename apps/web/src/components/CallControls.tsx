"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocalParticipant, useRoomContext } from "@livekit/components-react";

export function CallControls({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [ending, setEnding] = useState(false);

  async function endCall() {
    setEnding(true);
    await fetch("/api/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
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
