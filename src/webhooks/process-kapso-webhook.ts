import { getSupabase } from "../lib/supabase";

interface ProcessWebhookInput {
  payload: unknown;
  eventName: string;
  idempotencyKey?: string;
}

interface KapsoMessage {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  kapso?: { phone_number?: string; direction?: string };
}

interface KapsoData {
  phone_number_id?: string;
  message?: KapsoMessage;
  conversation?: { id?: string; phone_number?: string };
}

function extractData(payload: unknown): KapsoData {
  if (!payload || typeof payload !== "object") return {};
  const root = payload as Record<string, unknown>;
  const candidate = root.data && typeof root.data === "object" ? root.data : root;
  return candidate as KapsoData;
}

export async function processKapsoWebhook(input: ProcessWebhookInput): Promise<void> {
  if (input.eventName !== "whatsapp.message.received") return;

  const data = extractData(input.payload);
  const message = data.message;
  const whatsappId =
    message?.kapso?.phone_number ?? data.conversation?.phone_number ?? message?.from;

  if (!message || !whatsappId) return;

  const supabase = getSupabase();

  if (input.idempotencyKey) {
    const { data: existing, error } = await supabase
      .from("processed_events")
      .select("idempotency_key")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (error) throw error;
    if (existing) return;
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .upsert(
      { whatsapp_id: whatsappId, phone_number: whatsappId },
      { onConflict: "whatsapp_id" },
    )
    .select("id")
    .single();
  if (contactError) throw contactError;

  const kapsoConversationId = data.conversation?.id ?? `wa:${whatsappId}`;
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .upsert(
      {
        contact_id: contact.id,
        kapso_conversation_id: kapsoConversationId,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: "kapso_conversation_id" },
    )
    .select("id")
    .single();
  if (conversationError) throw conversationError;

  const { error: messageError } = await supabase.from("messages").upsert(
    {
      conversation_id: conversation.id,
      kapso_message_id: message.id ?? null,
      direction: "inbound",
      message_type: message.type ?? "unknown",
      body: message.text?.body ?? null,
      raw_payload: input.payload,
    },
    { onConflict: "kapso_message_id", ignoreDuplicates: true },
  );
  if (messageError) throw messageError;

  if (input.idempotencyKey) {
    const { error } = await supabase.from("processed_events").upsert({
      idempotency_key: input.idempotencyKey,
      event_name: input.eventName,
    });
    if (error) throw error;
  }
}
