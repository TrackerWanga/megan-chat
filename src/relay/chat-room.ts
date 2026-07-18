// ═══════════════════════════════════════════════════════════
// Megan Chat — WebSocket Room (Durable Object)
// Handles: messages, typing, recording, presence, receipts
// ═══════════════════════════════════════════════════════════

export class ChatRoom {
  private sessions: Map<string, { ws: WebSocket; username: string; roomId: string }>;

  constructor(state: DurableObjectState) {
    this.sessions = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal broadcast from REST API
    if (url.pathname === "/broadcast") {
      const data = await request.json() as any;
      this.broadcast(data.type, data.payload, data.exclude);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // WebSocket connection
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const userId = url.searchParams.get("user_id") || "anonymous";
    const username = url.searchParams.get("username") || userId;
    const roomId = url.searchParams.get("room_id") || "global";

    this.sessions.set(userId, { ws: server, username, roomId });
    server.accept();

    // Send presence update — user joined
    this.broadcast("presence", {
      user_id: userId,
      username,
      status: "online",
      last_seen: Date.now(),
      event: "joined",
      online_count: this.sessions.size,
    });

    // Send current online users to the new connection
    const onlineUsers = Array.from(this.sessions.entries()).map(([id, s]) => ({
      user_id: id,
      username: s.username,
      status: "online",
    }));
    server.send(JSON.stringify({
      type: "presence_list",
      users: onlineUsers,
      count: this.sessions.size,
    }));

    server.addEventListener("message", async (event) => {
      try {
        const data = JSON.parse(event.data as string);

        switch (data.type) {
          case "message":
            this.broadcast("message", {
              message_id: data.message_id || crypto.randomUUID(),
              room_id: roomId,
              sender_id: userId,
              sender_username: username,
              text: data.text,
              reply_to: data.reply_to || null,
              type: data.msg_type || "text",
              timestamp: Date.now(),
            });
            break;

          case "typing":
            this.broadcast("typing", {
              room_id: roomId,
              user_id: userId,
              username,
              is_typing: data.is_typing,
            }, userId);
            break;

          case "recording":
            this.broadcast("recording", {
              room_id: roomId,
              user_id: userId,
              username,
              is_recording: data.is_recording,
              duration: data.duration || 0,
            }, userId);
            break;

          case "read_receipt":
            this.broadcast("read_receipt", {
              room_id: roomId,
              message_id: data.message_id,
              user_id: userId,
              status: "read",
              timestamp: Date.now(),
            });
            break;

          case "delivered":
            this.broadcast("delivered", {
              room_id: roomId,
              message_id: data.message_id,
              user_id: userId,
              status: "delivered",
              timestamp: Date.now(),
            }, userId);
            break;

          case "ping":
            server.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
            break;
        }
      } catch {}
    });

    server.addEventListener("close", () => {
      this.sessions.delete(userId);
      this.broadcast("presence", {
        user_id: userId,
        username,
        status: "offline",
        last_seen: Date.now(),
        event: "left",
        online_count: this.sessions.size,
      });
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(type: string, payload: any, excludeUser?: string) {
    const message = JSON.stringify({ type, ...payload });
    for (const [userId, session] of this.sessions) {
      if (userId !== excludeUser) {
        try {
          session.ws.send(message);
        } catch {}
      }
    }
  }
}
