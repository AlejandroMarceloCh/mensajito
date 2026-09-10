import { config } from "./src/config";
import { verifyWebhookSignature } from "./src/crypto";
import { handleWhatsAppBody } from "./src/handle-inbound";

async function kapsoWebhook(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature");

  if (!verifyWebhookSignature(rawBody, signature, config.webhookSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const eventName = req.headers.get("x-webhook-event");
  if (eventName && eventName !== "whatsapp.message.received") {
    return new Response("OK");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const idempotencyKey = req.headers.get("x-idempotency-key");
  handleWhatsAppBody(parsed, idempotencyKey).catch((error) => {
    console.error(
      JSON.stringify({
        msg: "whatsapp_inbound_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  });

  return new Response("OK");
}

Bun.serve({
  port: config.port,
  routes: {
    "/": () => new Response("mensajito ok"),
    "/health": () => Response.json({ ok: true }),
    "/webhooks/whatsapp": { POST: kapsoWebhook },
    "/webhooks/kapso": { POST: kapsoWebhook },
  },
});

console.log(
  JSON.stringify({
    msg: "mensajito_listening",
    port: config.port,
    salesPhoneNumberId: config.salesPhoneNumberId,
    housingPhoneNumberId: config.housingPhoneNumberId,
  }),
);
