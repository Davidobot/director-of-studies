"use client";

import { useEffect, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer, useRoomContext } from "@livekit/components-react";
import { CallControls } from "@/components/CallControls";
import { LiveTranscript } from "@/components/LiveTranscript";

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

export default function CallPage({ params }: { params: { sessionId: string } }) {
  const [session, setSession] = useState<SessionResponse["session"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sessions/${params.sessionId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load session");
        return response.json();
      })
      .then((data: SessionResponse) => setSession(data.session))
      .catch((err) => setError(err.message));
  }, [params.sessionId]);

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
      <CallInner sessionId={params.sessionId} />
    </LiveKitRoom>
  );
}
