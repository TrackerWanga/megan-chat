// ═══════════════════════════════════════════════════════════
// Megan Chat v3.0 — Real-Time Relay Service
// ═══════════════════════════════════════════════════════════

import { Env, ok, err, corsHeaders } from "./types";
import { authenticateDev, getTierFeatures, canAccessFeature } from "./utils/auth";
import { getTemplates, getTemplate, generateSQL, generateFirebase, generateMongoDB, generateFromWords } from "./schemas/builder";

export { ChatRoom } from "./relay/chat-room";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // ═══ PUBLIC ═══
      if (path === "/" || path === "/health") {
        return ok({
          status: "ok", name: "Megan Chat v3.0", version: "3.0.0",
          description: "Real-time relay service. Developers bring their own storage.",
          endpoints: {
            relay: ["/api/relay/message", "/api/relay/typing", "/api/relay/recording", "/api/relay/read", "/api/relay/presence"],
            signaling: ["/api/calls/offer", "/api/calls/answer", "/api/calls/ice"],
            schemas: ["/api/schemas/templates", "/api/schemas/generate"],
            dev: ["/api/dev/me", "/api/dev/webhook"],
            shop: ["/api/shop/stickers", "/api/shop/emojis", "/api/shop/buy"],
            websocket: "/ws",
          },
        });
      }

      if (path === "/api/endpoints") {
        return ok({
          relay: {
            message: "POST /api/relay/message",
            typing: "POST /api/relay/typing",
            recording: "POST /api/relay/recording",
            read: "POST /api/relay/read",
            presence: "POST /api/relay/presence",
          },
          signaling: {
            offer: "POST /api/calls/offer",
            answer: "POST /api/calls/answer",
            ice: "POST /api/calls/ice",
          },
          schemas: {
            templates: "GET /api/schemas/templates",
            generate: "POST /api/schemas/generate",
          },
          shop: {
            stickers: "GET /api/shop/stickers",
            emojis: "GET /api/shop/emojis",
            buy: "POST /api/shop/buy",
          },
          websocket: "GET /ws?user_id=xxx&username=xxx&room_id=xxx&api_key=xxx",
        });
      }

      // ═══ AUTH ═══
      const auth = await authenticateDev(request, env);
      if (!auth.dev) return err(auth.error || "Unauthorized", auth.status || 401);
      const dev = auth.dev;
      const features = getTierFeatures(dev.tier);

      // ═══ SCHEMA BUILDER ═══
      if (path === "/api/schemas/templates" && method === "GET") {
        return ok({ templates: getTemplates() });
      }

      if (path.startsWith("/api/schemas/template/") && method === "GET") {
        const id = path.split("/")[4];
        const template = getTemplate(id);
        if (!template) return err("Template not found", 404);
        return ok({ template: { id, ...template } });
      }

      if (path === "/api/schemas/generate" && method === "POST") {
        const { template, database, words } = await request.json() as any;
        if (words) {
          return ok({ schema: generateFromWords(words), format: "sql" });
        }
        if (!template) return err("template or words required");
        const format = database || "sqlite";
        if (format === "firebase") return ok(generateFirebase(template));
        if (format === "mongodb") return ok(generateMongoDB(template));
        return ok({ schema: generateSQL(template, format), format });
      }

      // ═══ RELAY — Message ═══
      if (path === "/api/relay/message" && method === "POST") {
        const { room_id, message_id, text, type, reply_to } = await request.json() as any;
        if (!room_id || !text) return err("room_id and text required");
        try {
          const doId = env.CHAT_ROOM.idFromName(room_id);
          const room = env.CHAT_ROOM.get(doId);
          await room.fetch(new Request("https://internal/broadcast", {
            method: "POST",
            body: JSON.stringify({
              type: "message",
              payload: { message_id: message_id || crypto.randomUUID(), room_id, sender_id: dev.uid, sender_username: dev.username, text, type: type || "text", reply_to: reply_to || null, timestamp: Date.now() },
            }),
          }));
        } catch {}
        return ok({ success: true, relayed: true, message: "Message relayed to room members" });
      }

      // ═══ RELAY — Typing ═══
      if (path === "/api/relay/typing" && method === "POST") {
        const { room_id, is_typing } = await request.json() as any;
        if (!room_id) return err("room_id required");
        try {
          const doId = env.CHAT_ROOM.idFromName(room_id);
          const room = env.CHAT_ROOM.get(doId);
          await room.fetch(new Request("https://internal/broadcast", {
            method: "POST",
            body: JSON.stringify({ type: "typing", payload: { room_id, user_id: dev.uid, username: dev.username, is_typing: !!is_typing }, exclude: dev.uid }),
          }));
        } catch {}
        return ok({ success: true });
      }

      // ═══ RELAY — Recording ═══
      if (path === "/api/relay/recording" && method === "POST") {
        const { room_id, is_recording, duration } = await request.json() as any;
        if (!room_id) return err("room_id required");
        try {
          const doId = env.CHAT_ROOM.idFromName(room_id);
          const room = env.CHAT_ROOM.get(doId);
          await room.fetch(new Request("https://internal/broadcast", {
            method: "POST",
            body: JSON.stringify({ type: "recording", payload: { room_id, user_id: dev.uid, username: dev.username, is_recording: !!is_recording, duration: duration || 0 }, exclude: dev.uid }),
          }));
        } catch {}
        return ok({ success: true });
      }

      // ═══ RELAY — Read Receipt ═══
      if (path === "/api/relay/read" && method === "POST") {
        const { room_id, message_id } = await request.json() as any;
        if (!room_id || !message_id) return err("room_id and message_id required");
        try {
          const doId = env.CHAT_ROOM.idFromName(room_id);
          const room = env.CHAT_ROOM.get(doId);
          await room.fetch(new Request("https://internal/broadcast", {
            method: "POST",
            body: JSON.stringify({ type: "read_receipt", payload: { room_id, message_id, user_id: dev.uid, status: "read", timestamp: Date.now() } }),
          }));
        } catch {}
        return ok({ success: true, status: "read", message_id });
      }

      // ═══ RELAY — Presence ═══
      if (path === "/api/relay/presence" && method === "POST") {
        const { status } = await request.json() as any;
        return ok({ success: true, user_id: dev.uid, status: status || "online" });
      }

      // ═══ WEBRTC SIGNALING ═══
      if (path === "/api/calls/offer" && method === "POST") {
        if (!canAccessFeature(dev, "webrtc_audio")) return err("WebRTC calls require Gold tier or higher", 403);
        const { to, offer, call_type } = await request.json() as any;
        if (!to || !offer) return err("to and offer required");
        const callId = crypto.randomUUID();
        try {
          const doId = env.CHAT_ROOM.idFromName(`user:${to}`);
          const room = env.CHAT_ROOM.get(doId);
          await room.fetch(new Request("https://internal/broadcast", {
            method: "POST",
            body: JSON.stringify({ type: "incoming_call", payload: { call_id: callId, from: dev.uid, from_username: dev.username, offer, call_type: call_type || "audio", timestamp: Date.now() } }),
          }));
        } catch {}
        return ok({ success: true, call_id: callId, status: "ringing" });
      }

      if (path === "/api/calls/answer" && method === "POST") {
        const { call_id, answer } = await request.json() as any;
        if (!call_id || !answer) return err("call_id and answer required");
        try {
          const doId = env.CHAT_ROOM.idFromName(`call:${call_id}`);
          const room = env.CHAT_ROOM.get(doId);
          await room.fetch(new Request("https://internal/broadcast", {
            method: "POST",
            body: JSON.stringify({ type: "call_accepted", payload: { call_id, answer, user_id: dev.uid, timestamp: Date.now() } }),
          }));
        } catch {}
        return ok({ success: true, call_id, status: "active" });
      }

      if (path === "/api/calls/ice" && method === "POST") {
        const { call_id, candidate } = await request.json() as any;
        if (!call_id || !candidate) return err("call_id and candidate required");
        try {
          const doId = env.CHAT_ROOM.idFromName(`call:${call_id}`);
          const room = env.CHAT_ROOM.get(doId);
          await room.fetch(new Request("https://internal/broadcast", {
            method: "POST",
            body: JSON.stringify({ type: "ice_candidate", payload: { call_id, candidate, user_id: dev.uid } }),
          }));
        } catch {}
        return ok({ success: true });
      }

      // ═══ DEV MANAGEMENT ═══
      if (path === "/api/dev/me" && method === "GET") {
        return ok({ developer: { uid: dev.uid, username: dev.username, tier: dev.tier, features } });
      }

      if (path === "/api/dev/webhook" && method === "POST") {
        const { webhook_url } = await request.json() as any;
        return ok({ success: true, webhook_url });
      }

      // ═══ SHOP ═══
      if (path === "/api/shop/stickers" && method === "GET") {
        return ok({
          stickers: [
            { id: "megan-greetings", name: "Megan Greetings", icon: "👋", count: 12, price_mgc: 10 },
            { id: "megan-reactions", name: "Mega Reactions", icon: "🔥", count: 20, price_mgc: 15 },
            { id: "megan-kenya", name: "Kenyan Expressions", icon: "🇰🇪", count: 15, price_mgc: 20 },
            { id: "megan-crypto", name: "Crypto Moods", icon: "📈", count: 18, price_mgc: 25 },
          ],
        });
      }

      if (path === "/api/shop/emojis" && method === "GET") {
        const { getAllEmojis, getEmojiCount, searchEmojis } = await import("./shop/emojis");
        const q = url.searchParams.get("q") || "";
        if (q) return ok({ query: q, results: searchEmojis(q) });
        const all = getAllEmojis();
        return ok({ total_emojis: getEmojiCount(), categories: all.map(c => ({ name: c.category, count: c.count, preview: c.emojis.slice(0, 5).join(" ") })), emojis: all });
      }

      // ═══ WEBSOCKET ═══
      if (path === "/ws") {
        const userId = url.searchParams.get("user_id") || dev.uid;
        const username = url.searchParams.get("username") || dev.username;
        const roomId = url.searchParams.get("room_id") || "global";
        const doId = env.CHAT_ROOM.idFromName(roomId);
        const wsUrl = new URL(request.url);
        wsUrl.searchParams.set("user_id", userId);
        wsUrl.searchParams.set("username", username);
        wsUrl.searchParams.set("room_id", roomId);
        return env.CHAT_ROOM.get(doId).fetch(new Request(wsUrl.toString(), request));
      }

      return err("Not found", 404);
    } catch (e: any) {
      return err(e.message || "Internal error", 500);
    }
  },
};
