"use client";

import { use, useEffect, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer, useRoomContext } from "@livekit/components-react";
import { CallControls } from "@/components/CallControls";
import { LiveTranscript } from "@/components/LiveTranscript";
import { apiFetch } from "@/lib/api-client";

type SessionResponse = {
  session: {
    id: string;
    roomName: string;
    participantToken: string | null;
  };
};

function CallInner({ sessionId }: { sessionId: string }) {
  const room = useRoomContext();

  return (
    <div className="space-y-4">
      <CallControls sessionId={sessionId} />
      <RoomAudioRenderer />
      <LiveTranscript room={room} />
    </div>
  );
}

export default function CallPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const [session, setSession] = useState<SessionResponse["session"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/sessions/${sessionId}`, { userScope: "studentId" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load session");
        return response.json();
      })
      .then((data: SessionResponse) => setSession(data.session))
      .catch((err) => setError(err.message));
  }, [sessionId]);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!session?.participantToken) return <p>Connecting...</p>;

  return (
    <LiveKitRoom
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      token={session.participantToken}
      connect
      audio
      video={false}
      className="space-y-4"
    >
      <CallInner sessionId={sessionId} />
    </LiveKitRoom>
  );
}
