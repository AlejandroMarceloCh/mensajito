import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  config,
  agentForPhoneNumberId,
  phoneNumberIdForAgent,
  missingEnvVars,
} from "../src/config";
import { verifyWebhookSignature } from "../src/crypto";
import { extractInboundEvents } from "../src/inbound";
import { estimatePaymentCapacity } from "../src/finance";
import { formatProject, inferProgram, searchProjects } from "../src/catalog";
import { searchKnowledge } from "../src/knowledge";
import { createHousingTools, createSalesTools } from "../src/tools";
import { splitMessage } from "../src/whatsapp";
import type { Contact } from "../src/db";

describe("webhook signature", () => {
  test("acepta el HMAC del cuerpo crudo", () => {
    const body = '{"message":{"text":{"body":"hola"}}}';
    const secret = "test-secret";
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyWebhookSignature(body, "00", secret)).toBe(false);
  });

  test("rechaza firma ausente o de distinta longitud", () => {
    expect(verifyWebhookSignature("{}", null, "secret")).toBe(false);
    expect(verifyWebhookSignature("{}", "abc", "secret")).toBe(false);
  });
});

describe("enrutado", () => {
  test("separa ventas y vivienda por phone_number_id", () => {
    expect(agentForPhoneNumberId(config.salesPhoneNumberId)).toBe("sales");
    expect(agentForPhoneNumberId(config.housingPhoneNumberId)).toBe("housing");
    expect(agentForPhoneNumberId("otro")).toBeNull();
  });

  test("resuelve phone_number_id por agente", () => {
    expect(phoneNumberIdForAgent("sales")).toBe(config.salesPhoneNumberId);
    expect(phoneNumberIdForAgent("housing")).toBe(config.housingPhoneNumberId);
  });

  test("lista env requeridos faltantes", () => {
    expect(missingEnvVars(["KAPSO_API_KEY", "NEVER_SET_XYZ"])).toContain(
      "NEVER_SET_XYZ",
    );
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

  test("enruta housing por HOUSING_PHONE_NUMBER_ID", () => {
    const events = extractInboundEvents({
      phone_number_id: config.housingPhoneNumberId,
      message: {
        id: "wamid.h1",
        from: "51988888888",
        type: "text",
        text: { body: "¿Qué es Techo Propio?" },
        kapso: { direction: "inbound" },
      },
      conversation: { id: "conv-h1", contact_name: "Luis" },
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.agent).toBe("housing");
    expect(events[0]?.conversationId).toBe("conv-h1");
    expect(events[0]?.text).toBe("¿Qué es Techo Propio?");
  });

  test("extrae respuesta interactiva", () => {
    const events = extractInboundEvents({
      phone_number_id: config.salesPhoneNumberId,
      message: {
        from: "51999999999",
        type: "interactive",
        interactive: {
          type: "button_reply",
          button_reply: { id: "visit", title: "Agendar visita" },
        },
        kapso: { direction: "inbound" },
      },
    });
    expect(events[0]?.text).toBe("Agendar visita (visit)");
  });

  test("ignora mensajes outbound y phone_number_id desconocido", () => {
    expect(
      extractInboundEvents({
        phone_number_id: config.salesPhoneNumberId,
        message: {
          from: "51999999999",
          type: "text",
          text: { body: "eco" },
          kapso: { direction: "outbound" },
        },
      }),
    ).toEqual([]);

    expect(
      extractInboundEvents({
        phone_number_id: "unknown-phone",
        message: {
          from: "51999999999",
          type: "text",
          text: { body: "hola" },
          kapso: { direction: "inbound" },
        },
      }),
    ).toEqual([]);
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

  test("cuota cero si deudas comen el ingreso", () => {
    const estimate = estimatePaymentCapacity({
      monthlyIncome: 1000,
      monthlyDebts: 1200,
    });
    expect(estimate.maxInstallment).toBe(0);
    expect(estimate.estimatedLoan).toBe(0);
  });

  test("filtra proyectos Mivivienda en Surco", () => {
    const matches = searchProjects({
      district: "Surco",
      program: "mivivienda",
      bedrooms: 2,
    });
    expect(matches[0]?.id).toBe("surco-parques");
    expect(formatProject(matches[0]!)).toContain("Parques de Surco");
  });

  test("filtra Techo Propio por cuota", () => {
    const matches = searchProjects({
      program: "techo_propio",
      maxMonthly: 650,
    });
    expect(matches.every((p) => p.monthlyFrom <= 650)).toBe(true);
    expect(matches.some((p) => p.id === "carabayllo-sol")).toBe(true);
  });

  test("infiere Techo Propio con ingreso bajo", () => {
    expect(inferProgram({ monthlyIncome: 2500, maxPrice: 120000 })).toBe("techo_propio");
    expect(inferProgram({ monthlyIncome: 5000 })).toBe("mivivienda");
  });
});

describe("conocimiento", () => {
  test("encuentra Techo Propio", () => {
    const chunks = searchKnowledge("bono familiar habitacional techo propio");
    expect(chunks.some((chunk) => chunk.id === "techo-propio")).toBe(true);
  });
});

describe("tools por agente", () => {
  const fakeContact: Contact = {
    id: "c1",
    conversationId: "v1",
    agent: "sales",
    phone: "51999999999",
    username: null,
    name: null,
    email: null,
    profileJson: "{}",
  };

  test("Tami expone calificación; Milo expone programas y capacidad", () => {
    const salesNames = createSalesTools({ contact: fakeContact }).map((t) => t.name);
    const housingNames = createHousingTools({
      contact: { ...fakeContact, agent: "housing" },
    }).map((t) => t.name);

    expect(salesNames).toContain("marcar_calificacion");
    expect(salesNames).not.toContain("consultar_programas");
    expect(housingNames).toContain("consultar_programas");
    expect(housingNames).toContain("calcular_capacidad_pago");
    expect(housingNames).not.toContain("marcar_calificacion");
  });
});

describe("whatsapp split", () => {
  test("no parte mensajes cortos", () => {
    expect(splitMessage("Hola")).toEqual(["Hola"]);
  });

  test("parte mensajes muy largos", () => {
    const long = "x".repeat(5000);
    const parts = splitMessage(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("").length).toBe(5000);
  });
});
