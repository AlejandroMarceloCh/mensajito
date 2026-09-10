import type { AgentKind } from "./config";
import { getSupabase } from "./lib/supabase";
import type { Contact, StoredMessage } from "./types";

export type { Contact, StoredMessage };

const CONTACT_COLS = "id, agent, whatsapp_id, phone_number, name, email, intent_score";

type ContactRow = {
  id: string;
  agent: AgentKind;
  whatsapp_id: string;
  phone_number: string | null;
  name: string | null;
  email: string | null;
  intent_score?: number | null;
};

type ConversationRow = {
  id: string;
  contact_id: string;
};

type ProfileRow = {
  extra: Record<string, unknown> | null;
};

export async function upsertContact(input: {
  agent: AgentKind;
  phone: string;
  username?: string | null;
  kapsoConversationId?: string;
}): Promise<Contact> {
  const supabase = getSupabase();

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .upsert(
      {
        agent: input.agent,
        whatsapp_id: input.phone,
        phone_number: input.phone,
      },
      { onConflict: "agent,whatsapp_id" },
    )
    .select(CONTACT_COLS)
    .single();
  if (contactError) throw contactError;

  const conversation = await ensureConversation(
    contact.id as string,
    input.kapsoConversationId ?? `${input.agent}:${input.phone}`,
  );

  if (input.username) {
    await mergeProfile(contact.id, { username: input.username });
  }

  return hydrate(contact as ContactRow, conversation);
}

export async function getContact(id: string): Promise<Contact> {
  const supabase = getSupabase();
  const { data: contact, error } = await supabase
    .from("contacts")
    .select(CONTACT_COLS)
    .eq("id", id)
    .single();
  if (error) throw error;

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, contact_id")
    .eq("contact_id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) throw new Error(`Conversación activa no encontrada para ${id}`);

  return hydrate(contact as ContactRow, conversation as ConversationRow);
}

export async function updateContactProfile(
  id: string,
  patch: Record<string, unknown>,
): Promise<Contact> {
  const contact = await getContact(id);
  const current = parseProfile(contact.profileJson);
  const next = { ...current, ...stripUndefined(patch) };
  const name = typeof next.name === "string" ? next.name : contact.name;
  const email = typeof next.email === "string" ? next.email : contact.email;
  const intentScore = typeof next.intentScore === "number" ? next.intentScore : undefined;

  const supabase = getSupabase();
  const { error } = await supabase
    .from("contacts")
    .update(stripUndefined({ name, email, intent_score: intentScore }))
    .eq("id", id);
  if (error) throw error;

  await mergeProfile(id, next);

  if (typeof patch.qualified === "boolean") {
    const stage =
      next.visitBooked === true || next.visitRequested === true
        ? "appointment_requested"
        : patch.qualified
          ? "qualified"
          : "discovering";
    await supabase
      .from("conversations")
      .update({ stage })
      .eq("id", contact.conversationId);
  }

  return getContact(id);
}

export async function insertMessage(input: {
  contactId: string;
  conversationId: string;
  role: "human" | "ai" | "advisor";
  content: string;
  kapsoId?: string | null;
}): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("messages").upsert(
    {
      conversation_id: input.conversationId,
      kapso_message_id: input.kapsoId ?? `local:${input.conversationId}:${Date.now()}`,
      direction: input.role === "human" ? "inbound" : "outbound",
      message_type: "text",
      body: input.content,
    },
    { onConflict: "kapso_message_id", ignoreDuplicates: true },
  );
  if (error) throw error;

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", input.conversationId);
}

export async function recentMessages(
  contactId: string,
  limit = 16,
): Promise<StoredMessage[]> {
  const contact = await getContact(contactId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, kapso_message_id, direction, body, created_at")
    .eq("conversation_id", contact.conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? [])
    .reverse()
    .map((row) => ({
      id: row.id as string,
      contactId,
      role: row.direction === "inbound" ? "human" : "ai",
      content: (row.body as string | null) ?? "",
      kapsoId: (row.kapso_message_id as string | null) ?? null,
      createdAt: row.created_at as string,
    }));
}

export async function requestVisit(input: {
  contactId: string;
  conversationId: string;
  projectName?: string;
  preferredAt?: string | null;
  preferredLabel?: string;
  notes?: string;
  status?: "requested" | "confirmed";
}): Promise<{ id: string; status: string; requestedFor: string | null }> {
  const supabase = getSupabase();
  const notes = [input.projectName && `Proyecto: ${input.projectName}`, input.preferredLabel, input.notes]
    .filter(Boolean)
    .join(" · ");
  const status = input.status ?? (input.preferredAt ? "confirmed" : "requested");

  const { data: existing, error: existingError } = await supabase
    .from("appointments")
    .select("id")
    .eq("contact_id", input.contactId)
    .in("status", ["requested", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  const payload = {
    contact_id: input.contactId,
    conversation_id: input.conversationId,
    kind: "visit",
    requested_for: input.preferredAt ?? null,
    status,
    notes: notes || null,
  };

  const { data, error } = existing
    ? await supabase.from("appointments").update(payload).eq("id", existing.id).select("id, status, requested_for").single()
    : await supabase.from("appointments").insert(payload).select("id, status, requested_for").single();
  if (error) throw error;

  await supabase
    .from("conversations")
    .update({ stage: "appointment_requested" })
    .eq("id", input.conversationId);

  await supabase
    .from("contacts")
    .update({ intent_score: 5 })
    .eq("id", input.contactId);

  await mergeProfile(input.contactId, {
    visitRequested: true,
    visitBooked: status === "confirmed",
    visitAt: input.preferredAt ?? undefined,
    visitPreference: input.preferredLabel,
    projectInterest: input.projectName,
    intentScore: 5,
    qualified: true,
    qualificationNote: "Pidió o confirmó visita",
  });

  return {
    id: data.id as string,
    status: data.status as string,
    requestedFor: (data.requested_for as string | null) ?? null,
  };
}

export async function claimIdempotencyKey(key: string, eventName = "whatsapp.message.received"): Promise<boolean> {
  const supabase = getSupabase();
  const { data: existing, error: readError } = await supabase
    .from("processed_events")
    .select("idempotency_key")
    .eq("idempotency_key", key)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return false;

  const { error } = await supabase.from("processed_events").insert({
    idempotency_key: key,
    event_name: eventName,
  });
  if (error) {
    if (error.code === "23505") return false;
    throw error;
  }
  return true;
}

async function ensureConversation(
  contactId: string,
  kapsoConversationId: string,
): Promise<ConversationRow> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data: byKapso, error: byKapsoError } = await supabase
    .from("conversations")
    .select("id, contact_id")
    .eq("kapso_conversation_id", kapsoConversationId)
    .maybeSingle();
  if (byKapsoError) throw byKapsoError;

  if (byKapso) {
    const { error } = await supabase
      .from("conversations")
      .update({ last_message_at: now, is_active: true })
      .eq("id", byKapso.id);
    if (error) throw error;
    return byKapso as ConversationRow;
  }

  const { data: active, error: activeError } = await supabase
    .from("conversations")
    .select("id, contact_id")
    .eq("contact_id", contactId)
    .eq("is_active", true)
    .maybeSingle();
  if (activeError) throw activeError;

  if (active) {
    const { error } = await supabase
      .from("conversations")
      .update({ last_message_at: now })
      .eq("id", active.id);
    if (error) throw error;
    return active as ConversationRow;
  }

  const { data: created, error: createError } = await supabase
    .from("conversations")
    .insert({
      contact_id: contactId,
      kapso_conversation_id: kapsoConversationId,
      last_message_at: now,
      is_active: true,
    })
    .select("id, contact_id")
    .single();
  if (createError) throw createError;
  return created as ConversationRow;
}

async function mergeProfile(contactId: string, extra: Record<string, unknown>) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("lead_profiles")
    .select("extra")
    .eq("contact_id", contactId)
    .maybeSingle();

  const current = (data as ProfileRow | null)?.extra ?? {};
  const merged = { ...current, ...stripUndefined(extra) };
  const { error } = await supabase.from("lead_profiles").upsert(
    {
      contact_id: contactId,
      extra: merged,
      bedrooms: typeof extra.bedrooms === "number" ? extra.bedrooms : undefined,
      budget_max: typeof extra.budgetMax === "number" ? extra.budgetMax : undefined,
      savings: typeof extra.savings === "number" ? extra.savings : undefined,
      preferred_zones:
        typeof extra.district === "string" ? [extra.district] : undefined,
    },
    { onConflict: "contact_id" },
  );
  if (error) throw error;
}

async function hydrate(contact: ContactRow, conversation: ConversationRow): Promise<Contact> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("lead_profiles")
    .select("extra")
    .eq("contact_id", contact.id)
    .maybeSingle();
  const extra = (data as ProfileRow | null)?.extra ?? {};
  const username = typeof extra.username === "string" ? extra.username : null;
  if (typeof extra.intentScore !== "number" && typeof contact.intent_score === "number") {
    extra.intentScore = contact.intent_score;
  }

  return {
    id: contact.id,
    conversationId: conversation.id,
    agent: contact.agent,
    phone: contact.phone_number ?? contact.whatsapp_id,
    username,
    name: contact.name,
    email: contact.email,
    profileJson: JSON.stringify(extra),
  };
}

export function parseProfile(json: string): Record<string, unknown> {
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function stripUndefined(patch: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
}
