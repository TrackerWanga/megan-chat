// ═══════════════════════════════════════════════════════════
// Megan Chat — WebSocket Room (Durable Object)
// ═══════════════════════════════════════════════════════════

export class ChatRoom {
  private sessions: Map<string, WebSocket>;

  constructor(state: DurableObjectState) {
    this.sessions = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal broadcast from REST API
    if (url.pathname === "/broadcast") {
      const data = await request.json() as any;
      this.broadcast(data);
      return Response.json({ ok: true });
    }

    // WebSocket connection
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const userId = url.searchParams.get("user") || "anonymous";
    const username = url.searchParams.get("username") || userId;

    this.sessions.set(userId, server);
    server.accept();

    // Send online users to everyone
    this.broadcast({
      type: "presence",
      users: [...this.sessions.keys()],
      count: this.sessions.size,
      joined: userId,
    });

    server.addEventListener("message", async (event) => {
      const data = JSON.parse(event.data as string);

      switch (data.type) {
        case "message":
          this.broadcast({
            type: "message",
            user: { id: userId, username },
            text: data.text,
            timestamp: Date.now(),
          });
          break;

        case "typing":
          this.broadcast({
            type: "typing",
            user: { id: userId, username },
            isTyping: data.isTyping,
          }, userId);
          break;

        case "ping":
          server.send(JSON.stringify({ type: "pong" }));
          break;
      }
    });

    server.addEventListener("close", () => {
      this.sessions.delete(userId);
      this.broadcast({
        type: "presence",
        users: [...this.sessions.keys()],
        count: this.sessions.size,
        left: userId,
      });
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(message: any, excludeUser?: string) {
    const data = JSON.stringify(message);
    for (const [userId, ws] of this.sessions) {
      if (userId !== excludeUser) {
        try { ws.send(data); } catch {}
      }
    }
  }
}
