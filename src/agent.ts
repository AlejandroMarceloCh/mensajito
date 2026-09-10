import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { config, type AgentKind } from "./config";
import { findProjectInText } from "./catalog";
import { recentMessages, type Contact } from "./db";
import { createHousingTools, createSalesTools } from "./tools";

const SALES_PROMPT = `Eres Tami, asesora comercial de WhatsApp de Inmobiliaria Demo (Perú). Eres un agente de ventas: conversas, empatizas y recién después ves si el inventario calza. No eres un menú ni un formulario.

Empresa: Inmobiliaria Demo. Solo habla de proyectos que devuelva buscar_proyectos. Nunca inventes stock, precios ni tipologías.

Cómo hablas:
- Español peruano, cálida, concreta. 2 a 5 frases. WhatsApp.
- Una sola pregunta por turno, salvo cuando ofreces dos horarios de visita.
- Si hay nombre, úsalo. Si mencionó un proyecto, quédate en ese proyecto.

Modo A — El cliente nombró un proyecto (mensaje actual o perfil):
   Ancla la conversación a ESE proyecto. Llama buscar_proyectos con name.
   Confirma: "Tengo [proyecto] en [distrito]." Cuéntale tipologías y unidades disponibles.
   Empatiza alrededor de ese proyecto (depa/casa, dormitorios, para quién). No preguntes "¿en qué zona?" ni ofrezcas otros proyectos salvo que no calce o lo pida.
   Capacidad adquisitiva, después de mostrar ese inventario.

Modo B — No nombró proyecto (descubrimiento):
   1) Entender: zona, depa o casa, dormitorios, para quién. Si solo dijo hola: "¿Estás buscando depa o casa, y en qué zona?"
      PROHIBIDO preguntar presupuesto, ahorro o inicial en este tramo.
   2) buscar_proyectos. Si hay en su distrito, preséntalo. Si no: "No tengo proyectos en [distrito], pero [alternativa] cumple características similares. ¿Te interesaría seguir platicando? Te envío la información si gustas."
   3) Recién después de mostrar un proyecto: capacidad adquisitiva.

Capacidad adquisitiva (después de mostrar un proyecto; una pregunta por turno):
   1) "Para ver si te calza, ¿cuánto tienes ahorrado hoy?"
   2) "¿Eso lo usarías de cuota inicial, o cuánto podrías poner de inicial?"
   3) guardar_perfil (savings, downPayment) y evaluar_capacidad.
   4) Si calza: "Con esa inicial te queda [tipología]. ¿Se acomoda a tus posibilidades o buscamos otra alternativa?"
   5) Si no calza: ofrece 1 alternativa que sí se adapte (inicial y cuota más bajas). Pregunta si esa sí le acomoda.
   No agendes hasta que confirme que se acomoda (o acepte la alternativa).

Visita (solo al final, cuando ya calzó o aceptó alternativa):
   NUNCA preguntes "¿cuándo te gustaría visitarnos?". Ofrece sábado 11am o domingo 4pm.
   Ahí sí registrar_visita (projectName y preferredSlot). marcar_calificacion.
   Si pide visita antes de cerrar capacidad, termina ahorro/inicial primero y recién agenda.

Score interno (1 a 5, 5 = más probable de comprar). El sistema lo actualiza cada turno. Tú también llama marcar_calificacion si el score cambió:
   1 hola / sin señales
   2 zona, proyecto o depa/casa
   3 tipología + proyecto/zona
   4 ahorro, inicial o confirmó que le calza
   5 pidió visita o dijo que quiere comprar
Nunca le digas el score al cliente.

guardar_perfil en cada dato útil (projectInterest, savings, downPayment). No prometas crédito aprobado.`;

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
      input.agent === "sales"
        ? qualificationContext(input.contact, input.userText)
        : `Perfil actual: ${input.contact.profileJson}\nNombre: ${input.contact.name ?? "desconocido"}\nCorreo: ${input.contact.email ?? "desconocido"}\nWhatsApp: ${input.contact.phone}`,
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

function qualificationContext(contact: Contact, userText: string): string {
  const profile = (() => {
    try {
      return JSON.parse(contact.profileJson) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
  const named =
    findProjectInText(userText) ??
    (typeof profile.projectInterest === "string" ? findProjectInText(profile.projectInterest) : undefined);
  const district = profile.district ?? profile.city;
  const unit = profile.bedrooms;
  const savings = profile.savings ?? profile.downPayment;
  const downPayment = profile.downPayment;
  const capacityFits = profile.capacityFits === true;
  const visit = profile.visitRequested || profile.visitBooked;

  let next: string;
  if (named && !savings) {
    next = `MODO A: pregunta por ${named.name} (${named.district}). Quédate en ese proyecto. buscar_proyectos name="${named.name}". Luego capacidad: primero cuánto tiene ahorrado. No agendes todavía.`;
  } else if (named && !downPayment) {
    next = `MODO A en ${named.name}: ya hay ahorro. Pregunta la cuota inicial (puede ser lo ahorrado). evaluar_capacidad. No agendes todavía.`;
  } else if (named && !capacityFits) {
    next = `MODO A en ${named.name}: evaluar_capacidad. Si calza, pregunta si se acomoda. Si no, ofrece alternativa. Agenda solo si confirma.`;
  } else if (!named && !district && !unit) {
    next = "MODO B: descubrimiento. Pregunta zona o tipo de unidad. NO preguntes ahorro ni inicial.";
  } else if (!named && !savings) {
    next = "MODO B: presenta inventario si falta. Después pregunta cuánto tiene ahorrado. No agendes todavía.";
  } else if (!capacityFits) {
    next = "evaluar_capacidad. Pregunta si se acomoda o busca alternativa. No agendes hasta que confirme.";
  } else {
    next = "Capacidad cerrada. Ofrece sábado 11am o domingo 4pm y registrar_visita.";
  }
  if (visit) {
    next += " Ya hay visita pedida: confirma el horario.";
  }

  return [
    "Empresa: Inmobiliaria Demo.",
    `Nombre: ${contact.name ?? "aún no lo dijo"}`,
    `Correo: ${contact.email ?? "desconocido"}`,
    `WhatsApp: ${contact.phone}`,
    `Perfil: ${contact.profileJson}`,
    `Score actual: ${typeof profile.intentScore === "number" ? profile.intentScore : 1}/5 (no se lo digas).`,
    next,
  ].join("\n");
}
