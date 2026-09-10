import { findProjectInText } from "./catalog";
import {
  claimIdempotencyKey,
  getContact,
  insertMessage,
  parseProfile,
  upsertContact,
  updateContactProfile,
} from "./db";
import { extractInboundEvents, type InboundMessage } from "./inbound";
import { runAgent } from "./agent";
import { nextLeadScore } from "./score";
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
  console.log(
    JSON.stringify({
      msg: "webhook_received",
      eventCount: events.length,
      agent: events[0]?.agent,
    }),
  );
  if (events.length === 0) {
    console.log(JSON.stringify({ msg: "webhook_no_inbound_events" }));
    return;
  }
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

  let named =
    event.contactName && !contact.name
      ? await updateContactProfile(contact.id, { name: event.contactName })
      : contact;

  if (event.agent === "sales") {
    const mentioned = findProjectInText(event.text);
    if (mentioned) {
      named = await updateContactProfile(named.id, {
        projectInterest: mentioned.name,
        district: mentioned.district,
        city: mentioned.city,
      });
    }
  }

  await insertMessage({
    contactId: named.id,
    conversationId: named.conversationId,
    role: "human",
    content: event.text,
    kapsoId: event.messageId,
  });

  let reply: string;
  try {
    reply = await runAgent({
      agent: event.agent,
      contact: named,
      userText: event.text,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        msg: "agent_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    reply =
      "Perdón, tuve un problema técnico. ¿Me escribes de nuevo en un minuto?";
  }

  if (event.agent === "sales") {
    await persistLeadScore(named.id, event.text);
  }

  try {
    const kapsoId = await sendWhatsAppText({
      phoneNumberId: phoneNumberIdForAgent(event.agent),
      to: event.userPhone.replace(/\D/g, ""),
      body: reply,
    });

    await insertMessage({
      contactId: named.id,
      conversationId: named.conversationId,
      role: "ai",
      content: reply,
      kapsoId,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        msg: "whatsapp_send_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

async function persistLeadScore(contactId: string, userText: string): Promise<void> {
  const contact = await getContact(contactId);
  const profile = parseProfile(contact.profileJson);
  const scored = nextLeadScore({ profile, userText });
  if (profile.intentScore === scored.score && profile.qualified === scored.qualified) {
    return;
  }
  await updateContactProfile(contactId, {
    intentScore: scored.score,
    qualified: scored.qualified,
    qualificationNote: scored.reason,
  });
  console.log(
    JSON.stringify({
      msg: "lead_scored",
      score: scored.score,
      qualified: scored.qualified,
    }),
  );
}
