// ═══════════════════════════════════════════════════════════
// Schema Builder — Words → SQL/Firebase/Mongo
// ═══════════════════════════════════════════════════════════

interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  default?: string;
}

interface SchemaTable {
  name: string;
  fields: SchemaField[];
}

const TEMPLATES: Record<string, { name: string; description: string; icon: string; tables: Record<string, string[]> }> = {
  whatsapp: {
    name: "WhatsApp Clone",
    description: "Messaging app with calls, stories, groups",
    icon: "📱",
    tables: {
      users: ["id TEXT PRIMARY KEY", "username TEXT UNIQUE", "display_name TEXT", "avatar_url TEXT", "bio TEXT", "status TEXT DEFAULT 'Hey there! I am using Megan Chat'", "last_seen INTEGER", "created_at INTEGER"],
      rooms: ["id TEXT PRIMARY KEY", "name TEXT", "type TEXT DEFAULT 'group'", "avatar_url TEXT", "created_by TEXT", "created_at INTEGER"],
      room_members: ["room_id TEXT", "user_id TEXT", "role TEXT DEFAULT 'member'", "joined_at INTEGER", "PRIMARY KEY(room_id, user_id)"],
      messages: ["id TEXT PRIMARY KEY", "room_id TEXT", "sender_id TEXT", "text TEXT", "type TEXT DEFAULT 'text'", "reply_to TEXT", "edited INTEGER DEFAULT 0", "deleted INTEGER DEFAULT 0", "status TEXT DEFAULT 'sent'", "created_at INTEGER"],
      reactions: ["message_id TEXT", "user_id TEXT", "emoji TEXT", "created_at INTEGER", "PRIMARY KEY(message_id, user_id, emoji)"],
      calls: ["id TEXT PRIMARY KEY", "caller_id TEXT", "receiver_id TEXT", "type TEXT", "status TEXT", "duration INTEGER", "started_at INTEGER", "ended_at INTEGER"],
      stories: ["id TEXT PRIMARY KEY", "user_id TEXT", "type TEXT", "content_url TEXT", "caption TEXT", "expires_at INTEGER", "created_at INTEGER"],
      blocks: ["blocker_id TEXT", "blocked_id TEXT", "created_at INTEGER", "PRIMARY KEY(blocker_id, blocked_id)"],
    },
  },
  facebook: {
    name: "Facebook Clone",
    description: "Social network with posts, friends, groups, pages",
    icon: "📘",
    tables: {
      users: ["id TEXT PRIMARY KEY", "username TEXT UNIQUE", "display_name TEXT", "avatar_url TEXT", "cover_url TEXT", "bio TEXT", "created_at INTEGER"],
      posts: ["id TEXT PRIMARY KEY", "user_id TEXT", "text TEXT", "media_urls TEXT", "privacy TEXT DEFAULT 'public'", "created_at INTEGER", "updated_at INTEGER"],
      post_likes: ["post_id TEXT", "user_id TEXT", "created_at INTEGER", "PRIMARY KEY(post_id, user_id)"],
      post_comments: ["id TEXT PRIMARY KEY", "post_id TEXT", "user_id TEXT", "text TEXT", "created_at INTEGER"],
      friends: ["user_id TEXT", "friend_id TEXT", "status TEXT DEFAULT 'pending'", "created_at INTEGER", "PRIMARY KEY(user_id, friend_id)"],
      groups: ["id TEXT PRIMARY KEY", "name TEXT", "description TEXT", "privacy TEXT DEFAULT 'closed'", "created_by TEXT", "created_at INTEGER"],
      group_members: ["group_id TEXT", "user_id TEXT", "role TEXT DEFAULT 'member'", "joined_at INTEGER", "PRIMARY KEY(group_id, user_id)"],
      pages: ["id TEXT PRIMARY KEY", "name TEXT", "category TEXT", "description TEXT", "created_by TEXT", "created_at INTEGER"],
      page_followers: ["page_id TEXT", "user_id TEXT", "created_at INTEGER", "PRIMARY KEY(page_id, user_id)"],
    },
  },
  discord: {
    name: "Discord Clone",
    description: "Community platform with servers, channels, roles",
    icon: "💬",
    tables: {
      users: ["id TEXT PRIMARY KEY", "username TEXT UNIQUE", "discriminator TEXT", "avatar_url TEXT", "bio TEXT", "status TEXT", "created_at INTEGER"],
      servers: ["id TEXT PRIMARY KEY", "name TEXT", "icon_url TEXT", "owner_id TEXT", "created_at INTEGER"],
      server_members: ["server_id TEXT", "user_id TEXT", "nickname TEXT", "joined_at INTEGER", "PRIMARY KEY(server_id, user_id)"],
      channels: ["id TEXT PRIMARY KEY", "server_id TEXT", "name TEXT", "type TEXT DEFAULT 'text'", "topic TEXT", "position INTEGER", "created_at INTEGER"],
      messages: ["id TEXT PRIMARY KEY", "channel_id TEXT", "sender_id TEXT", "text TEXT", "type TEXT DEFAULT 'text'", "edited INTEGER DEFAULT 0", "deleted INTEGER DEFAULT 0", "created_at INTEGER"],
      roles: ["id TEXT PRIMARY KEY", "server_id TEXT", "name TEXT", "color TEXT", "permissions TEXT", "position INTEGER"],
      user_roles: ["user_id TEXT", "role_id TEXT", "PRIMARY KEY(user_id, role_id)"],
      voice_states: ["user_id TEXT PRIMARY KEY", "channel_id TEXT", "muted INTEGER DEFAULT 0", "deafened INTEGER DEFAULT 0"],
    },
  },
  twitter: {
    name: "Twitter Clone",
    description: "Micro-blogging with tweets, follows, retweets",
    icon: "🐦",
    tables: {
      users: ["id TEXT PRIMARY KEY", "username TEXT UNIQUE", "display_name TEXT", "avatar_url TEXT", "cover_url TEXT", "bio TEXT", "website TEXT", "created_at INTEGER"],
      tweets: ["id TEXT PRIMARY KEY", "user_id TEXT", "text TEXT", "media_urls TEXT", "reply_to TEXT", "retweet_of TEXT", "created_at INTEGER"],
      tweet_likes: ["tweet_id TEXT", "user_id TEXT", "created_at INTEGER", "PRIMARY KEY(tweet_id, user_id)"],
      tweet_retweets: ["tweet_id TEXT", "user_id TEXT", "created_at INTEGER", "PRIMARY KEY(tweet_id, user_id)"],
      follows: ["follower_id TEXT", "following_id TEXT", "created_at INTEGER", "PRIMARY KEY(follower_id, following_id)"],
      bookmarks: ["user_id TEXT", "tweet_id TEXT", "created_at INTEGER", "PRIMARY KEY(user_id, tweet_id)"],
      lists: ["id TEXT PRIMARY KEY", "user_id TEXT", "name TEXT", "description TEXT", "privacy TEXT DEFAULT 'public'", "created_at INTEGER"],
      list_members: ["list_id TEXT", "user_id TEXT", "added_at INTEGER", "PRIMARY KEY(list_id, user_id)"],
    },
  },
};

export function getTemplates() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({
    id, name: t.name, description: t.description, icon: t.icon,
    tables: Object.keys(t.tables).length,
  }));
}

export function getTemplate(id: string) {
  return TEMPLATES[id] || null;
}

export function generateSQL(templateId: string, database: string = "sqlite"): string {
  const template = TEMPLATES[templateId];
  if (!template) return "-- Template not found";

  let sql = `-- ${template.name} Schema\n-- Generated by Megan Chat Schema Builder\n-- Database: ${database}\n\n`;

  for (const [tableName, fields] of Object.entries(template.tables)) {
    sql += `CREATE TABLE ${tableName} (\n  ${fields.join(",\n  ")}\n);\n\n`;
  }

  // Add indexes
  sql += "-- Indexes\n";
  sql += "CREATE INDEX idx_messages_room ON messages(room_id, created_at DESC);\n";
  sql += "CREATE INDEX idx_messages_sender ON messages(sender_id);\n";
  sql += "CREATE INDEX idx_room_members_user ON room_members(user_id);\n";

  return sql;
}

export function generateFirebase(templateId: string): any {
  const template = TEMPLATES[templateId];
  if (!template) return {};

  const structure: any = {};

  for (const [tableName, fields] of Object.entries(template.tables)) {
    structure[tableName] = {};
    for (const field of fields) {
      const [name, ...rest] = field.split(" ");
      if (name !== "PRIMARY" && name !== "FOREIGN") {
        structure[tableName][name] = rest.join(" ");
      }
    }
  }

  return {
    template: template.name,
    database: "firebase-realtime-database",
    structure,
    example: {
      messages: {
        msg_001: {
          sender_id: "user_123",
          text: "Hello World!",
          type: "text",
          timestamp: Date.now(),
        },
      },
    },
  };
}

export function generateMongoDB(templateId: string): any {
  const template = TEMPLATES[templateId];
  if (!template) return {};

  const collections: any[] = [];

  for (const [tableName, fields] of Object.entries(template.tables)) {
    const schema: any = {};
    for (const field of fields) {
      const [name, type] = field.split(" ");
      if (name !== "PRIMARY" && name !== "FOREIGN") {
        schema[name] = type === "INTEGER" ? "Number" : type === "TEXT" ? "String" : type;
      }
    }
    collections.push({ name: tableName, schema, indexes: tableName === "messages" ? ["room_id", "created_at"] : [] });
  }

  return {
    template: template.name,
    database: "mongodb",
    collections,
  };
}

export function generateFromWords(words: string): string {
  // Parse simple format: "tableName: field1, field2, field3"
  const lines = words.split("\n").filter(l => l.trim());
  let sql = "-- Custom Schema\n-- Generated from: " + words.substring(0, 50) + "...\n\n";

  for (const line of lines) {
    const [tableName, fieldsStr] = line.split(":").map(s => s.trim());
    if (!tableName || !fieldsStr) continue;

    const fields = fieldsStr.split(",").map(f => {
      const trimmed = f.trim();
      return `  ${trimmed} TEXT`;
    });

    sql += `CREATE TABLE ${tableName} (\n  id TEXT PRIMARY KEY,\n${fields.join(",\n")},\n  created_at INTEGER\n);\n\n`;
  }

  return sql;
}
