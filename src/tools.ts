import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { formatProject, inferProgram, searchProjects } from "./catalog";
import { updateContactProfile, type Contact } from "./db";
import { estimatePaymentCapacity } from "./finance";
import { searchKnowledge } from "./knowledge";
import { config } from "./config";

export type ToolContext = {
  contact: Contact;
};

  const profilePatch = z.object({
  name: z.string().min(2).nullish(),
  email: z.string().email().nullish(),
  district: z.string().nullish(),
  city: z.string().nullish(),
  bedrooms: z.number().int().min(1).max(5).nullish(),
  budgetMin: z.number().nullish(),
  budgetMax: z.number().nullish(),
  monthlyIncome: z.number().nullish(),
  monthlyDebts: z.number().nullish(),
  downPayment: z.number().nullish(),
  purchaseStage: z.string().nullish(),
  projectInterest: z.string().nullish(),
  hasProperty: z.boolean().nullish(),
  programInterest: z.enum(["mivivienda", "techo_propio", "ambos"]).nullish(),
  visitPreference: z.string().nullish(),
  objections: z.string().nullish(),
  employmentType: z.string().nullish(),
});

export function createSharedTools(ctx: ToolContext) {
  const saveProfile = new DynamicStructuredTool({
    name: "guardar_perfil",
    description:
      "Guarda o actualiza datos del lead: nombre, correo, distrito, presupuesto, ingresos, deudas, inicial, etapa de compra, objeciones.",
    schema: profilePatch,
    func: async (input) => {
      const contact = await updateContactProfile(ctx.contact.id, input);
      ctx.contact = contact;
      return `Perfil actualizado: ${contact.profileJson}`;
    },
  });

  const findProjects = new DynamicStructuredTool({
    name: "buscar_proyectos",
    description:
      "Busca proyectos del catálogo por distrito, ciudad, dormitorios, precio máximo, cuota máxima o programa (mivivienda | techo_propio).",
    schema: z.object({
      district: z.string().nullish(),
      city: z.string().nullish(),
      bedrooms: z.number().int().nullish(),
      maxPrice: z.number().nullish(),
      maxMonthly: z.number().nullish(),
      program: z.enum(["mivivienda", "techo_propio"]).nullish(),
    }),
    func: async (input) => {
      const matches = searchProjects(input);
      if (matches.length === 0) {
        return "No hay proyectos del catálogo con esos filtros. Relaja distrito o presupuesto y vuelve a buscar.";
      }
      return matches.map(formatProject).join("\n\n");
    },
  });

  return { saveProfile, findProjects };
}

export function createSalesTools(ctx: ToolContext) {
  const { saveProfile, findProjects } = createSharedTools(ctx);

  const qualify = new DynamicStructuredTool({
    name: "marcar_calificacion",
    description:
      "Actualiza si el lead está calificado y un puntaje de intención de 1 a 5, con una nota corta.",
    schema: z.object({
      qualified: z.boolean(),
      intentScore: z.number().int().min(1).max(5),
      note: z.string(),
    }),
    func: async (input) => {
      await updateContactProfile(ctx.contact.id, {
        qualified: input.qualified,
        intentScore: input.intentScore,
        qualificationNote: input.note,
      });
      return `Lead ${input.qualified ? "calificado" : "aún no calificado"} · intención ${input.intentScore}/5 · ${input.note}`;
    },
  });

  const tools = [saveProfile, findProjects, qualify];

  if (config.calApiKey && config.calEventTypeId) {
    tools.push(
      new DynamicStructuredTool({
        name: "buscar_horarios_visita",
        description: "Lista horarios disponibles para visita a sala de ventas en los próximos 3 días (America/Lima).",
        schema: z.object({}),
        func: async () => {
          const query = new URLSearchParams({
            eventTypeId: config.calEventTypeId!,
            start: new Date().toISOString().slice(0, 10),
            end: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            timeZone: "America/Lima",
          });
          const response = await fetch(`https://api.cal.com/v2/slots?${query}`, {
            headers: {
              Authorization: `Bearer ${config.calApiKey}`,
              "cal-api-version": "2024-09-04",
            },
          });
          const json = await response.json();
          return JSON.stringify(json);
        },
      }),
      new DynamicStructuredTool({
        name: "agendar_visita",
        description:
          "Crea la reserva de visita. Pide confirmación explícita, nombre, correo y horario ISO antes de llamar esta herramienta.",
        schema: z.object({
          startDate: z.string(),
          name: z.string(),
          email: z.string().email(),
          notes: z.string(),
        }),
        func: async (input) => {
          const response = await fetch("https://api.cal.com/v2/bookings", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.calApiKey}`,
              "cal-api-version": "2026-02-25",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              eventTypeId: Number(config.calEventTypeId),
              start: input.startDate,
              attendee: {
                name: input.name,
                email: input.email,
                phoneNumber: ctx.contact.phone,
                timeZone: "America/Lima",
              },
              bookingFieldsResponses: {
                title: "Visita sala de ventas",
                notes: input.notes,
              },
            }),
          });
          const json = await response.json();
          if (!response.ok) return `No se pudo agendar: ${JSON.stringify(json)}`;
          await updateContactProfile(ctx.contact.id, {
            visitBooked: true,
            visitAt: input.startDate,
            qualified: true,
          });
          return "Visita agendada correctamente.";
        },
      }),
    );
  }

  return tools;
}

export function createHousingTools(ctx: ToolContext) {
  const { saveProfile, findProjects } = createSharedTools(ctx);

  const consult = new DynamicStructuredTool({
    name: "consultar_programas",
    description:
      "Consulta la base de conocimiento de Fondo Mivivienda, Techo Propio, BFH, BBP y capacidad de pago. Usa esto antes de explicar reglas o montos.",
    schema: z.object({
      pregunta: z.string(),
    }),
    func: async ({ pregunta }) => {
      const chunks = searchKnowledge(pregunta);
      return chunks.map((chunk) => `## ${chunk.title}\n${chunk.content}`).join("\n\n");
    },
  });

  const capacity = new DynamicStructuredTool({
    name: "calcular_capacidad_pago",
    description:
      "Calcula cuota máxima referencial (30% del ingreso neto), crédito e inmueble aproximado. Guarda ingresos y deudas en el perfil.",
    schema: z.object({
      monthlyIncome: z.number().positive(),
      monthlyDebts: z.number().min(0).optional(),
      downPayment: z.number().min(0).optional(),
    }),
    func: async (input) => {
      const estimate = estimatePaymentCapacity(input);
      const program = inferProgram({
        monthlyIncome: input.monthlyIncome,
        maxPrice: estimate.estimatedPrice,
      });
      await updateContactProfile(ctx.contact.id, {
        monthlyIncome: input.monthlyIncome,
        monthlyDebts: input.monthlyDebts,
        downPayment: input.downPayment,
        maxInstallment: estimate.maxInstallment,
        estimatedLoan: estimate.estimatedLoan,
        estimatedPrice: estimate.estimatedPrice,
        suggestedProgram: program,
      });
      return JSON.stringify({ ...estimate, suggestedProgram: program });
    },
  });

  return [saveProfile, consult, capacity, findProjects];
}
