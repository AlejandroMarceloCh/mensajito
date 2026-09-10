import type { AgentKind } from "./config";
import { agentForPhoneNumberId } from "./config";

export type InboundMessage = {
  agent: AgentKind;
  phoneNumberId: string;
  userPhone: string;
  username?: string;
  contactName?: string;
  messageId?: string;
  conversationId?: string;
  text: string;
};

type KapsoMessage = {
  id?: string;
  from?: string;
  username?: string;
  type?: string;
  text?: { body?: string };
  interactive?: {
    type?: string;
    button_reply?: { title?: string; id?: string };
    list_reply?: { title?: string; id?: string };
  };
  kapso?: {
    direction?: string;
    content?: string;
    phone_number?: string;
    phone_number_id?: string;
  };
};

type KapsoConversation = {
  id?: string;
  contact_name?: string;
  phone_number?: string;
  phone_number_id?: string;
  username?: string;
};

type KapsoEvent = {
  batch?: boolean;
  data?: KapsoEvent[];
  message?: KapsoMessage;
  conversation?: KapsoConversation;
  phone_number_id?: string;
};

export function extractInboundEvents(body: unknown): InboundMessage[] {
  if (!body || typeof body !== "object") return [];
  const event = body as KapsoEvent & { data?: KapsoEvent | KapsoEvent[] };
  const nested = event.data;
  const items = event.batch && Array.isArray(nested)
    ? nested
    : nested && !Array.isArray(nested) && !event.message
      ? [nested]
      : [event];

  return items.flatMap((item) => {
    const parsed = parseOne(item);
    return parsed ? [parsed] : [];
  });
}

function parseOne(item: KapsoEvent): InboundMessage | null {
  const message = item.message;
  if (!message) return null;
  if (message.kapso?.direction && message.kapso.direction !== "inbound") {
    return null;
  }

  const phoneNumberId =
    item.phone_number_id ||
    item.conversation?.phone_number_id ||
    message.kapso?.phone_number_id;
  if (!phoneNumberId) {
    console.log(JSON.stringify({ msg: "inbound_skipped", reason: "no_phone_number_id" }));
    return null;
  }

  const agent = agentForPhoneNumberId(phoneNumberId);
  if (!agent) {
    console.log(
      JSON.stringify({
        msg: "inbound_skipped",
        reason: "unknown_phone_number_id",
        phoneNumberId,
      }),
    );
    return null;
  }

  const userPhone =
    message.from ||
    item.conversation?.phone_number ||
    message.kapso?.phone_number;
  if (!userPhone) {
    console.log(JSON.stringify({ msg: "inbound_skipped", reason: "no_user_phone" }));
    return null;
  }

  const text = extractText(message);
  if (!text) {
    console.log(
      JSON.stringify({
        msg: "inbound_skipped",
        reason: "no_text",
        type: message.type,
      }),
    );
    return null;
  }

  return {
    agent,
    phoneNumberId,
    userPhone,
    username: message.username || item.conversation?.username,
    contactName: item.conversation?.contact_name,
    messageId: message.id,
    conversationId: item.conversation?.id,
    text,
  };
}

function extractText(message: KapsoMessage): string | null {
  if (message.type === "text" || message.text?.body) {
    return message.text?.body?.trim() || message.kapso?.content?.trim() || null;
  }

  if (message.type === "interactive") {
    const button = message.interactive?.button_reply;
    const list = message.interactive?.list_reply;
    const title = button?.title || list?.title;
    const id = button?.id || list?.id;
    if (title && id) return `${title} (${id})`;
    return title || id || null;
  }

  const content = message.kapso?.content?.trim();
  return content || null;
}
