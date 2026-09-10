import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { config, agentForPhoneNumberId } from "../src/config";
import { verifyWebhookSignature } from "../src/crypto";
import { extractInboundEvents } from "../src/inbound";
import { estimatePaymentCapacity } from "../src/finance";
import { inferProgram, searchProjects } from "../src/catalog";
import { searchKnowledge } from "../src/knowledge";
import { splitMessage } from "../src/whatsapp";

describe("webhook signature", () => {
  test("acepta el HMAC del cuerpo crudo", () => {
    const body = '{"message":{"text":{"body":"hola"}}}';
    const secret = "test-secret";
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyWebhookSignature(body, "00", secret)).toBe(false);
  });
});

describe("enrutado", () => {
  test("separa ventas y vivienda por phone_number_id", () => {
    expect(agentForPhoneNumberId(config.salesPhoneNumberId)).toBe("sales");
    expect(agentForPhoneNumberId(config.housingPhoneNumberId)).toBe("housing");
    expect(agentForPhoneNumberId("otro")).toBeNull();
  });
});

describe("inbound Kapso v2", () => {
  test("extrae texto y lote", () => {
    const events = extractInboundEvents({
      batch: true,
      data: [
        {
          phone_number_id: config.salesPhoneNumberId,
          message: {
            id: "wamid.1",
            from: "51999999999",
            type: "text",
            text: { body: "Quiero un depa en Surco" },
            kapso: { direction: "inbound" },
          },
          conversation: { contact_name: "Ana", phone_number: "51999999999" },
        },
      ],
    });

    expect(events).toEqual([
      {
        agent: "sales",
        phoneNumberId: config.salesPhoneNumberId,
        userPhone: "51999999999",
        username: undefined,
        contactName: "Ana",
        messageId: "wamid.1",
        conversationId: undefined,
        text: "Quiero un depa en Surco",
      },
    ]);
  });

  test("ignora mensajes outbound", () => {
    const events = extractInboundEvents({
      phone_number_id: config.salesPhoneNumberId,
      message: {
        from: "51999999999",
        type: "text",
        text: { body: "eco" },
        kapso: { direction: "outbound" },
      },
    });
    expect(events).toEqual([]);
  });
});

describe("capacidad de pago y catálogo", () => {
  test("cuota al 30% e inmueble referencial", () => {
    const estimate = estimatePaymentCapacity({
      monthlyIncome: 4000,
      monthlyDebts: 200,
      downPayment: 20000,
    });
    expect(estimate.maxInstallment).toBe(1140);
    expect(estimate.estimatedLoan).toBeGreaterThan(100_000);
    expect(estimate.estimatedPrice).toBe(estimate.estimatedLoan + 20000);
  });

  test("filtra proyectos Mivivienda en Surco", () => {
    const matches = searchProjects({
      district: "Surco",
      program: "mivivienda",
      bedrooms: 2,
    });
    expect(matches[0]?.id).toBe("surco-parques");
  });

  test("infiere Techo Propio con ingreso bajo", () => {
    expect(inferProgram({ monthlyIncome: 2500, maxPrice: 120000 })).toBe("techo_propio");
  });
});

describe("conocimiento", () => {
  test("encuentra Techo Propio", () => {
    const chunks = searchKnowledge("bono familiar habitacional techo propio");
    expect(chunks.some((chunk) => chunk.id === "techo-propio")).toBe(true);
  });
});

describe("whatsapp split", () => {
  test("no parte mensajes cortos", () => {
    expect(splitMessage("Hola")).toEqual(["Hola"]);
  });
});
