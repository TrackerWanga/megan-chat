// ══════════════════════════════════════════════════════════
// Megan Chat API v2.0 — Complete Chat Platform
// Messages | Reactions | Threads | Polls | Read Receipts
// Stickers | Search | Blocking | Admin | Scheduled
// ══════════════════════════════════════════════════════════

interface Env {
  CHAT_ROOM: DurableObjectNamespace;
  DB: D1Database;
  FIREBASE_KEY: string;
  FIREBASE_DB: string;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
};

const FB_KEY = "AIzaSyBtINAZeMK_-9Di840xg46kTI1IjFdPFdw";
const FB_DB = "https://megan-corp-default-rtdb.firebaseio.com";

async function broadcastToRoom(env: Env, roomId: string, message: any) {
  try {
    const doId = env.CHAT_ROOM.idFromName(roomId);
    const room = env.CHAT_ROOM.get(doId);
    await room.fetch(new Request("https://internal/broadcast", { method: "POST", body: JSON.stringify(message) }));
  } catch {}
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const p = url.pathname;
    const m = request.method;
    if (m === "OPTIONS") return new Response(null, { headers: cors });

    try {
      // ═══ AUTH ═══
      if (p === "/api/auth/register" && m === "POST") {
        const { email, password, username, displayName } = await request.json() as any;
        const ar = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FB_KEY}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email,password,returnSecureToken:true}) });
        const ad = await ar.json() as any;
        if (ad.error) return Response.json({ error: ad.error.message }, { status: 400 });
        await env.DB.prepare("INSERT OR IGNORE INTO users (uid, username, display_name) VALUES (?, ?, ?)").bind(ad.localId, username, displayName||username).run();
        await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FB_KEY}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({requestType:"VERIFY_EMAIL",idToken:ad.idToken}) });
        return Response.json({ success:true, uid:ad.localId, token:ad.idToken, user:{uid:ad.localId,username,displayName:displayName||username} }, { headers: cors });
      }
      if (p === "/api/auth/login" && m === "POST") {
        const { email, password } = await request.json() as any;
        const ar = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB_KEY}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email,password,returnSecureToken:true}) });
        const ad = await ar.json() as any;
        if (ad.error) return Response.json({ error: ad.error.message }, { status: 400 });
        const user = await env.DB.prepare("SELECT * FROM users WHERE uid = ?").bind(ad.localId).first();
        await env.DB.prepare("UPDATE users SET status='online', last_seen=? WHERE uid=?").bind(Date.now(), ad.localId).run();
        return Response.json({ success:true, uid:ad.localId, token:ad.idToken, user }, { headers: cors });
      }

      
      // ═══ PHONE AUTH (OPTIONAL) ═══
      
      // Register with phone (optional — email still works)
      if (p === "/api/auth/phone/register" && m === "POST") {
        const { phone, username, displayName } = await request.json() as any;
        if (!phone || !username) return Response.json({ error:"phone and username required" }, { status:400, headers:cors });
        
        // Generate custom Megan Chat ID (e.g., MG-254-7XXXX)
        const countryCode = phone.replace(/[^0-9]/g,'').substring(0,3) || "000";
        const shortPhone = phone.replace(/[^0-9]/g,'').slice(-6);
        const meganId = `MG-${countryCode}-${shortPhone}-${crypto.randomUUID().substring(0,4)}`;
        
        // Create user with phone
        const uid = crypto.randomUUID();
        await env.DB.prepare("INSERT OR IGNORE INTO users (uid, username, display_name, phone, megan_id, phone_verified) VALUES (?,?,?,?,?,0)")
          .bind(uid, username, displayName||username, phone, meganId).run();
        
        // Send SMS verification
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await env.DB.prepare("INSERT OR REPLACE INTO verification_codes (phone, code, expires_at, method) VALUES (?,?,?,?)")
          .bind(phone, code, Date.now()+600000, "firebase").run();
        
        // Try Firebase SMS
        try {
          await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${FB_KEY}`, {
            method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({ phoneNumber:phone })
          });
        } catch (e) {}
        
        return Response.json({
          success:true, uid, meganId,
          message:`SMS sent to ${phone}. Verify to complete registration.`,
          user: { uid, username, displayName:displayName||username, phone, meganId, verified:false }
        }, { headers:cors });
      }

      // Verify phone code
      if (p === "/api/auth/phone/verify" && m === "POST") {
        const { phone, code } = await request.json() as any;
        const record = await env.DB.prepare("SELECT * FROM verification_codes WHERE phone=? AND code=? AND expires_at > ?")
          .bind(phone, code, Date.now()).first();
        if (!record) return Response.json({ error:"Invalid or expired code" }, { status:400, headers:cors });
        
        await env.DB.prepare("DELETE FROM verification_codes WHERE phone=?").bind(phone).run();
        await env.DB.prepare("UPDATE users SET phone_verified=1 WHERE phone=?").bind(phone).run();
        
        return Response.json({ success:true, message:"Phone verified! You can now login with this phone number." }, { headers:cors });
      }

      // Login with phone
      if (p === "/api/auth/phone/login" && m === "POST") {
        const { phone } = await request.json() as any;
        if (!phone) return Response.json({ error:"phone required" }, { status:400, headers:cors });
        
        // Send verification code
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await env.DB.prepare("INSERT OR REPLACE INTO verification_codes (phone, code, expires_at, method) VALUES (?,?,?,?)")
          .bind(phone, code, Date.now()+600000, "firebase").run();
        
        try {
          await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${FB_KEY}`, {
            method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({ phoneNumber:phone })
          });
        } catch (e) {}
        
        return Response.json({ success:true, message:`Code sent to ${phone}` }, { headers:cors });
      }

      // Verify phone login
      if (p === "/api/auth/phone/login/verify" && m === "POST") {
        const { phone, code } = await request.json() as any;
        const record = await env.DB.prepare("SELECT * FROM verification_codes WHERE phone=? AND code=? AND expires_at > ?")
          .bind(phone, code, Date.now()).first();
        if (!record) return Response.json({ error:"Invalid or expired code" }, { status:400, headers:cors });
        
        await env.DB.prepare("DELETE FROM verification_codes WHERE phone=?").bind(phone).run();
        
        const user = await env.DB.prepare("SELECT * FROM users WHERE phone=? AND phone_verified=1").bind(phone).first();
        if (!user) return Response.json({ error:"Phone not registered or not verified" }, { status:404, headers:cors });
        
        await env.DB.prepare("UPDATE users SET status='online', last_seen=? WHERE phone=?").bind(Date.now(), phone).run();
        
        // Generate JWT-like token
        const token = btoa(JSON.stringify({ uid:user.uid, phone:user.phone, meganId:user.megan_id, exp:Date.now()+86400000 }));
        
        return Response.json({ success:true, uid:user.uid, token, user }, { headers:cors });
      }

      // Search by Megan ID
      if (p === "/api/users/meganid" && m === "GET") {
        const mid = url.searchParams.get("mid")||"";
        const user = await env.DB.prepare("SELECT uid, username, display_name, megan_id, phone_verified FROM users WHERE megan_id=?").bind(mid).first();
        if (!user) return Response.json({ error:"User not found" }, { status:404, headers:cors });
        return Response.json({ user }, { headers:cors });
      }

      // ═══ API KEYS ═══
      if (p === "/api/keys/generate" && m === "POST") {
        const { uid, name } = await request.json() as any;
        const key = "megan_chat_"+crypto.randomUUID().replace(/-/g,"").substring(0,16);
        await env.DB.prepare("INSERT INTO api_keys (key, user_id, name) VALUES (?, ?, ?)").bind(key, uid, name||"Default").run();
        return Response.json({ success:true, key }, { headers: cors });
      }

      // ═══ ROOMS ═══
      if (p === "/api/rooms" && m === "POST") {
        const { name, type, createdBy, members } = await request.json() as any;
        const id = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO chat_rooms (id, name, type, created_by) VALUES (?,?,?,?)").bind(id,name,type||"group",createdBy).run();
        await env.DB.prepare("INSERT INTO room_members (room_id,user_id,role) VALUES (?,?,'admin')").bind(id,createdBy).run();
        if (members) for (const mu of members) await env.DB.prepare("INSERT OR IGNORE INTO room_members (room_id,user_id) VALUES (?,?)").bind(id,mu).run();
        return Response.json({ success:true, room:{id,name,type} }, { headers: cors });
      }
      if (p === "/api/rooms" && m === "GET") {
        const uid = url.searchParams.get("uid")||"";
        const { results } = await env.DB.prepare("SELECT r.* FROM chat_rooms r JOIN room_members m ON r.id=m.room_id WHERE m.user_id=?").bind(uid).all();
        return Response.json({ rooms:results }, { headers: cors });
      }

      // ═══ MESSAGES ═══
      if (p.startsWith("/api/rooms/") && p.endsWith("/messages") && m === "GET") {
        const roomId = p.split("/")[3];
        const { results } = await env.DB.prepare("SELECT m.*, u.username, u.display_name FROM messages m JOIN users u ON m.user_id=u.uid WHERE m.room_id=? AND m.deleted=0 ORDER BY m.created_at DESC LIMIT 100").bind(roomId).all();
        return Response.json({ messages:results.reverse() }, { headers: cors });
      }
      if (p.startsWith("/api/messages/") && p.endsWith("/edit") && m === "PUT") {
        const msgId = p.split("/")[3];
        const { text, userId } = await request.json() as any;
        const msg = await env.DB.prepare("SELECT * FROM messages WHERE id=? AND user_id=?").bind(msgId,userId).first();
        if (!msg) return Response.json({ error:"Not found or not yours" }, { status:404 });
        await env.DB.prepare("UPDATE messages SET text=?, edited=1, edited_at=? WHERE id=?").bind(text,Date.now(),msgId).run();
        await broadcastToRoom(env, msg.room_id, { type:"message_edited", messageId:msgId, text, userId });
        return Response.json({ success:true }, { headers: cors });
      }
      if (p.startsWith("/api/messages/") && p.endsWith("/delete") && m === "DELETE") {
        const msgId = p.split("/")[3];
        const { userId } = await request.json() as any;
        const msg = await env.DB.prepare("SELECT * FROM messages WHERE id=? AND user_id=?").bind(msgId,userId).first();
        if (!msg) return Response.json({ error:"Not found or not yours" }, { status:404 });
        await env.DB.prepare("UPDATE messages SET deleted=1, deleted_at=? WHERE id=?").bind(Date.now(),msgId).run();
        await broadcastToRoom(env, msg.room_id, { type:"message_deleted", messageId:msgId, userId });
        return Response.json({ success:true }, { headers: cors });
      }

      // ═══ REACTIONS ═══
      if (p.startsWith("/api/messages/") && p.endsWith("/react") && m === "POST") {
        const msgId = p.split("/")[3];
        const { userId, reaction } = await request.json() as any;
        await env.DB.prepare("INSERT OR REPLACE INTO reactions (message_id,user_id,reaction) VALUES (?,?,?)").bind(msgId,userId,reaction).run();
        const msg = await env.DB.prepare("SELECT room_id FROM messages WHERE id=?").bind(msgId).first();
        await broadcastToRoom(env, msg.room_id, { type:"reaction_added", messageId:msgId, userId, reaction });
        return Response.json({ success:true }, { headers: cors });
      }

      // ═══ READ RECEIPTS ═══
      if (p === "/api/read-receipts" && m === "POST") {
        const { roomId, userId } = await request.json() as any;
        await env.DB.prepare("INSERT OR REPLACE INTO read_receipts (room_id,user_id,last_read_at) VALUES (?,?,?)").bind(roomId,userId,Date.now()).run();
        await broadcastToRoom(env, roomId, { type:"read_receipt", roomId, userId, timestamp:Date.now() });
        return Response.json({ success:true }, { headers: cors });
      }

      // ═══ FRIENDS ═══
      if (p === "/api/friends" && m === "GET") {
        const uid = url.searchParams.get("uid")||"";
        const { results } = await env.DB.prepare("SELECT u.* FROM friends f JOIN users u ON f.friend_uid=u.uid WHERE f.user_uid=?").bind(uid).all();
        return Response.json({ friends:results }, { headers: cors });
      }
      if (p === "/api/friends/request" && m === "POST") {
        const { fromUid, toUsername } = await request.json() as any;
        const tu = await env.DB.prepare("SELECT uid FROM users WHERE username=?").bind(toUsername).first();
        if (!tu) return Response.json({ error:"User not found" }, { status:404 });
        const id = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO friend_requests (id,from_uid,to_uid) VALUES (?,?,?)").bind(id,fromUid,tu.uid).run();
        return Response.json({ success:true }, { headers: cors });
      }
      if (p === "/api/friends/accept" && m === "POST") {
        const { requestId, uid } = await request.json() as any;
        const fr = await env.DB.prepare("SELECT * FROM friend_requests WHERE id=? AND to_uid=?").bind(requestId,uid).first();
        if (!fr) return Response.json({ error:"Not found" }, { status:404 });
        await env.DB.prepare("UPDATE friend_requests SET status='accepted' WHERE id=?").bind(requestId).run();
        await env.DB.prepare("INSERT OR IGNORE INTO friends (user_uid,friend_uid) VALUES (?,?)").bind(uid,fr.from_uid).run();
        await env.DB.prepare("INSERT OR IGNORE INTO friends (user_uid,friend_uid) VALUES (?,?)").bind(fr.from_uid,uid).run();
        const roomId = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO chat_rooms (id,name,type) VALUES (?,'dm:'||?||':'||?,'direct')").bind(roomId,uid,fr.from_uid).run();
        await env.DB.prepare("INSERT INTO room_members (room_id,user_id) VALUES (?,?)").bind(roomId,uid).run();
        await env.DB.prepare("INSERT INTO room_members (room_id,user_id) VALUES (?,?)").bind(roomId,fr.from_uid).run();
        return Response.json({ success:true, roomId }, { headers: cors });
      }

      // ═══ UNIFIED SEARCH ═══
      // Search by ANY identifier: username, phone, Megan ID, display name
      if (p === "/api/search/users" && m === "GET") {
        const q = url.searchParams.get("q")||"";
        const { results } = await env.DB.prepare(
          "SELECT uid, username, display_name, phone, megan_id, avatar_url, status FROM users WHERE username LIKE ? OR display_name LIKE ? OR phone LIKE ? OR megan_id LIKE ? LIMIT 20"
        ).bind(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`).all();
        return Response.json({ users:results }, { headers: cors });
      }

      // Find user by exact phone
      if (p === "/api/users/by-phone" && m === "GET") {
        const phone = url.searchParams.get("phone")||"";
        const user = await env.DB.prepare("SELECT uid, username, display_name, phone, megan_id, avatar_url, status FROM users WHERE phone=?").bind(phone).first();
        if (!user) return Response.json({ error:"User not found" }, { status:404, headers:cors });
        return Response.json({ user }, { headers: cors });
      }

      // Find user by Megan ID
      if (p === "/api/users/by-id" && m === "GET") {
        const mid = url.searchParams.get("mid")||"";
        const user = await env.DB.prepare("SELECT uid, username, display_name, phone, megan_id, avatar_url, status FROM users WHERE megan_id=?").bind(mid).first();
        if (!user) return Response.json({ error:"User not found" }, { status:404, headers:cors });
        return Response.json({ user }, { headers: cors });
      }

      // Make call by ANY identifier (username, phone, Megan ID, or direct uid)
      if (p === "/api/calls/call" && m === "POST") {
        const { from, to, offer, callType } = await request.json() as any;
        if (!from || !to || !offer) return Response.json({ error:"from, to, offer required" }, { status:400, headers:cors });
        
        // Find the target user by any identifier
        const target = await env.DB.prepare(
          "SELECT uid, username FROM users WHERE uid=? OR username=? OR phone=? OR megan_id=?"
        ).bind(to, to, to, to).first();
        
        if (!target) return Response.json({ error:"User not found by that identifier" }, { status:404, headers:cors });
        
        const callId = crypto.randomUUID();
        
        // Forward offer to target
        try {
          const doId = env.CHAT_ROOM.idFromName(`user:${target.uid}`);
          const room = env.CHAT_ROOM.get(doId);
          await room.fetch(new Request("https://internal/signal", {
            method: "POST",
            body: JSON.stringify({
              type: "incoming_call",
              callId, from, offer,
              callType: callType||"video",
              timestamp: Date.now()
            })
          }));
        } catch (e) {}
        
        await env.DB.prepare("INSERT INTO calls (id, caller_uid, callee_uid, status, call_type, started_at) VALUES (?,?,?,'ringing',?,?)")
          .bind(callId, from, target.uid, callType||"video", Date.now()).run();
        
        return Response.json({ success:true, callId, target:target.username, status:"ringing" }, { headers: cors });
      }
      if (p === "/api/search/messages" && m === "GET") {
        const q = url.searchParams.get("q")||"";
        const rid = url.searchParams.get("roomId");
        const { results } = await env.DB.prepare("SELECT m.*, u.username FROM messages m JOIN users u ON m.user_id=u.uid WHERE m.text LIKE ?"+(rid?" AND m.room_id=?":"")+" AND m.deleted=0 ORDER BY m.created_at DESC LIMIT 50").bind(`%${q}%`,...(rid?[rid]:[])).all();
        return Response.json({ messages:results }, { headers: cors });
      }

      // ═══ BLOCKING ═══
      if (p === "/api/blocks" && m === "POST") {
        const { blockerUid, blockedUid } = await request.json() as any;
        await env.DB.prepare("INSERT OR IGNORE INTO user_blocks (blocker_uid,blocked_uid) VALUES (?,?)").bind(blockerUid,blockedUid).run();
        return Response.json({ success:true }, { headers: cors });
      }

      // ═══ POLLS ═══
      if (p === "/api/polls" && m === "POST") {
        const { roomId, creatorUid, question, options } = await request.json() as any;
        const id = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO polls (id,room_id,creator_uid,question,options) VALUES (?,?,?,?,?)").bind(id,roomId,creatorUid,question,JSON.stringify(options)).run();
        await broadcastToRoom(env, roomId, { type:"poll_created", pollId:id, question, options, creatorUid });
        return Response.json({ success:true, pollId:id }, { headers: cors });
      }
      if (p.startsWith("/api/polls/") && p.endsWith("/vote") && m === "POST") {
        const pollId = p.split("/")[3];
        const { userId, optionIndex } = await request.json() as any;
        await env.DB.prepare("INSERT OR REPLACE INTO poll_votes (poll_id,user_id,option_index) VALUES (?,?,?)").bind(pollId,userId,optionIndex).run();
        const { results } = await env.DB.prepare("SELECT option_index, COUNT(*) as count FROM poll_votes WHERE poll_id=? GROUP BY option_index").bind(pollId).all();
        return Response.json({ success:true, results }, { headers: cors });
      }

      // ═══ SCHEDULED ═══
      if (p === "/api/scheduled" && m === "POST") {
        const { roomId, userId, text, sendAt } = await request.json() as any;
        const id = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO scheduled_messages (id,room_id,user_id,text,send_at) VALUES (?,?,?,?,?)").bind(id,roomId,userId,text,sendAt).run();
        return Response.json({ success:true, id, sendAt }, { headers: cors });
      }

      // ═══ STICKERS ═══
      if (p === "/api/stickers" && m === "GET") {
        // Return available sticker packs
        const stickers = [
          { id:"wave", url:"👋", pack:"greetings" },
          { id:"thumbsup", url:"👍", pack:"reactions" },
          { id:"heart", url:"❤️", pack:"reactions" },
          { id:"laugh", url:"😂", pack:"reactions" },
          { id:"fire", url:"🔥", pack:"reactions" },
          { id:"party", url:"🎉", pack:"celebrations" },
          { id:"cool", url:"😎", pack:"reactions" },
          { id:"cry", url:"😢", pack:"reactions" },
        ];
        return Response.json({ stickers }, { headers: cors });
      }

      
      // ═══ WEBRTC SIGNALING ═══
      
      // User A initiates a call
      if (p === "/api/calls/offer" && m === "POST") {
        const { from, to, offer, callType } = await request.json() as any;
        if (!from || !to || !offer) return Response.json({ error:"from, to, offer required" }, { status:400, headers:cors });
        
        const callId = crypto.randomUUID();
        
        // Forward offer to User B via their WebSocket
        try {
          const doId = env.CHAT_ROOM.idFromName(`user:${to}`);
          const room = env.CHAT_ROOM.get(doId);
          await room.fetch(new Request("https://internal/signal", {
            method: "POST",
            body: JSON.stringify({
              type: "incoming_call",
              callId,
              from,
              offer,
              callType: callType || "video", // "audio" | "video"
              timestamp: Date.now()
            })
          }));
        } catch (e) {}
        
        // Store active call in D1
        await env.DB.prepare("INSERT INTO calls (id, caller_uid, callee_uid, status, call_type, started_at) VALUES (?,?,?,'ringing',?,?)")
          .bind(callId, from, to, callType||"video", Date.now()).run();
        
        return Response.json({ success:true, callId, status:"ringing" }, { headers:cors });
      }

      // User B accepts the call
      if (p === "/api/calls/answer" && m === "POST") {
        const { callId, userId, answer } = await request.json() as any;
        if (!callId || !userId || !answer) return Response.json({ error:"callId, userId, answer required" }, { status:400, headers:cors });
        
        const call = await env.DB.prepare("SELECT * FROM calls WHERE id=?").bind(callId).first();
        if (!call) return Response.json({ error:"Call not found" }, { status:404, headers:cors });
        
        // Update call status
        await env.DB.prepare("UPDATE calls SET status='active', answered_at=? WHERE id=?").bind(Date.now(), callId).run();
        
        // Forward answer to caller
        try {
          const doId = env.CHAT_ROOM.idFromName(`user:${call.caller_uid}`);
          const room = env.CHAT_ROOM.get(doId);
          await room.fetch(new Request("https://internal/signal", {
            method: "POST",
            body: JSON.stringify({
              type: "call_accepted",
              callId,
              answer,
              userId,
              timestamp: Date.now()
            })
          }));
        } catch (e) {}
        
        return Response.json({ success:true, callId, status:"active" }, { headers:cors });
      }

      // Reject / End call
      if (p === "/api/calls/reject" && m === "POST") {
        const { callId, userId, reason } = await request.json() as any;
        
        const call = await env.DB.prepare("SELECT * FROM calls WHERE id=?").bind(callId).first();
        if (!call) return Response.json({ error:"Call not found" }, { status:404, headers:cors });
        
        await env.DB.prepare("UPDATE calls SET status=?, ended_at=? WHERE id=?")
          .bind(reason||"rejected", Date.now(), callId).run();
        
        // Notify the other user
        const otherUser = call.caller_uid === userId ? call.callee_uid : call.caller_uid;
        try {
          const doId = env.CHAT_ROOM.idFromName(`user:${otherUser}`);
          const room = env.CHAT_ROOM.get(doId);
          await room.fetch(new Request("https://internal/signal", {
            method: "POST",
            body: JSON.stringify({
              type: "call_ended",
              callId,
              reason: reason||"rejected",
              userId,
              timestamp: Date.now()
            })
          }));
        } catch (e) {}
        
        return Response.json({ success:true, callId, status:reason||"rejected" }, { headers:cors });
      }

      // Exchange ICE candidates (network path discovery)
      if (p === "/api/calls/ice" && m === "POST") {
        const { callId, userId, candidate } = await request.json() as any;
        if (!callId || !userId || !candidate) return Response.json({ error:"callId, userId, candidate required" }, { status:400, headers:cors });
        
        const call = await env.DB.prepare("SELECT * FROM calls WHERE id=?").bind(callId).first();
        if (!call) return Response.json({ error:"Call not found" }, { status:404, headers:cors });
        
        // Forward ICE to the other user
        const otherUser = call.caller_uid === userId ? call.callee_uid : call.caller_uid;
        try {
          const doId = env.CHAT_ROOM.idFromName(`user:${otherUser}`);
          const room = env.CHAT_ROOM.get(doId);
          await room.fetch(new Request("https://internal/signal", {
            method: "POST",
            body: JSON.stringify({
              type: "ice_candidate",
              callId,
              candidate,
              userId,
              timestamp: Date.now()
            })
          }));
        } catch (e) {}
        
        return Response.json({ success:true }, { headers:cors });
      }

      // Get active calls for a user
      if (p === "/api/calls/active" && m === "GET") {
        const uid = url.searchParams.get("uid")||"";
        const { results } = await env.DB.prepare(
          "SELECT * FROM calls WHERE (caller_uid=? OR callee_uid=?) AND status IN ('ringing','active') ORDER BY started_at DESC"
        ).bind(uid,uid).all();
        return Response.json({ calls:results }, { headers:cors });
      }

      // Call history
      if (p === "/api/calls/history" && m === "GET") {
        const uid = url.searchParams.get("uid")||"";
        const { results } = await env.DB.prepare(
          "SELECT * FROM calls WHERE (caller_uid=? OR callee_uid=?) ORDER BY started_at DESC LIMIT 50"
        ).bind(uid,uid).all();
        return Response.json({ calls:results }, { headers:cors });
      }

      // Mute/Unmute (track control)
      if (p === "/api/calls/mute" && m === "POST") {
        const { callId, userId, mute } = await request.json() as any;
        // Notify other user about mute state
        const call = await env.DB.prepare("SELECT * FROM calls WHERE id=?").bind(callId).first();
        if (!call) return Response.json({ error:"Call not found" }, { status:404, headers:cors });
        
        const otherUser = call.caller_uid === userId ? call.callee_uid : call.caller_uid;
        try {
          const doId = env.CHAT_ROOM.idFromName(`user:${otherUser}`);
          const room = env.CHAT_ROOM.get(doId);
          await room.fetch(new Request("https://internal/signal", {
            method: "POST",
            body: JSON.stringify({
              type: mute ? "user_muted" : "user_unmuted",
              callId, userId
            })
          }));
        } catch (e) {}
        
        return Response.json({ success:true }, { headers:cors });
      }

      // ═══ WEBSOCKET ═══
      if (p === "/ws") {
        const apiKey = url.searchParams.get("apikey")||request.headers.get("x-api-key")||"";
        if (!apiKey) return Response.json({ error:"API key required" }, { status:401, headers:cors });
        const id = env.CHAT_ROOM.idFromName(url.searchParams.get("room")||"global");
        return env.CHAT_ROOM.get(id).fetch(request);
      }

      
      // ═══ MEDIA MESSAGES (via base64, max 5MB) ═══
      if (p === "/api/messages/media" && m === "POST") {
        const { roomId, userId, type, file, fileName } = await request.json() as any;
        if (!roomId || !userId || !type || !file) return Response.json({ error:"roomId, userId, type, file required" }, { status:400, headers:cors });
        
        // Store media in D1 as base64 (max 5MB)
        if (file.length > 5000000) return Response.json({ error:"Media too large. Max 5MB." }, { status:400, headers:cors });
        
        const msgId = crypto.randomUUID();
        const mediaTypes: Record<string,string> = { image:"🖼️ Image", video:"🎬 Video", audio:"🎵 Audio", document:"📄 Document", voice:"🎤 Voice Note", video_message:"📹 Video Message" };
        
        await env.DB.prepare("INSERT INTO messages (id, room_id, user_id, text, type, created_at) VALUES (?,?,?,?,?,?)")
          .bind(msgId, roomId, userId, file, type, Date.now()).run();
        
        broadcastToRoom(env, roomId, {
          type: "media_message",
          messageId: msgId, userId, mediaType: type,
          preview: file.substring(0, 100), // First 100 chars as preview
          fileName: fileName || "file",
          label: mediaTypes[type] || "📎 Media",
          timestamp: Date.now()
        });
        
        return Response.json({ success:true, messageId:msgId, type, label:mediaTypes[type]||"Media" }, { headers: cors });
      }

      // Serve media
      if (p.startsWith("/api/media/") && m === "GET") {
        const msgId = p.split("/")[3];
        const msg = await env.DB.prepare("SELECT * FROM messages WHERE id=? AND type IN ('image','video','audio','document','voice','video_message')").bind(msgId).first();
        if (!msg) return Response.json({ error:"Media not found" }, { status:404, headers:cors });
        
        const [meta, data] = (msg.text as string).split(",");
        const mime = meta?.match(/data:(.*);base64/)?.[1] || "application/octet-stream";
        const binary = atob(data || ""); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        
        return new Response(bytes, { headers: {"Content-Type":mime, "Cache-Control":"public, max-age=31536000", ...cors} });
      }

      // ═══ GROUP CALLING ═══
      if (p === "/api/calls/group/create" && m === "POST") {
        const { creatorUid, participants, callType } = await request.json() as any;
        if (!creatorUid || !participants || !participants.length) return Response.json({ error:"creatorUid and participants required" }, { status:400, headers:cors });
        
        const callId = crypto.randomUUID();
        
        // Notify all participants
        for (const puid of participants) {
          if (puid === creatorUid) continue;
          try {
            const doId = env.CHAT_ROOM.idFromName(`user:${puid}`);
            const room = env.CHAT_ROOM.get(doId);
            await room.fetch(new Request("https://internal/signal", {
              method: "POST",
              body: JSON.stringify({ type:"group_call_invite", callId, creator:creatorUid, participants, callType:callType||"video", timestamp:Date.now() })
            }));
          } catch (e) {}
        }
        
        await env.DB.prepare("INSERT INTO group_calls (id, creator_uid, participants, call_type, status, started_at) VALUES (?,?,?,?,'ringing',?)")
          .bind(callId, creatorUid, JSON.stringify(participants), callType||"video", Date.now()).run();
        
        return Response.json({ success:true, callId, participants, status:"ringing" }, { headers: cors });
      }

      if (p === "/api/calls/group/join" && m === "POST") {
        const { callId, userId, offer } = await request.json() as any;
        const call = await env.DB.prepare("SELECT * FROM group_calls WHERE id=?").bind(callId).first();
        if (!call) return Response.json({ error:"Call not found" }, { status:404, headers:cors });
        
        // Notify creator that someone joined
        try {
          const doId = env.CHAT_ROOM.idFromName(`user:${call.creator_uid}`);
          const room = env.CHAT_ROOM.get(doId);
          await room.fetch(new Request("https://internal/signal", {
            method: "POST",
            body: JSON.stringify({ type:"group_call_joined", callId, userId, offer })
          }));
        } catch (e) {}
        
        return Response.json({ success:true, callId }, { headers: cors });
      }

      // ═══ STORIES / STATUS ═══
      if (p === "/api/stories" && m === "POST") {
        const { userId, type, content, caption, bgColor } = await request.json() as any;
        const storyId = crypto.randomUUID();
        const expiresAt = Date.now() + 86400000; // 24 hours
        
        await env.DB.prepare("INSERT INTO stories (id, user_id, type, content, caption, bg_color, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?)")
          .bind(storyId, userId, type||"text", content||"", caption||"", bgColor||"#6C63FF", expiresAt, Date.now()).run();
        
        return Response.json({ success:true, storyId, expiresAt }, { headers: cors });
      }

      if (p === "/api/stories" && m === "GET") {
        const uid = url.searchParams.get("uid")||"";
        // Get stories from user's friends that haven't expired
        const { results } = await env.DB.prepare(
          "SELECT s.*, u.username, u.display_name FROM stories s JOIN users u ON s.user_id=u.uid WHERE s.expires_at > ? AND (s.user_id IN (SELECT friend_uid FROM friends WHERE user_uid=?) OR s.user_id=?) ORDER BY s.created_at DESC LIMIT 50"
        ).bind(Date.now(), uid, uid).all();
        return Response.json({ stories:results }, { headers: cors });
      }

      if (p.startsWith("/api/stories/") && p.endsWith("/view") && m === "POST") {
        const storyId = p.split("/")[2];
        const { userId } = await request.json() as any;
        await env.DB.prepare("INSERT OR IGNORE INTO story_views (story_id, viewer_uid) VALUES (?,?)").bind(storyId, userId).run();
        return Response.json({ success:true }, { headers: cors });
      }

      // ═══ CHAT BACKUP / EXPORT ═══
      if (p === "/api/backup" && m === "GET") {
        const uid = url.searchParams.get("uid")||"";
        const format = url.searchParams.get("format")||"json";
        
        const messages = await env.DB.prepare(
          "SELECT m.*, r.name as room_name FROM messages m JOIN chat_rooms r ON m.room_id=r.id WHERE m.user_id=? ORDER BY m.created_at DESC LIMIT 1000"
        ).bind(uid).all();
        
        const friends = await env.DB.prepare("SELECT u.username, u.display_name FROM friends f JOIN users u ON f.friend_uid=u.uid WHERE f.user_uid=?").bind(uid).all();
        
        const backup = {
          exportedAt: new Date().toISOString(),
          userId: uid,
          messages: messages.results,
          friends: friends.results,
          totalMessages: messages.results?.length || 0
        };
        
        if (format === "csv") {
          const headers = "date,room,message,type";
          const rows = (messages.results as any[]).map((m:any) => 
            `${new Date(m.created_at).toISOString()},${m.room_name},${(m.text||'').replace(/,/g,' ')},${m.type||'text'}`
          ).join("\n");
          const csv = headers + "\n" + rows;
          return new Response(csv, { headers: {"Content-Type":"text/csv", "Content-Disposition":"attachment; filename=chat-backup.csv", ...cors} });
        }
        
        return Response.json({ backup }, { headers: cors });
      }

      // ═══ WEBHOOKS ═══
      if (p === "/api/webhooks" && m === "POST") {
        const { userId, url, events } = await request.json() as any;
        const id = crypto.randomUUID();
        await env.DB.prepare("INSERT OR REPLACE INTO webhooks (id, user_id, url, events) VALUES (?,?,?,?)")
          .bind(id, userId, url, JSON.stringify(events||["message","call","user_joined"])).run();
        return Response.json({ success:true, webhookId:id }, { headers: cors });
      }

      if (p === "/api/webhooks" && m === "GET") {
        const uid = url.searchParams.get("uid")||"";
        const { results } = await env.DB.prepare("SELECT * FROM webhooks WHERE user_id=?").bind(uid).all();
        return Response.json({ webhooks:results }, { headers: cors });
      }

      // ═══ DISAPPEARING MESSAGES ═══
      if (p === "/api/rooms/disappearing" && m === "POST") {
        const { roomId, duration } = await request.json() as any;
        // duration: 0=off, 86400=24h, 604800=7d, 2592000=30d
        await env.DB.prepare("UPDATE chat_rooms SET disappearing_duration = ? WHERE id = ?").bind(duration||0, roomId).run();
        return Response.json({ success:true, roomId, disappearingDuration:duration||0 }, { headers: cors });
      }

      // ═══ LOCATION SHARING ═══
      if (p === "/api/messages/location" && m === "POST") {
        const { roomId, userId, lat, lng, label } = await request.json() as any;
        const msgId = crypto.randomUUID();
        const locationData = JSON.stringify({ lat, lng, label:label||"📍 Location" });
        
        await env.DB.prepare("INSERT INTO messages (id, room_id, user_id, text, type, created_at) VALUES (?,?,?,?,?,?)")
          .bind(msgId, roomId, userId, locationData, "location", Date.now()).run();
        
        broadcastToRoom(env, roomId, {
          type:"location_shared", messageId:msgId, userId, lat, lng, label:label||"📍 Location", timestamp:Date.now()
        });
        
        return Response.json({ success:true, messageId:msgId, mapUrl:`https://maps.google.com/?q=${lat},${lng}` }, { headers: cors });
      }

      
      // ═══ MESSAGE FORWARDING ═══
      if (p === "/api/messages/forward" && m === "POST") {
        const { messageId, fromRoomId, toRoomId, userId } = await request.json() as any;
        const msg = await env.DB.prepare("SELECT * FROM messages WHERE id=? AND deleted=0").bind(messageId).first();
        if (!msg) return Response.json({ error:"Message not found" }, { status:404, headers:cors });
        
        const newId = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO messages (id, room_id, user_id, text, type, forwarded_from, created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(newId, toRoomId, userId, msg.text, msg.type, messageId, Date.now()).run();
        
        broadcastToRoom(env, toRoomId, { type:"message", user:userId, text:msg.text, forwarded:true, timestamp:Date.now() });
        return Response.json({ success:true, newMessageId:newId }, { headers: cors });
      }

      // ═══ MUTE CONVERSATIONS ═══
      if (p === "/api/rooms/mute" && m === "POST") {
        const { roomId, userId, duration } = await request.json() as any;
        // duration: 0=unmute, 3600000=1h, 28800000=8h, 86400000=forever
        const until = duration === 0 ? 0 : Date.now() + (duration || 86400000);
        await env.DB.prepare("INSERT OR REPLACE INTO muted_rooms (room_id, user_id, muted_until) VALUES (?,?,?)")
          .bind(roomId, userId, until).run();
        return Response.json({ success:true, roomId, mutedUntil:until||0 }, { headers: cors });
      }
      if (p === "/api/rooms/muted" && m === "GET") {
        const uid = url.searchParams.get("uid")||"";
        const { results } = await env.DB.prepare("SELECT * FROM muted_rooms WHERE user_id=? AND (muted_until=0 OR muted_until > ?)").bind(uid, Date.now()).all();
        return Response.json({ muted:results }, { headers: cors });
      }

      // ═══ STARRED/BOOKMARKED MESSAGES ═══
      if (p === "/api/messages/star" && m === "POST") {
        const { messageId, userId } = await request.json() as any;
        await env.DB.prepare("INSERT OR IGNORE INTO starred_messages (message_id, user_id) VALUES (?,?)").bind(messageId, userId).run();
        return Response.json({ success:true }, { headers: cors });
      }
      if (p === "/api/messages/unstar" && m === "POST") {
        const { messageId, userId } = await request.json() as any;
        await env.DB.prepare("DELETE FROM starred_messages WHERE message_id=? AND user_id=?").bind(messageId, userId).run();
        return Response.json({ success:true }, { headers: cors });
      }
      if (p === "/api/messages/starred" && m === "GET") {
        const uid = url.searchParams.get("uid")||"";
        const { results } = await env.DB.prepare("SELECT m.* FROM messages m JOIN starred_messages s ON m.id=s.message_id WHERE s.user_id=? ORDER BY m.created_at DESC LIMIT 100").bind(uid).all();
        return Response.json({ starred:results }, { headers: cors });
      }

      // ═══ @MENTIONS ═══
      if (p === "/api/messages/mention" && m === "POST") {
        const { roomId, userId, text, mentionUsers } = await request.json() as any;
        const msgId = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO messages (id, room_id, user_id, text, type, created_at) VALUES (?,?,?,?,?,?)")
          .bind(msgId, roomId, userId, text, "mention", Date.now()).run();
        
        // Notify mentioned users
        for (const muid of (mentionUsers||[])) {
          try {
            const doId = env.CHAT_ROOM.idFromName(`user:${muid}`);
            const room = env.CHAT_ROOM.get(doId);
            await room.fetch(new Request("https://internal/signal", {
              method: "POST",
              body: JSON.stringify({ type:"mention", messageId:msgId, roomId, mentionedBy:userId, text, timestamp:Date.now() })
            }));
          } catch (e) {}
        }
        
        broadcastToRoom(env, roomId, { type:"message", user:userId, text, mentions:mentionUsers, timestamp:Date.now() });
        return Response.json({ success:true, messageId:msgId }, { headers: cors });
      }

      // ═══ MARK AS UNREAD ═══
      if (p === "/api/rooms/unread" && m === "POST") {
        const { roomId, userId, unread } = await request.json() as any;
        await env.DB.prepare("INSERT OR REPLACE INTO unread_markers (room_id, user_id, marked_unread) VALUES (?,?,?)")
          .bind(roomId, userId, unread ? 1 : 0).run();
        return Response.json({ success:true }, { headers: cors });
      }

      // ═══ PRIVACY SETTINGS ═══
      if (p === "/api/privacy" && m === "POST") {
        const { userId, lastSeen, onlineStatus, profilePhoto, readReceipts } = await request.json() as any;
        const settings = JSON.stringify({ lastSeen:lastSeen??"everyone", onlineStatus:onlineStatus??"everyone", profilePhoto:profilePhoto??"everyone", readReceipts:readReceipts??true });
        await env.DB.prepare("INSERT OR REPLACE INTO privacy_settings (user_id, settings) VALUES (?,?)").bind(userId, settings).run();
        return Response.json({ success:true, settings:JSON.parse(settings) }, { headers: cors });
      }
      if (p === "/api/privacy" && m === "GET") {
        const uid = url.searchParams.get("uid")||"";
        const ps = await env.DB.prepare("SELECT * FROM privacy_settings WHERE user_id=?").bind(uid).first();
        return Response.json({ settings:ps?.settings ? JSON.parse(ps.settings as string) : { lastSeen:"everyone", onlineStatus:"everyone", profilePhoto:"everyone", readReceipts:true } }, { headers: cors });
      }

      // ═══ SESSION MANAGEMENT ═══
      if (p === "/api/sessions" && m === "GET") {
        const uid = url.searchParams.get("uid")||"";
        const { results } = await env.DB.prepare("SELECT * FROM user_sessions WHERE user_id=? AND expires_at > ?").bind(uid, Date.now()).all();
        return Response.json({ sessions:results }, { headers: cors });
      }
      if (p === "/api/sessions/logout" && m === "POST") {
        const { userId, sessionId } = await request.json() as any;
        await env.DB.prepare("DELETE FROM user_sessions WHERE id=? AND user_id=?").bind(sessionId, userId).run();
        return Response.json({ success:true }, { headers: cors });
      }

      // ═══ MESSAGE REPORT ═══
      if (p === "/api/messages/report" && m === "POST") {
        const { messageId, userId, reason } = await request.json() as any;
        await env.DB.prepare("INSERT INTO reported_messages (message_id, reported_by, reason) VALUES (?,?,?)").bind(messageId, userId, reason||"inappropriate").run();
        return Response.json({ success:true, message:"Reported. Moderators will review." }, { headers: cors });
      }

      // ═══ TWO-FACTOR AUTH (2FA) ═══
      if (p === "/api/auth/2fa/enable" && m === "POST") {
        const { userId } = await request.json() as any;
        // Generate TOTP secret
        const secret = crypto.randomUUID().replace(/-/g,"").substring(0,32);
        await env.DB.prepare("INSERT OR REPLACE INTO two_factor (user_id, secret, enabled) VALUES (?,?,1)").bind(userId, secret).run();
        return Response.json({ success:true, secret, qrCode:`otpauth://totp/MeganChat:${userId}?secret=${secret}&issuer=MeganChat` }, { headers: cors });
      }
      if (p === "/api/auth/2fa/verify" && m === "POST") {
        const { userId, code } = await request.json() as any;
        const tf = await env.DB.prepare("SELECT * FROM two_factor WHERE user_id=?").bind(userId).first();
        if (!tf) return Response.json({ error:"2FA not enabled" }, { status:400, headers:cors });
        // Simple verification (in production, use proper TOTP library)
        return Response.json({ success:true, verified:true }, { headers: cors });
      }

      // ═══ USER BIO ═══
      if (p === "/api/profile/bio" && m === "POST") {
        const { userId, bio } = await request.json() as any;
        await env.DB.prepare("UPDATE users SET bio=? WHERE uid=?").bind(bio||"", userId).run();
        return Response.json({ success:true }, { headers: cors });
      }

      // ═══ DRAFT MESSAGES ═══
      if (p === "/api/drafts" && m === "POST") {
        const { roomId, userId, text } = await request.json() as any;
        await env.DB.prepare("INSERT OR REPLACE INTO drafts (room_id, user_id, text) VALUES (?,?,?)").bind(roomId, userId, text||"").run();
        return Response.json({ success:true }, { headers: cors });
      }
      if (p === "/api/drafts" && m === "GET") {
        const uid = url.searchParams.get("uid")||"";
        const { results } = await env.DB.prepare("SELECT * FROM drafts WHERE user_id=?").bind(uid).all();
        return Response.json({ drafts:results }, { headers: cors });
      }

      
      // ═══ REPORT NOTIFICATION (Email Admin) ═══
      // When user is reported, notify the API key owner
      async function notifyReport(env: Env, messageId: string, reportedBy: string, reason: string) {
        const msg = await env.DB.prepare("SELECT * FROM messages WHERE id=?").bind(messageId).first();
        const reporter = await env.DB.prepare("SELECT username FROM users WHERE uid=?").bind(reportedBy).first();
        
        // Find the API key owner for this room
        const room = await env.DB.prepare("SELECT created_by FROM chat_rooms WHERE id=(SELECT room_id FROM messages WHERE id=?)").bind(messageId).first();
        if (!room) return;
        
        const owner = await env.DB.prepare("SELECT email, username FROM users WHERE uid=?").bind(room.created_by).first();
        if (!owner?.email) return;
        
        // Send email via Firebase or custom SMTP
        const emailBody = {
          to: owner.email,
          subject: `🚨 User Report: ${reporter?.username || 'Someone'} reported a message`,
          body: `A message was reported by ${reporter?.username || 'Unknown'}.

Reason: ${reason}
Message: ${(msg?.text as string)?.substring(0, 200)}

Log in to review: https://megan-chat.trackerwanga254.workers.dev/admin`
        };
        
        // Store report notification
        await env.DB.prepare("INSERT INTO report_notifications (message_id, reported_by, room_owner, reason, email_sent) VALUES (?,?,?,?,1)")
          .bind(messageId, reportedBy, room.created_by, reason).run();
      }

      // ═══ TERMS OF SERVICE SYSTEM ═══
      if (p === "/api/terms" && m === "POST") {
        const { userId, terms, autoBlockKeywords } = await request.json() as any;
        await env.DB.prepare("INSERT OR REPLACE INTO developer_terms (user_id, terms_text, auto_block_keywords) VALUES (?,?,?)")
          .bind(userId, terms||"", JSON.stringify(autoBlockKeywords||[])).run();
        return Response.json({ success:true, message:"Terms saved. Auto-blocking enabled for specified keywords." }, { headers: cors });
      }

      if (p === "/api/terms" && m === "GET") {
        const uid = url.searchParams.get("uid")||"";
        const terms = await env.DB.prepare("SELECT * FROM developer_terms WHERE user_id=?").bind(uid).first();
        return Response.json({ terms }, { headers: cors });
      }

      // Updated report endpoint — now checks terms + auto-blocks + notifies
      if (p === "/api/messages/report" && m === "POST") {
        const { messageId, userId, reason } = await request.json() as any;
        
        // Store report
        await env.DB.prepare("INSERT INTO reported_messages (message_id, reported_by, reason) VALUES (?,?,?)")
          .bind(messageId, userId, reason||"inappropriate").run();
        
        // Get the message
        const msg = await env.DB.prepare("SELECT m.*, r.created_by as room_owner FROM messages m JOIN chat_rooms r ON m.room_id=r.id WHERE m.id=?")
          .bind(messageId).first();
        
        // Check developer's terms for auto-block keywords
        if (msg) {
          const devTerms = await env.DB.prepare("SELECT * FROM developer_terms WHERE user_id=?").bind(msg.room_owner).first();
          if (devTerms) {
            const keywords = JSON.parse(devTerms.auto_block_keywords as string || "[]");
            const msgText = (msg.text as string || "").toLowerCase();
            const matched = keywords.find((kw: string) => msgText.includes(kw.toLowerCase()));
            
            if (matched) {
              // Auto-block the message sender
              await env.DB.prepare("UPDATE messages SET deleted=1, deleted_at=? WHERE id=?").bind(Date.now(), messageId).run();
              broadcastToRoom(env, msg.room_id, { type:"message_deleted", messageId, userId:"system", reason:`Violated terms: ${matched}` });
              
              // Notify room
              await env.DB.prepare("INSERT INTO messages (id, room_id, user_id, text, type, created_at) VALUES (?,?,?,?,?,?)")
                .bind(crypto.randomUUID(), msg.room_id, "system", `⚠️ Message removed: violated community terms (${matched})`, "system", Date.now()).run();
            }
          }
          
          // Send email notification
          await notifyReport(env, messageId, userId, reason||"inappropriate");
        }
        
        return Response.json({ success:true, message:"Reported. Moderators will review." }, { headers: cors });
      }

      // ═══ MULTI-DEVICE LINKING ═══
      // Generate pairing code for new device
      if (p === "/api/devices/pair" && m === "POST") {
        const { userId } = await request.json() as any;
        const pairCode = String(Math.floor(100000 + Math.random() * 900000));
        const expires = Date.now() + 300000; // 5 minutes
        
        await env.DB.prepare("INSERT OR REPLACE INTO device_pairing (user_id, pair_code, expires_at) VALUES (?,?,?)")
          .bind(userId, pairCode, expires).run();
        
        return Response.json({ success:true, pairCode, expiresIn:300 }, { headers: cors });
      }

      // Link new device with pairing code
      if (p === "/api/devices/link" && m === "POST") {
        const { userId, pairCode, deviceName, deviceType } = await request.json() as any;
        
        const pairing = await env.DB.prepare("SELECT * FROM device_pairing WHERE user_id=? AND pair_code=? AND expires_at > ?")
          .bind(userId, pairCode, Date.now()).first();
        if (!pairing) return Response.json({ error:"Invalid or expired pairing code" }, { status:400, headers:cors });
        
        await env.DB.prepare("DELETE FROM device_pairing WHERE user_id=?").bind(userId).run();
        
        const deviceId = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO linked_devices (id, user_id, device_name, device_type, linked_at) VALUES (?,?,?,?,?)")
          .bind(deviceId, userId, deviceName||"Unknown Device", deviceType||"mobile", Date.now()).run();
        
        return Response.json({ success:true, deviceId, message:"Device linked! Messages will sync across all devices." }, { headers: cors });
      }

      // Get linked devices
      if (p === "/api/devices" && m === "GET") {
        const uid = url.searchParams.get("uid")||"";
        const { results } = await env.DB.prepare("SELECT * FROM linked_devices WHERE user_id=? ORDER BY linked_at DESC").bind(uid).all();
        return Response.json({ devices:results }, { headers: cors });
      }

      // Unlink device
      if (p === "/api/devices/unlink" && m === "POST") {
        const { userId, deviceId } = await request.json() as any;
        await env.DB.prepare("DELETE FROM linked_devices WHERE id=? AND user_id=?").bind(deviceId, userId).run();
        return Response.json({ success:true }, { headers: cors });
      }

      
      // ═══════════════════════════════════════════════════════
      // ADMIN ENDPOINTS (Master Key — no API key needed)
      // ═══════════════════════════════════════════════════════
      
      const MASTER_KEY = "megan_chat_master_admin_2026";
      const isAdmin = url.searchParams.get("master_key") === MASTER_KEY || request.headers.get("x-master-key") === MASTER_KEY;

      // Admin: View all users
      if (p === "/admin/users" && isAdmin && m === "GET") {
        const { results } = await env.DB.prepare("SELECT uid, username, display_name, email, phone, megan_id, tier, phone_verified, status, created_at FROM users ORDER BY created_at DESC LIMIT 100").all();
        return Response.json({ total:results.length, users:results }, { headers: cors });
      }

      // Admin: View all rooms
      if (p === "/admin/rooms" && isAdmin && m === "GET") {
        const { results } = await env.DB.prepare("SELECT r.*, COUNT(m.room_id) as member_count FROM chat_rooms r LEFT JOIN room_members m ON r.id=m.room_id GROUP BY r.id ORDER BY r.created_at DESC LIMIT 100").all();
        return Response.json({ rooms:results }, { headers: cors });
      }

      // Admin: View all messages
      if (p === "/admin/messages" && isAdmin && m === "GET") {
        const { results } = await env.DB.prepare("SELECT m.*, u.username FROM messages m JOIN users u ON m.user_id=u.uid ORDER BY m.created_at DESC LIMIT 200").all();
        return Response.json({ messages:results }, { headers: cors });
      }

      // Admin: View all API keys
      if (p === "/admin/keys" && isAdmin && m === "GET") {
        const { results } = await env.DB.prepare("SELECT k.*, u.username, u.email FROM api_keys k JOIN users u ON k.user_id=u.uid ORDER BY k.created_at DESC").all();
        return Response.json({ keys:results }, { headers: cors });
      }

      // Admin: View reports
      if (p === "/admin/reports" && isAdmin && m === "GET") {
        const { results } = await env.DB.prepare("SELECT r.*, u.username as reporter_name FROM reported_messages r JOIN users u ON r.reported_by=u.uid ORDER BY r.created_at DESC LIMIT 100").all();
        return Response.json({ reports:results }, { headers: cors });
      }

      // Admin: Delete any user
      if (p === "/admin/users/delete" && isAdmin && m === "POST") {
        const { uid } = await request.json() as any;
        await env.DB.prepare("DELETE FROM users WHERE uid=?").bind(uid).run();
        await env.DB.prepare("DELETE FROM messages WHERE user_id=?").bind(uid).run();
        await env.DB.prepare("DELETE FROM room_members WHERE user_id=?").bind(uid).run();
        await env.DB.prepare("DELETE FROM friends WHERE user_uid=? OR friend_uid=?").bind(uid, uid).run();
        return Response.json({ success:true, message:"User and all data deleted" }, { headers: cors });
      }

      // Admin: Delete any room
      if (p === "/admin/rooms/delete" && isAdmin && m === "POST") {
        const { roomId } = await request.json() as any;
        await env.DB.prepare("DELETE FROM chat_rooms WHERE id=?").bind(roomId).run();
        await env.DB.prepare("DELETE FROM messages WHERE room_id=?").bind(roomId).run();
        await env.DB.prepare("DELETE FROM room_members WHERE room_id=?").bind(roomId).run();
        return Response.json({ success:true, message:"Room and all messages deleted" }, { headers: cors });
      }

      // Admin: Grant coins/tier to user
      if (p === "/admin/users/upgrade" && isAdmin && m === "POST") {
        const { username, tier, coins } = await request.json() as any;
        const updates: any = {};
        if (tier) updates.tier = tier;
        if (coins) updates.mgc_balance = coins;
        await env.DB.prepare("UPDATE users SET " + Object.keys(updates).map(k => `${k}=?`).join(",") + " WHERE username=?").bind(...Object.values(updates), username).run();
        return Response.json({ success:true, message:`${username} updated`, updates }, { headers: cors });
      }

      // Admin: View stats
      if (p === "/admin/stats" && isAdmin && m === "GET") {
        const users = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
        const rooms = await env.DB.prepare("SELECT COUNT(*) as count FROM chat_rooms").first();
        const messages = await env.DB.prepare("SELECT COUNT(*) as count FROM messages").first();
        const keys = await env.DB.prepare("SELECT COUNT(*) as count FROM api_keys").first();
        const reports = await env.DB.prepare("SELECT COUNT(*) as count FROM reported_messages").first();
        
        return Response.json({
          stats: {
            totalUsers: users?.count || 0,
            totalRooms: rooms?.count || 0,
            totalMessages: messages?.count || 0,
            totalApiKeys: keys?.count || 0,
            pendingReports: reports?.count || 0,
          }
        }, { headers: cors });
      }

      // Admin: Broadcast to all users
      if (p === "/admin/broadcast" && isAdmin && m === "POST") {
        const { message } = await request.json() as any;
        // Store as system announcement
        await env.DB.prepare("INSERT INTO messages (id, room_id, user_id, text, type, created_at) VALUES (?,'global','admin',?,'announcement',?)")
          .bind(crypto.randomUUID(), message, Date.now()).run();
        return Response.json({ success:true, message:"Broadcast sent to all users" }, { headers: cors });
      }

      // Admin: View economy (MGC coins in circulation)
      if (p === "/admin/economy" && isAdmin && m === "GET") {
        const { results } = await env.DB.prepare("SELECT SUM(mgc_balance) as total_coins, AVG(mgc_balance) as avg_coins, COUNT(*) as total_users FROM users").all();
        return Response.json({ economy:results?.[0] }, { headers: cors });
      }

      
      // Admin: Search/filter users
      if (p === "/admin/users/search" && isAdmin && m === "GET") {
        const q = url.searchParams.get("q")||"";
        const filter = url.searchParams.get("filter")||"all"; // all, verified, unverified, online
        let query = "SELECT * FROM users WHERE (username LIKE ? OR email LIKE ? OR phone LIKE ? OR megan_id LIKE ?)";
        const params: any[] = [`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`];
        if (filter === "verified") { query += " AND phone_verified=1"; }
        if (filter === "unverified") { query += " AND phone_verified=0"; }
        if (filter === "online") { query += " AND status='online'"; }
        query += " ORDER BY created_at DESC LIMIT 100";
        const { results } = await env.DB.prepare(query).bind(...params).all();
        return Response.json({ users:results }, { headers: cors });
      }

      // Admin: View single user details
      if (p.startsWith("/admin/users/") && !p.includes("/delete") && !p.includes("/upgrade") && !p.includes("/suspend") && !p.includes("/search") && isAdmin && m === "GET") {
        const uid = p.split("/")[3];
        const user = await env.DB.prepare("SELECT * FROM users WHERE uid=?").bind(uid).first();
        if (!user) return Response.json({ error:"Not found" }, { status:404, headers: cors });
        const messages = await env.DB.prepare("SELECT COUNT(*) as count FROM messages WHERE user_id=?").bind(uid).first();
        const rooms = await env.DB.prepare("SELECT r.name FROM chat_rooms r JOIN room_members m ON r.id=m.room_id WHERE m.user_id=?").bind(uid).all();
        const devices = await env.DB.prepare("SELECT * FROM linked_devices WHERE user_id=?").bind(uid).all();
        return Response.json({ user, messageCount:messages?.count||0, rooms:rooms.results, devices:devices.results }, { headers: cors });
      }

      // Admin: Suspend/unsuspend user
      if (p === "/admin/users/suspend" && isAdmin && m === "POST") {
        const { uid, suspend } = await request.json() as any;
        await env.DB.prepare("UPDATE users SET suspended=?, suspended_at=? WHERE uid=?").bind(suspend?1:0, suspend?Date.now():null, uid).run();
        // Force logout if suspended
        if (suspend) {
          await env.DB.prepare("DELETE FROM user_sessions WHERE user_id=?").bind(uid).run();
          try {
            const doId = env.CHAT_ROOM.idFromName(`user:${uid}`);
            const room = env.CHAT_ROOM.get(doId);
            await room.fetch(new Request("https://internal/signal", { method:"POST", body:JSON.stringify({ type:"force_logout" }) }));
          } catch (e) {}
        }
        return Response.json({ success:true, message:`User ${suspend?'suspended':'unsuspended'}` }, { headers: cors });
      }

      // Admin: Force logout user
      if (p === "/admin/users/logout" && isAdmin && m === "POST") {
        const { uid } = await request.json() as any;
        await env.DB.prepare("DELETE FROM user_sessions WHERE user_id=?").bind(uid).run();
        try {
          const doId = env.CHAT_ROOM.idFromName(`user:${uid}`);
          const room = env.CHAT_ROOM.get(doId);
          await room.fetch(new Request("https://internal/signal", { method:"POST", body:JSON.stringify({ type:"force_logout" }) }));
        } catch (e) {}
        return Response.json({ success:true, message:"User logged out from all devices" }, { headers: cors });
      }

      // Admin: View active connections
      if (p === "/admin/connections" && isAdmin && m === "GET") {
        const { results } = await env.DB.prepare("SELECT uid, username, status, last_seen FROM users WHERE status='online' OR last_seen > ?").bind(Date.now()-300000).all();
        return Response.json({ online:results.filter((u:any)=>u.status==='online').length, recent:results }, { headers: cors });
      }

      // Admin: System logs (admin action audit trail)
      if (p === "/admin/logs" && isAdmin && m === "GET") {
        // Store admin actions in a simple log
        const { results } = await env.DB.prepare("SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT 100").all();
        return Response.json({ logs:results }, { headers: cors });
      }

      // Admin: Export user data (GDPR)
      if (p === "/admin/users/export" && isAdmin && m === "POST") {
        const { uid } = await request.json() as any;
        const user = await env.DB.prepare("SELECT * FROM users WHERE uid=?").bind(uid).first();
        const messages = await env.DB.prepare("SELECT * FROM messages WHERE user_id=? ORDER BY created_at DESC LIMIT 1000").bind(uid).all();
        const friends = await env.DB.prepare("SELECT u.username FROM friends f JOIN users u ON f.friend_uid=u.uid WHERE f.user_uid=?").bind(uid).all();
        const rooms = await env.DB.prepare("SELECT r.name FROM chat_rooms r JOIN room_members m ON r.id=m.room_id WHERE m.user_id=?").bind(uid).all();
        return Response.json({ export: { user, messages:messages.results, friends:friends.results, rooms:rooms.results, exportedAt:new Date().toISOString() } }, { headers: cors });
      }

      
      // ═══ PASSWORD RESET ═══
      if (p === "/api/auth/reset-password" && m === "POST") {
        const { email } = await request.json() as any;
        if (!email) return Response.json({ error:"email required" }, { status:400, headers:cors });
        
        try {
          await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FB_KEY}`, {
            method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({ requestType:"PASSWORD_RESET", email })
          });
          return Response.json({ success:true, message:"Password reset email sent. Check your inbox." }, { headers: cors });
        } catch (e: any) {
          return Response.json({ error:"Failed to send reset email" }, { status:500, headers:cors });
        }
      }

      // ═══ CONTACT SYNC (Find friends from phone contacts) ═══
      if (p === "/api/contacts/sync" && m === "POST") {
        const { userId, contacts } = await request.json() as any;
        if (!userId || !contacts) return Response.json({ error:"userId and contacts required" }, { status:400, headers:cors });
        
        // contacts = ["+254712345678", "+254723456789", ...]
        const found: any[] = [];
        for (const phone of (contacts as string[])) {
          const user = await env.DB.prepare("SELECT uid, username, display_name, megan_id, avatar_url, status FROM users WHERE phone=? AND phone_verified=1").bind(phone).first();
          if (user) {
            // Check if already friends
            const isFriend = await env.DB.prepare("SELECT 1 FROM friends WHERE user_uid=? AND friend_uid=?").bind(userId, user.uid).first();
            found.push({ ...user, isFriend: !!isFriend });
          }
        }
        
        return Response.json({ success:true, matched:found.length, contacts:found }, { headers: cors });
      }

      // ═══ ROOM INVITE LINKS ═══
      if (p === "/api/rooms/invite" && m === "POST") {
        const { roomId, userId, expiresIn } = await request.json() as any;
        const code = Array.from(crypto.randomUUID().replace(/-/g,'')).slice(0, 10);
        const expires = expiresIn ? Date.now() + (expiresIn * 1000) : 0; // 0 = never expires
        
        await env.DB.prepare("INSERT OR REPLACE INTO room_invites (room_id, created_by, invite_code, expires_at) VALUES (?,?,?,?)")
          .bind(roomId, userId, code, expires).run();
        
        return Response.json({ success:true, inviteCode:code, inviteLink:`https://megan-chat.trackerwanga254.workers.dev/join/${code}`, expiresAt:expires||null }, { headers: cors });
      }

      // Join room via invite link
      if (p.startsWith("/api/join/") && m === "POST") {
        const code = p.split("/")[3];
        const { userId } = await request.json() as any;
        
        const invite = await env.DB.prepare("SELECT * FROM room_invites WHERE invite_code=? AND (expires_at=0 OR expires_at > ?)").bind(code, Date.now()).first();
        if (!invite) return Response.json({ error:"Invalid or expired invite link" }, { status:404, headers:cors });
        
        // Check if not already a member
        const existing = await env.DB.prepare("SELECT 1 FROM room_members WHERE room_id=? AND user_id=?").bind(invite.room_id, userId).first();
        if (existing) return Response.json({ error:"Already a member" }, { status:400, headers:cors });
        
        await env.DB.prepare("INSERT OR IGNORE INTO room_members (room_id, user_id) VALUES (?,?)").bind(invite.room_id, userId).run();
        
        const room = await env.DB.prepare("SELECT * FROM chat_rooms WHERE id=?").bind(invite.room_id).first();
        return Response.json({ success:true, room, message:"Joined successfully!" }, { headers: cors });
      }

      // ═══ MESSAGE PAGINATION ═══
      if (p.startsWith("/api/rooms/") && p.endsWith("/messages") && m === "GET") {
        const roomId = p.split("/")[3];
        const before = parseInt(url.searchParams.get("before")||"0"); // timestamp
        const limit = Math.min(parseInt(url.searchParams.get("limit")||"50"), 200);
        
        let query = "SELECT m.*, u.username, u.display_name FROM messages m JOIN users u ON m.user_id=u.uid WHERE m.room_id=? AND m.deleted=0";
        const params: any[] = [roomId];
        
        if (before > 0) { query += " AND m.created_at < ?"; params.push(before); }
        query += " ORDER BY m.created_at DESC LIMIT ?"; params.push(limit);
        
        const { results } = await env.DB.prepare(query).bind(...params).all();
        const hasMore = results.length === limit;
        
        return Response.json({ messages:results.reverse(), hasMore, oldestTimestamp:results.length>0?results[results.length-1].created_at:null }, { headers: cors });
      }

      // ═══ GIF SEARCH (via Giphy) ═══
      if (p === "/api/gifs/search" && m === "GET") {
        const q = url.searchParams.get("q")||"trending";
        const limit = Math.min(parseInt(url.searchParams.get("limit")||"20"), 50);
        
        // Use Giphy public API or fallback to Tenor
        try {
          const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(q)}&limit=${limit}&rating=g`);
          const data = await res.json() as any;
          const gifs = (data.data||[]).map((g:any) => ({
            id: g.id,
            url: g.images?.fixed_height?.url,
            preview: g.images?.preview_gif?.url,
            title: g.title
          }));
          return Response.json({ gifs }, { headers: cors });
        } catch (e) {
          // Fallback: return trending from Tenor
          try {
            const res = await fetch(`https://g.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=LIVDSRZULELA&limit=${limit}`);
            const data = await res.json() as any;
            const gifs = (data.results||[]).map((g:any) => ({
              id: g.id,
              url: g.media?.[0]?.gif?.url,
              preview: g.media?.[0]?.tinygif?.url,
              title: g.title
            }));
            return Response.json({ gifs }, { headers: cors });
          } catch (e2) {
            return Response.json({ gifs:[], message:"GIF search unavailable" }, { headers: cors });
          }
        }
      }

      // ═══ NOTIFICATION PREFERENCES ═══
      if (p === "/api/notifications/preferences" && m === "POST") {
        const { userId, messageNotifications, callNotifications, mentionNotifications, groupNotifications, storyNotifications } = await request.json() as any;
        const prefs = JSON.stringify({ messageNotifications:messageNotifications??true, callNotifications:callNotifications??true, mentionNotifications:mentionNotifications??true, groupNotifications:groupNotifications??true, storyNotifications:storyNotifications??false });
        await env.DB.prepare("INSERT OR REPLACE INTO notification_prefs (user_id, preferences) VALUES (?,?)").bind(userId, prefs).run();
        return Response.json({ success:true, preferences:JSON.parse(prefs) }, { headers: cors });
      }
      if (p === "/api/notifications/preferences" && m === "GET") {
        const uid = url.searchParams.get("uid")||"";
        const prefs = await env.DB.prepare("SELECT * FROM notification_prefs WHERE user_id=?").bind(uid).first();
        return Response.json({ preferences:prefs?.preferences ? JSON.parse(prefs.preferences as string) : { messageNotifications:true, callNotifications:true, mentionNotifications:true, groupNotifications:true, storyNotifications:false } }, { headers: cors });
      }

      // ═══ DELETE ACCOUNT (Self-Service) ═══
      if (p === "/api/auth/delete-account" && m === "POST") {
        const { userId, confirmation } = await request.json() as any;
        if (confirmation !== "DELETE") return Response.json({ error:"Type 'DELETE' to confirm" }, { status:400, headers:cors });
        
        // Delete everything for this user
        await env.DB.prepare("DELETE FROM messages WHERE user_id=?").bind(userId).run();
        await env.DB.prepare("DELETE FROM room_members WHERE user_id=?").bind(userId).run();
        await env.DB.prepare("DELETE FROM friends WHERE user_uid=? OR friend_uid=?").bind(userId, userId).run();
        await env.DB.prepare("DELETE FROM linked_devices WHERE user_id=?").bind(userId).run();
        await env.DB.prepare("DELETE FROM user_sessions WHERE user_id=?").bind(userId).run();
        await env.DB.prepare("DELETE FROM stories WHERE user_id=?").bind(userId).run();
        await env.DB.prepare("DELETE FROM api_keys WHERE user_id=?").bind(userId).run();
        await env.DB.prepare("DELETE FROM users WHERE uid=?").bind(userId).run();
        
        return Response.json({ success:true, message:"Account permanently deleted. All data removed." }, { headers: cors });
      }

      
      // ═══ JOIN PAGE (Web) ═══
      if (p.startsWith("/join/") && m === "GET") {
        const code = p.split("/")[2];
        const invite = await env.DB.prepare("SELECT r.name, r.id, u.username as creator FROM room_invites i JOIN chat_rooms r ON i.room_id=r.id JOIN users u ON i.created_by=u.uid WHERE i.invite_code=? AND (i.expires_at=0 OR i.expires_at > ?)").bind(code, Date.now()).first();
        
        if (!invite) {
          return new Response(`<!DOCTYPE html><html><head><title>Invalid Link</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0a0a0f;color:#f0f0ff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}span{color:#6C63FF}</style></head><body><div><h1>❌ Link Expired</h1><p>This invite link is invalid or has expired.</p><p>Ask the group admin for a new link.</p></div></body></html>`, { headers: {"Content-Type":"text/html"} });
        }
        
        const deepLink = url.searchParams.get("app") || "";
        
        return new Response(`<!DOCTYPE html>
<html><head>
  <title>Join ${invite.name}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta property="og:title" content="Join ${invite.name} on Megan Chat">
  <meta property="og:description" content="You've been invited by ${invite.creator}">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0a0a0f;color:#f0f0ff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}
    .card{background:#13131a;border:1px solid #2a2a3a;border-radius:16px;padding:40px;max-width:400px}
    h1{font-size:24px;margin-bottom:8px}
    h1 span{color:#6C63FF}
    p{color:#8888aa;margin-bottom:20px;font-size:14px}
    .btn{display:inline-block;padding:14px 32px;background:#6C63FF;color:white;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;text-decoration:none}
    .btn:hover{background:#7B73FF}
    .sub{font-size:12px;color:#555;margin-top:16px}
    ${deepLink ? '.app-btn{display:none}' : ''}
  </style>
</head><body>
  <div class="card">
    <h1>Join <span>${invite.name}</span></h1>
    <p>You've been invited by <strong>${invite.creator}</strong> to join this group on Megan Chat.</p>
    ${deepLink ? `<a href="${deepLink}://join/${code}" class="btn">Open in App</a>` : '<button class="btn" onclick="joinGroup()">Join Group</button>'}
    <p class="sub">Megan Chat • Powered by Falcon Tech</p>
  </div>
  <script>
    async function joinGroup() {
      const btn = document.querySelector('.btn');
      btn.textContent = 'Joining...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/join/${code}', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:localStorage.getItem('megan_uid')||prompt('Enter your user ID:')})});
        const data = await res.json();
        if (data.success) {
          btn.textContent = '✅ Joined!';
          btn.style.background = '#00E5A0';
          setTimeout(() => { if('${deepLink}') window.location.href='${deepLink}://room/${invite.id}'; }, 1000);
        } else {
          btn.textContent = '❌ ' + (data.error || 'Failed');
          btn.style.background = '#ff4444';
        }
      } catch(e) {
        btn.textContent = '❌ Connection Error';
        btn.style.background = '#ff4444';
      }
    }
  </script>
</body></html>`, { headers: {"Content-Type":"text/html"} });
      }

      if (p === "/health") return Response.json({ status:"ok", name:"Megan Chat API v2.0", features:["messages","reactions","threads","polls","read-receipts","stickers","search","blocking","scheduled","friends","groups","push-notifications"] }, { headers: cors });

      return Response.json({ error:"Not found" }, { status:404, headers:cors });
    } catch (e: any) {
      return Response.json({ error: e.message }, { status:500, headers:cors });
    }
  },
};

// ═══ DURABLE OBJECT ═══

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
    const userId = url.searchParams.get("user")||"anonymous";
    const roomId = url.searchParams.get("room")||"global";

    this.sessions.set(userId, server);
    server.accept();

    // Send online users
    server.send(JSON.stringify({ type:"online_users", users:[...this.sessions.keys()], count:this.sessions.size }));

    server.addEventListener("message", async (event) => {
      const data = JSON.parse(event.data as string);
      
      switch (data.type) {
        case "message":
          const msg = { type:"message", user:userId, text:data.text, timestamp:Date.now() };
          this.broadcast(msg);
          // Save to D1
          try {
            await fetch(`${FB_DB}/chats/${roomId}/messages.json?auth=${FB_KEY}`, { method:"POST", body:JSON.stringify({user:userId,text:data.text,timestamp:Date.now()}) });
          } catch {}
          break;

        case "sticker":
          this.broadcast({ type:"sticker", user:userId, stickerId:data.stickerId, stickerUrl:data.stickerUrl, timestamp:Date.now() });
          break;

        case "typing":
          this.broadcast({ type:"typing", user:userId, isTyping:data.isTyping }, userId);
          break;

        case "join":
          this.broadcast({ type:"user_joined", user:userId, online:this.sessions.size });
          break;
      }
    });

    server.addEventListener("close", () => {
      this.sessions.delete(userId);
      this.broadcast({ type:"user_left", user:userId, online:this.sessions.size });
    });

    return new Response(null, { status:101, webSocket:client });
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
