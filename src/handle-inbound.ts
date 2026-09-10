import { claimIdempotencyKey, insertMessage, upsertContact, updateContactProfile } from "./db";
import { extractInboundEvents, type InboundMessage } from "./inbound";
import { runAgent } from "./agent";
import { sendWhatsAppText } from "./whatsapp";
import { phoneNumberIdForAgent } from "./config";

export async function handleWhatsAppBody(
  body: unknown,
  idempotencyKey?: string | null,
): Promise<void> {
  if (idempotencyKey && !(await claimIdempotencyKey(idempotencyKey))) {
    return;
  }

  const events = extractInboundEvents(body);
  for (const event of events) {
    await handleInbound(event);
  }
}

async function handleInbound(event: InboundMessage): Promise<void> {
  const contact = await upsertContact({
    agent: event.agent,
    phone: event.userPhone,
    username: event.username,
    kapsoConversationId: event.conversationId,
  });

  const named =
    event.contactName && !contact.name
      ? await updateContactProfile(contact.id, { name: event.contactName })
      : contact;

  await insertMessage({
    contactId: named.id,
    conversationId: named.conversationId,
    role: "human",
    content: event.text,
    kapsoId: event.messageId,
  });

  const reply = await runAgent({
    agent: event.agent,
    contact: named,
    userText: event.text,
  });

  const kapsoId = await sendWhatsAppText({
    phoneNumberId: phoneNumberIdForAgent(event.agent),
    to: event.userPhone,
    body: reply,
  });

  await insertMessage({
    contactId: named.id,
    conversationId: named.conversationId,
    role: "ai",
    content: reply,
    kapsoId,
  });
}
