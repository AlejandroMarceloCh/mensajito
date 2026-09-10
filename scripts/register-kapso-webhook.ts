const phoneNumberId = process.env.SALES_PHONE_NUMBER_ID!;
const secret = process.env.KAPSO_WEBHOOK_SECRET!;
const apiKey = process.env.KAPSO_API_KEY!;
const url = process.env.WEBHOOK_PUBLIC_URL!;

const response = await fetch(
  `https://api.kapso.ai/platform/v1/whatsapp/phone_numbers/${phoneNumberId}/webhooks`,
  {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      whatsapp_webhook: {
        url,
        secret_key: secret,
        events: ["whatsapp.message.received"],
        payload_version: "v2",
        active: true,
      },
    }),
  },
);

const text = await response.text();
console.log(JSON.stringify({ status: response.status, body: text.slice(0, 500) }));
