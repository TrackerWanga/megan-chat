// ═══════════════════════════════════════════════════════════
// Megan Chat v3 — Types
// ═══════════════════════════════════════════════════════════

export interface Env {
  DB: D1Database;
  CHAT_ROOM: DurableObjectNamespace;
  AUTH_URL: string;
  INTERNAL_SECRET: string;
  ENVIRONMENT: string;
}

export interface Developer {
  uid: string;
  username: string;
  email: string;
  tier: string;
  api_key: string;
  webhook_url?: string;
  storage_config?: StorageConfig;
  created_at: number;
}

export interface StorageConfig {
  type: 'd1' | 'firebase' | 'supabase' | 'postgresql' | 'mysql' | 'mongodb' | 'custom';
  connection?: string;
  api_key?: string;
  url?: string;
  table?: string;
  headers?: Record<string, string>;
}

export interface RelayMessage {
  room_id: string;
  sender_id: string;
  sender_username: string;
  text: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'poll' | 'sticker';
  reply_to?: string;
  timestamp: number;
}

export interface PresenceEvent {
  user_id: string;
  username: string;
  status: 'online' | 'away' | 'offline';
  last_seen: number;
}

export interface TypingEvent {
  room_id: string;
  user_id: string;
  username: string;
  is_typing: boolean;
}

export interface RecordingEvent {
  room_id: string;
  user_id: string;
  username: string;
  is_recording: boolean;
  duration?: number;
}

export interface ReadReceipt {
  room_id: string;
  message_id: string;
  user_id: string;
  status: 'delivered' | 'read';
  timestamp: number;
}

export interface WebRTCSignal {
  type: 'offer' | 'answer' | 'ice_candidate' | 'hangup';
  from: string;
  to: string;
  call_id: string;
  data: any;
}

export interface TierFeatures {
  messages_per_day: number;
  ws_connections: number;
  rooms: number;
  file_transfer_mb: number;
  webrtc_audio: boolean;
  webrtc_video: boolean;
  e2ee: boolean;
  custom_domain: boolean;
  white_label: boolean;
  priority_signaling: boolean;
}

export const TIER_FEATURES: Record<string, TierFeatures> = {
  bronze: {
    messages_per_day: 1000, ws_connections: 100, rooms: 10,
    file_transfer_mb: 0, webrtc_audio: false, webrtc_video: false,
    e2ee: false, custom_domain: false, white_label: false, priority_signaling: false,
  },
  silver: {
    messages_per_day: 10000, ws_connections: 500, rooms: 100,
    file_transfer_mb: 10, webrtc_audio: false, webrtc_video: false,
    e2ee: false, custom_domain: false, white_label: false, priority_signaling: false,
  },
  gold: {
    messages_per_day: 100000, ws_connections: 2000, rooms: 1000,
    file_transfer_mb: 100, webrtc_audio: true, webrtc_video: false,
    e2ee: false, custom_domain: true, white_label: false, priority_signaling: true,
  },
  diamond: {
    messages_per_day: 999999999, ws_connections: 99999, rooms: 999999,
    file_transfer_mb: 9999, webrtc_audio: true, webrtc_video: true,
    e2ee: true, custom_domain: true, white_label: true, priority_signaling: true,
  },
  admin: {
    messages_per_day: 999999999, ws_connections: 99999, rooms: 999999,
    file_transfer_mb: 9999, webrtc_audio: true, webrtc_video: true,
    e2ee: true, custom_domain: true, white_label: true, priority_signaling: true,
  },
};

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, x-master-key",
  "Access-Control-Allow-Credentials": "true",
};

export function ok(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function err(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
