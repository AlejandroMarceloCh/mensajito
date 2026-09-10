import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";
import { config } from "./config";

export const whatsapp = new WhatsAppClient({
  baseUrl: "https://api.kapso.ai/meta/whatsapp",
  kapsoApiKey: config.kapsoApiKey,
});

const MAX_WHATSAPP_CHARS = 3900;

export async function sendWhatsAppText(input: {
  phoneNumberId: string;
  to: string;
  body: string;
}): Promise<string | undefined> {
  const chunks = splitMessage(input.body);
  let lastId: string | undefined;

  for (const chunk of chunks) {
    const response = await whatsapp.messages.sendText({
      phoneNumberId: input.phoneNumberId,
      to: input.to,
      body: chunk,
    });
    lastId = response.messages?.[0]?.id;
  }

  return lastId;
}

export function splitMessage(body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed) return ["..."];
  if (trimmed.length <= MAX_WHATSAPP_CHARS) return [trimmed];

  const parts: string[] = [];
  let remaining = trimmed;
  while (remaining.length > MAX_WHATSAPP_CHARS) {
    const slice = remaining.slice(0, MAX_WHATSAPP_CHARS);
    const breakAt = Math.max(
      slice.lastIndexOf("\n\n"),
      slice.lastIndexOf("\n"),
      slice.lastIndexOf(". "),
    );
    const cut = breakAt > 200 ? breakAt + 1 : MAX_WHATSAPP_CHARS;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}
