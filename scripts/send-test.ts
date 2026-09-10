import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";

const kapsoApiKey = process.env.KAPSO_API_KEY;
const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
const testWhatsAppNumber = process.env.TEST_WHATSAPP_NUMBER;

if (!kapsoApiKey || !phoneNumberId || !testWhatsAppNumber) {
  throw new Error(
    "Faltan KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID o TEST_WHATSAPP_NUMBER en .env",
  );
}

const client = new WhatsAppClient({
  baseUrl: "https://api.kapso.ai/meta/whatsapp",
  kapsoApiKey,
});

const response = await client.messages.sendText({
  phoneNumberId,
  to: testWhatsAppNumber,
  body: "Hola desde nuestro agente recepcionista 👋",
});

console.log("Mensaje enviado correctamente:", response);
