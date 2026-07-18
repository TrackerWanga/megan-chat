// ═══════════════════════════════════════════════════════════
// Developer Storage Adapter Interface
// Devs plug in their own database
// ═══════════════════════════════════════════════════════════

import { StorageConfig } from "../types";

export interface StorageAdapter {
  saveMessage(roomId: string, message: any): Promise<boolean>;
  getMessages(roomId: string, limit: number, before?: number): Promise<any[]>;
  deleteMessage(messageId: string): Promise<boolean>;
  editMessage(messageId: string, text: string): Promise<boolean>;
  addReaction(messageId: string, userId: string, emoji: string): Promise<boolean>;
  saveRoom(roomId: string, room: any): Promise<boolean>;
  getRooms(userId: string): Promise<any[]>;
  addRoomMember(roomId: string, userId: string): Promise<boolean>;
  testConnection(): Promise<{ success: boolean; message: string }>;
}

export function createAdapter(config: StorageConfig): StorageAdapter {
  switch (config.type) {
    case "d1":
      return new D1Adapter(config);
    case "firebase":
      return new FirebaseAdapter(config);
    case "supabase":
      return new SupabaseAdapter(config);
    case "custom":
      return new CustomAdapter(config);
    default:
      return new NoOpAdapter();
  }
}

class NoOpAdapter implements StorageAdapter {
  async saveMessage() { return true; }
  async getMessages() { return []; }
  async deleteMessage() { return true; }
  async editMessage() { return true; }
  async addReaction() { return true; }
  async saveRoom() { return true; }
  async getRooms() { return []; }
  async addRoomMember() { return true; }
  async testConnection() { return { success: true, message: "No storage configured (messages will not be persisted)" }; }
}

class D1Adapter implements StorageAdapter {
  private db: any;
  private table: string;

  constructor(config: StorageConfig) {
    this.table = config.table || "messages";
  }

  async saveMessage(roomId: string, message: any): Promise<boolean> {
    try {
      const res = await fetch(`${(this as any).config?.url || ''}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${(this as any).config?.api_key || ''}` },
        body: JSON.stringify({
          sql: `INSERT INTO ${this.table} (id, room_id, sender_id, sender_username, text, type, reply_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [message.message_id, roomId, message.sender_id, message.sender_username, message.text, message.type || "text", message.reply_to || null, message.timestamp],
        }),
      });
      return res.ok;
    } catch { return false; }
  }

  async getMessages(roomId: string, limit: number, before?: number): Promise<any[]> {
    try {
      let sql = `SELECT * FROM ${this.table} WHERE room_id = ? AND deleted = 0`;
      const params: any[] = [roomId];
      if (before) { sql += " AND created_at < ?"; params.push(before); }
      sql += " ORDER BY created_at DESC LIMIT ?";
      params.push(limit);

      const res = await fetch(`${(this as any).config?.url || ''}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${(this as any).config?.api_key || ''}` },
        body: JSON.stringify({ sql, params }),
      });
      const data = await res.json() as any;
      return data.results || [];
    } catch { return []; }
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    try {
      const res = await fetch(`${(this as any).config?.url || ''}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${(this as any).config?.api_key || ''}` },
        body: JSON.stringify({ sql: `UPDATE ${this.table} SET deleted = 1 WHERE id = ?`, params: [messageId] }),
      });
      return res.ok;
    } catch { return false; }
  }

  async editMessage(messageId: string, text: string): Promise<boolean> {
    try {
      const res = await fetch(`${(this as any).config?.url || ''}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${(this as any).config?.api_key || ''}` },
        body: JSON.stringify({ sql: `UPDATE ${this.table} SET text = ?, edited = 1 WHERE id = ?`, params: [text, messageId] }),
      });
      return res.ok;
    } catch { return false; }
  }

  async addReaction(messageId: string, userId: string, emoji: string): Promise<boolean> { return true; }
  async saveRoom(roomId: string, room: any): Promise<boolean> { return true; }
  async getRooms(userId: string): Promise<any[]> { return []; }
  async addRoomMember(roomId: string, userId: string): Promise<boolean> { return true; }
  async testConnection() {
    try {
      const res = await fetch(`${(this as any).config?.url || ''}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${(this as any).config?.api_key || ''}` },
        body: JSON.stringify({ sql: "SELECT 1" }),
      });
      return { success: res.ok, message: res.ok ? "D1 connected!" : "Connection failed" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }
}

class FirebaseAdapter implements StorageAdapter {
  private config: StorageConfig;
  constructor(config: StorageConfig) { this.config = config; }

  private async fbPut(path: string, data: any) {
    await fetch(`${this.config.url}/${path}.json?auth=${this.config.api_key}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
  }

  async saveMessage(roomId: string, message: any): Promise<boolean> {
    try {
      await this.fbPut(`rooms/${roomId}/messages/${message.message_id}`, {
        sender_id: message.sender_id, sender_username: message.sender_username,
        text: message.text, type: message.type || "text", timestamp: message.timestamp,
      });
      return true;
    } catch { return false; }
  }

  async getMessages(roomId: string, limit: number): Promise<any[]> {
    try {
      const res = await fetch(`${this.config.url}/rooms/${roomId}/messages.json?auth=${this.config.api_key}&orderBy="timestamp"&limitToLast=${limit}`);
      const data = await res.json() as any;
      return data ? Object.values(data) : [];
    } catch { return []; }
  }

  async deleteMessage() { return true; }
  async editMessage() { return true; }
  async addReaction() { return true; }
  async saveRoom() { return true; }
  async getRooms() { return []; }
  async addRoomMember() { return true; }
  async testConnection() {
    try {
      const res = await fetch(`${this.config.url}/.json?auth=${this.config.api_key}`);
      return { success: res.ok, message: res.ok ? "Firebase connected!" : "Connection failed" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }
}

class SupabaseAdapter implements StorageAdapter {
  private config: StorageConfig;
  constructor(config: StorageConfig) { this.config = config; }

  private async query(table: string, method: string, body?: any) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "apikey": this.config.api_key || "",
      "Authorization": `Bearer ${this.config.api_key || ""}`,
    };
    const url = `${this.config.url}/rest/v1/${table}`;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return res.json();
  }

  async saveMessage(roomId: string, message: any): Promise<boolean> {
    try {
      await this.query(this.config.table || "messages", "POST", {
        id: message.message_id, room_id: roomId, sender_id: message.sender_id,
        sender_username: message.sender_username, text: message.text,
        type: message.type || "text", created_at: new Date(message.timestamp).toISOString(),
      });
      return true;
    } catch { return false; }
  }

  async getMessages(roomId: string, limit: number): Promise<any[]> {
    try {
      const res = await fetch(`${this.config.url}/rest/v1/${this.config.table || 'messages'}?room_id=eq.${roomId}&order=created_at.desc&limit=${limit}`, {
        headers: { "apikey": this.config.api_key || "", "Authorization": `Bearer ${this.config.api_key || ""}` },
      });
      return await res.json() as any[];
    } catch { return []; }
  }

  async deleteMessage() { return true; }
  async editMessage() { return true; }
  async addReaction() { return true; }
  async saveRoom() { return true; }
  async getRooms() { return []; }
  async addRoomMember() { return true; }
  async testConnection() {
    try {
      const res = await fetch(`${this.config.url}/rest/v1/`, {
        headers: { "apikey": this.config.api_key || "" },
      });
      return { success: res.ok, message: res.ok ? "Supabase connected!" : "Connection failed" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }
}

class CustomAdapter implements StorageAdapter {
  private config: StorageConfig;
  constructor(config: StorageConfig) { this.config = config; }

  async saveMessage(roomId: string, message: any): Promise<boolean> {
    try {
      const res = await fetch(this.config.url || "", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(this.config.headers || {}) },
        body: JSON.stringify({ action: "save_message", room_id: roomId, message }),
      });
      return res.ok;
    } catch { return false; }
  }

  async getMessages(): Promise<any[]> { return []; }
  async deleteMessage() { return true; }
  async editMessage() { return true; }
  async addReaction() { return true; }
  async saveRoom() { return true; }
  async getRooms() { return []; }
  async addRoomMember() { return true; }
  async testConnection() {
    try {
      const res = await fetch(this.config.url || "", {
        headers: { ...(this.config.headers || {}) },
      });
      return { success: res.ok, message: res.ok ? "Custom API connected!" : "Connection failed" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }
}
