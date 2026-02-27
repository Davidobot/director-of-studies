import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

function getConfig() {
  const livekitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!livekitUrl || !apiKey || !apiSecret) {
    throw new Error("LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are required");
  }
  return { livekitUrl, apiKey, apiSecret };
}

function getRoomService() {
  const { livekitUrl, apiKey, apiSecret } = getConfig();
  return new RoomServiceClient(livekitUrl, apiKey, apiSecret);
}

export async function ensureRoom(roomName: string) {
  const roomService = getRoomService();
  try {
    await roomService.createRoom({ name: roomName });
  } catch {
    const rooms = await roomService.listRooms([roomName]);
    if (!rooms.find((room) => room.name === roomName)) {
      throw new Error("Failed to ensure room");
    }
  }
}

export async function createParticipantToken(roomName: string, identity: string) {
  const { apiKey, apiSecret } = getConfig();
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    ttl: "1h",
    name: identity,
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return token.toJwt();
}
