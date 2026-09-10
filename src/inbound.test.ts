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
import {
  evaluateAffordability,
  findProjectInText,
  formatProject,
  inferProgram,
  projectStock,
  recommendProjects,
  searchProjects,
} from "../src/catalog";
import { parseVisitSlot } from "../src/visit";
import { nextLeadScore, scoreLeadIntent } from "../src/score";
import { requestVisit, upsertContact } from "../src/db-sqlite";
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

  test("inventario: disponibles vs vendidos por tipología", () => {
    const surco = searchProjects({ district: "Surco" })[0];
    expect(surco?.units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bedrooms: 2, total: 45, sold: 28 }),
        expect.objectContaining({ bedrooms: 3, total: 30, sold: 19 }),
      ]),
    );
    expect(projectStock(surco!)).toEqual({ total: 75, sold: 47, available: 28 });
    expect(formatProject(surco!)).toContain("17 disponibles de 45");
  });

  test("si nombran un proyecto, ancla a ese y no a otro distrito", () => {
    expect(findProjectInText("Hola, me interesa Sol de Carabayllo")?.id).toBe("carabayllo-sol");
    expect(findProjectInText("quiero info de Parques de Surco")?.id).toBe("surco-parques");
    expect(findProjectInText("hola, busco un depa")).toBeUndefined();
    const named = recommendProjects({ name: "Sol de Carabayllo" });
    expect(named.matches[0]?.id).toBe("carabayllo-sol");
    expect(named.alternatives).toEqual([]);
  });

  test("si no hay proyecto en el distrito, ofrece alternativas similares", () => {
    const result = recommendProjects({ district: "Miraflores", bedrooms: 2 });
    expect(result.matches).toEqual([]);
    expect(result.requestedDistrict).toBe("Miraflores");
    expect(result.alternatives.some((p) => p.id === "surco-parques" || p.id === "san-miguel-mar")).toBe(
      true,
    );
  });

  test("capacidad: inicial alcanza o sugiere alternativa", () => {
    const fits = evaluateAffordability({
      savings: 20_000,
      downPayment: 20_000,
      projectName: "Sol de Carabayllo",
    });
    expect(fits).toContain("RESULTADO=CALZA");
    const short = evaluateAffordability({
      savings: 15_000,
      projectName: "Parques de Surco",
    });
    expect(short).toContain("RESULTADO=NO_CALZA");
    expect(short).toContain("ALTERNATIVAS QUE SÍ SE ADAPTAN");
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
    expect(salesNames).toContain("registrar_visita");
    expect(salesNames).toContain("evaluar_capacidad");
    expect(salesNames).not.toContain("consultar_programas");
    expect(housingNames).toContain("consultar_programas");
    expect(housingNames).toContain("calcular_capacidad_pago");
    expect(housingNames).not.toContain("marcar_calificacion");
  });
});

describe("score de intención", () => {
  test("sube de 1 a 5 según señales de compra", () => {
    expect(scoreLeadIntent({ profile: {}, userText: "hola" }).score).toBe(1);
    expect(scoreLeadIntent({ profile: { district: "Surco" }, userText: "ok" }).score).toBe(2);
    expect(
      scoreLeadIntent({
        profile: { projectInterest: "Sol de Carabayllo", bedrooms: 2 },
        userText: "de 2 dormitorios",
      }).score,
    ).toBe(3);
    expect(scoreLeadIntent({ profile: { savings: 20000 }, userText: "tengo 20 mil" }).score).toBe(4);
    expect(scoreLeadIntent({ profile: { capacityFits: true }, userText: "sí me acomoda" }).score).toBe(4);
    expect(scoreLeadIntent({ profile: {}, userText: "quiero agendar una visita" }).score).toBe(5);
  });

  test("no baja el score salvo rechazo", () => {
    expect(nextLeadScore({ profile: { intentScore: 4 }, userText: "ok gracias" }).score).toBe(4);
    expect(nextLeadScore({ profile: { intentScore: 4 }, userText: "ya no me interesa" }).score).toBe(1);
  });
});

describe("visitas", () => {
  test("parsea sábado 11am en horario de Lima", () => {
    const slot = parseVisitSlot("me acomoda el sábado a las 11", new Date("2026-09-10T20:00:00.000Z"));
    expect(slot?.label).toBe("sábado 11am");
    expect(slot?.iso).toBe("2026-09-12T16:00:00.000Z");
  });

  test("registra appointment cuando el lead pide visita", async () => {
    const contact = await upsertContact({
      agent: "sales",
      phone: "51900000042",
      username: "test-visita",
    });
    const row = await requestVisit({
      contactId: contact.id,
      conversationId: contact.conversationId,
      projectName: "Sol de Carabayllo",
      preferredAt: "2026-09-12T16:00:00.000Z",
      preferredLabel: "sábado 11am",
      status: "confirmed",
    });
    expect(row.status).toBe("confirmed");
    expect(row.requestedFor).toBe("2026-09-12T16:00:00.000Z");
    expect(row.id).toBeTruthy();
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
