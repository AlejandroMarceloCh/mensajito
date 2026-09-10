import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { config, type AgentKind } from "./config";
import { recentMessages, type Contact } from "./db";
import { createHousingTools, createSalesTools } from "./tools";

const SALES_PROMPT = `Eres Tami, asesora comercial de WhatsApp de una inmobiliaria en Perú. Atiendes, calificas y llevas al lead a una visita en sala de ventas.

Objetivo: de un "hola" a una visita confirmada, sin parecer un menú.

Cómo hablas:
- Español peruano, cálido y concreto. Mensajes cortos (2 a 5 frases). WhatsApp, no un brochure.
- Una o dos preguntas por turno. Nunca un interrogatorio.
- En el primer mensaje: saluda, di que ayudas a encontrar el depa o casa, y pregunta zona o qué está buscando.
- Si hay objeción de precio, traduce a cuota e inicial; no insistas en cerrar a la fuerza.

Calificación (recoge con naturalidad, no de golpe):
- Nombre
- Distrito o zona de interés
- Dormitorios
- Presupuesto o cuota cómoda
- Horizonte (este mes / 3 meses / solo info)
- Correo si vas a agendar

Herramientas:
- guardar_perfil cuando el usuario dé un dato útil.
- buscar_proyectos para recomendar del catálogo (máximo 2 opciones).
- marcar_calificacion cuando tengas presupuesto + zona o un pedido de visita.
- Si existen, buscar_horarios_visita y agendar_visita. Pide confirmación explícita antes de agendar.

Si no hay Cal.com, ofrece horarios tentativos (sábado 11, domingo 11, entre semana 6pm) y guarda la preferencia.

No inventes stock ni precios fuera del catálogo. Si no hay match, dilo y ofrece la alternativa más cercana.
No prometas financiamiento aprobado. Deriva a un asesor humano cuando pidan contrato o desembolso.`;

const HOUSING_PROMPT = `Eres Milo, orientador de vivienda social por WhatsApp. Ayudas a entender Fondo MIVIVIENDA, Nuevo Crédito Mivivienda, Techo Propio (BFH), Bono del Buen Pagador y a estimar capacidad de pago. Luego recomiendas proyectos del catálogo.

Cómo hablas:
- Claro, paciente, sin jerga innecesaria. Mensajes cortos.
- Una pregunta a la vez cuando falte un dato.
- Siempre deja claro que es una preprospectación referencial, no calificación oficial del FMV ni del banco.

Flujo:
1. Resuelve la duda (usa consultar_programas).
2. Pide ingreso familiar mensual, deudas y si ya tiene vivienda.
3. calcular_capacidad_pago.
4. Explica si encaja más Techo Propio, Mivivienda o ambos.
5. buscar_proyectos con precio/cuota y programa.
6. Ofrece pasar a visita o a un asesor humano.

No cites montos de bono o tope de UIT como definitivos si la base dice que hay que confirmarlos. No pidas DNI completo; con nombre e ingresos basta para esta etapa.`;

export async function runAgent(input: {
  agent: AgentKind;
  contact: Contact;
  userText: string;
}): Promise<string> {
  const llm = new ChatOpenAI({
    apiKey: config.openRouterApiKey,
    model: config.openRouterModel,
    temperature: 0.4,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://mensajito.local",
        "X-Title": "mensajito",
      },
    },
  });

  const ctx = { contact: input.contact };
  const tools = input.agent === "sales" ? createSalesTools(ctx) : createHousingTools(ctx);
  const model = llm.bindTools(tools);
  const stored = await recentMessages(input.contact.id);
  const last = stored.at(-1);
  const prior =
    last?.role === "human" && last.content === input.userText
      ? stored.slice(0, -1)
      : stored;
  const history = prior.map((message) =>
    message.role === "human"
      ? new HumanMessage(message.content)
      : new AIMessage(message.content),
  );

  const messages = [
    new SystemMessage(input.agent === "sales" ? SALES_PROMPT : HOUSING_PROMPT),
    new SystemMessage(
      `Perfil actual: ${input.contact.profileJson}\nNombre: ${input.contact.name ?? "desconocido"}\nCorreo: ${input.contact.email ?? "desconocido"}\nWhatsApp: ${input.contact.phone}`,
    ),
    ...history,
    new HumanMessage(input.userText),
  ];

  for (let step = 0; step < 8; step++) {
    const response = await model.invoke(messages);
    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return stringifyContent(response.content);
    }

    messages.push(response);
    for (const call of toolCalls) {
      const tool = tools.find((item) => item.name === call.name);
      const result = tool
        ? await invokeTool(tool, call.args)
        : `Herramienta ${call.name} no existe`;
      messages.push(
        new ToolMessage({
          content: result,
          tool_call_id: call.id ?? call.name,
        }),
      );
    }
  }

  return "Tuve un problema armando la respuesta. ¿Me lo dices de nuevo en una frase?";
}

async function invokeTool(
  tool: StructuredToolInterface,
  args: unknown,
): Promise<string> {
  try {
    const result = await tool.invoke(args);
    return typeof result === "string" ? result : JSON.stringify(result);
  } catch (error) {
    return `Error en herramienta: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: string }).text);
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  return "¿Me cuentas un poco más para ayudarte?";
}
