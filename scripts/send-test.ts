import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";
import { config, type AgentKind } from "../src/config";
import { phoneNumberIdForAgent } from "../src/config";

const agent = (
  process.env.TEST_AGENT === "housing" ? "housing" : "sales"
) as AgentKind;
if (agent === "housing" && !process.env.HOUSING_PHONE_NUMBER_ID?.trim()) {
  throw new Error(
    "TEST_AGENT=housing requiere HOUSING_PHONE_NUMBER_ID (ahora la prioridad es el agente de ventas)",
  );
}
const to = process.env.TEST_WHATSAPP_NUMBER;
if (!to) {
  throw new Error("Define TEST_WHATSAPP_NUMBER en .env");
}

const client = new WhatsAppClient({
  baseUrl: "https://api.kapso.ai/meta/whatsapp",
  kapsoApiKey: config.kapsoApiKey,
});

const body =
  agent === "sales"
    ? "Hola, soy Tami de sala de ventas. Escríbeme cuando quieras ver un depa 👋"
    : "Hola, soy Milo. Te oriento con Mivivienda y Techo Propio. Escríbeme tu consulta 👋";

const response = await client.messages.sendText({
  phoneNumberId: phoneNumberIdForAgent(agent),
  to,
  body,
});

console.log("Mensaje de prueba enviado:", agent, response);
