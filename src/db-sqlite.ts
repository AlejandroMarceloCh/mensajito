import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AgentKind } from "./config";
import type { Contact, StoredMessage } from "./types";
export type { Contact, StoredMessage };

const path = process.env.DATABASE_PATH?.trim() || "data/mensajito.sqlite";
mkdirSync(dirname(path), { recursive: true });

const sqlite = new Database(path, { create: true });
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    agent TEXT NOT NULL,
    phone TEXT NOT NULL,
    username TEXT,
    name TEXT,
    email TEXT,
    profile_json TEXT NOT NULL DEFAULT '{}',
    UNIQUE(agent, phone)
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    kapso_conversation_id TEXT UNIQUE
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    kapso_id TEXT UNIQUE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS processed_webhooks (
    idempotency_key TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  );
`);

function uuid() {
  return crypto.randomUUID();
}

export async function upsertContact(input: {
  agent: AgentKind;
  phone: string;
  username?: string | null;
  kapsoConversationId?: string;
}): Promise<Contact> {
  const existing = sqlite
    .query<
      {
        id: string;
        agent: AgentKind;
        phone: string;
        username: string | null;
        name: string | null;
        email: string | null;
        profile_json: string;
      },
      [string, string]
    >(`SELECT * FROM contacts WHERE agent = ? AND phone = ?`)
    .get(input.agent, input.phone);

  let contact = existing;
  if (!contact) {
    const id = uuid();
    sqlite
      .query(
        `INSERT INTO contacts (id, agent, phone, username) VALUES (?, ?, ?, ?)`,
      )
      .run(id, input.agent, input.phone, input.username ?? null);
    contact = sqlite
      .query<typeof existing, [string]>(`SELECT * FROM contacts WHERE id = ?`)
      .get(id)!;
  } else if (input.username && contact.username !== input.username) {
    sqlite.query(`UPDATE contacts SET username = ? WHERE id = ?`).run(
      input.username,
      contact.id,
    );
    contact.username = input.username;
  }

  const kapsoId = input.kapsoConversationId ?? `${input.agent}:${input.phone}`;
  let conversation = sqlite
    .query<{ id: string }, [string]>(
      `SELECT id FROM conversations WHERE kapso_conversation_id = ?`,
    )
    .get(kapsoId);
  if (!conversation) {
    conversation = sqlite
      .query<{ id: string }, [string]>(
        `SELECT id FROM conversations WHERE contact_id = ?`,
      )
      .get(contact.id);
  }
  if (!conversation) {
    const id = uuid();
    sqlite
      .query(
        `INSERT INTO conversations (id, contact_id, kapso_conversation_id) VALUES (?, ?, ?)`,
      )
      .run(id, contact.id, kapsoId);
    conversation = { id };
  }

  return {
    id: contact.id,
    conversationId: conversation.id,
    agent: contact.agent,
    phone: contact.phone,
    username: contact.username,
    name: contact.name,
    email: contact.email,
    profileJson: contact.profile_json,
  };
}

export async function getContact(id: string): Promise<Contact> {
  const contact = sqlite
    .query<
      {
        id: string;
        agent: AgentKind;
        phone: string;
        username: string | null;
        name: string | null;
        email: string | null;
        profile_json: string;
      },
      [string]
    >(`SELECT * FROM contacts WHERE id = ?`)
    .get(id);
  if (!contact) throw new Error(`Contacto ${id} no encontrado`);
  const conversation = sqlite
    .query<{ id: string }, [string]>(
      `SELECT id FROM conversations WHERE contact_id = ?`,
    )
    .get(id);
  if (!conversation) throw new Error(`Conversación no encontrada para ${id}`);
  return {
    id: contact.id,
    conversationId: conversation.id,
    agent: contact.agent,
    phone: contact.phone,
    username: contact.username,
    name: contact.name,
    email: contact.email,
    profileJson: contact.profile_json,
  };
}

export async function updateContactProfile(
  id: string,
  patch: Record<string, unknown>,
): Promise<Contact> {
  const contact = await getContact(id);
  const current = JSON.parse(contact.profileJson || "{}") as Record<string, unknown>;
  const next = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
  const name = typeof next.name === "string" ? next.name : contact.name;
  const email = typeof next.email === "string" ? next.email : contact.email;
  sqlite
    .query(`UPDATE contacts SET profile_json = ?, name = ?, email = ? WHERE id = ?`)
    .run(JSON.stringify(next), name, email, id);
  return getContact(id);
}

export async function insertMessage(input: {
  contactId: string;
  conversationId: string;
  role: "human" | "ai" | "advisor";
  content: string;
  kapsoId?: string | null;
}): Promise<void> {
  try {
    sqlite
      .query(
        `INSERT INTO messages (id, contact_id, conversation_id, role, content, kapso_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        uuid(),
        input.contactId,
        input.conversationId,
        input.role,
        input.content,
        input.kapsoId ?? null,
        new Date().toISOString(),
      );
  } catch (error) {
    if (String(error).includes("UNIQUE")) return;
    throw error;
  }
}

export async function recentMessages(
  contactId: string,
  limit = 16,
): Promise<StoredMessage[]> {
  const rows = sqlite
    .query<
      {
        id: string;
        contact_id: string;
        role: "human" | "ai" | "advisor";
        content: string;
        kapso_id: string | null;
        created_at: string;
      },
      [string, number]
    >(
      `SELECT id, contact_id, role, content, kapso_id, created_at FROM messages
       WHERE contact_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(contactId, limit);
  return rows.reverse().map((row) => ({
    id: row.id,
    contactId: row.contact_id,
    role: row.role,
    content: row.content,
    kapsoId: row.kapso_id,
    createdAt: row.created_at,
  }));
}

export async function claimIdempotencyKey(key: string): Promise<boolean> {
  try {
    sqlite
      .query(`INSERT INTO processed_webhooks (idempotency_key, created_at) VALUES (?, ?)`)
      .run(key, new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}
