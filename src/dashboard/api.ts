import type {
  Appointment,
  ContactDetail,
  ContactFilters,
  ContactListItem,
  ContactPatch,
  FollowUp,
  Message,
  Stage,
  Stats,
} from "./types";
import { STAGE_TRANSITIONS } from "./types";
import { mockContacts, mockFollowUps, mockMessages } from "./mock-data";

// The local static preview is demo-only. A server advertises live mode explicitly
// before React mounts; a live API failure never swaps real data for mock data.
export let USE_MOCK = true;
export let READ_ONLY = false;
export async function initializeDashboard(): Promise<void> {
  const response = await fetch("/api/dashboard/config", { cache: "no-store" });
  if (response.status === 404) { USE_MOCK = true; READ_ONLY = false; return; }
  if (!response.ok) throw new Error("No se pudo comprobar la conexión del dashboard.");
  if (response.headers.get("content-type")?.includes("text/html")) { USE_MOCK = true; READ_ONLY = false; return; }
  const config = await response.json() as { mode?: string; readOnly?: boolean };
  if (config.mode !== "live") throw new Error("Modo de datos desconocido; no se mostrarán datos de ejemplo.");
  USE_MOCK = false;
  READ_ONLY = config.readOnly !== false;
}

export async function listAppointments(): Promise<{ items: Appointment[] }> {
  if (USE_MOCK) return { items: [] };
  return request("/api/appointments");
}

function assertWritable() {
  if (READ_ONLY) throw new Error("Conexión de solo lectura. No se modificaron datos ni se enviaron mensajes.");
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 180));

function copy<T>(value: T): T {
  return structuredClone(value);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (response.status === 401 && path !== "/api/login") window.location.assign("/login");
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "No se pudo completar la operación");
  }
  return response.json() as Promise<T>;
}

function requiresFollowUp(contact: ContactListItem) {
  const due = contact.nextFollowUpAt && new Date(contact.nextFollowUpAt).getTime() <= Date.now();
  const inactive =
    contact.lastInboundAt &&
    Date.now() - new Date(contact.lastInboundAt).getTime() > 24 * 60 * 60_000 &&
    ["qualifying", "qualified", "nurture"].includes(contact.stage);
  return Boolean(due || inactive);
}

/** POST /api/login → crea la cookie httpOnly mensajito_session. */
export async function login(password: string): Promise<void> {
  if (USE_MOCK) {
    await pause();
    if (password.trim().length < 4) throw new Error("Ingresa la contraseña del equipo");
    sessionStorage.setItem("mensajito_mock_session", "active");
    return;
  }
  await request<{ ok: true }>("/api/login", { method: "POST", body: JSON.stringify({ password }) });
}

/** POST /api/logout → elimina la cookie de sesión. */
export async function logout(): Promise<void> {
  if (USE_MOCK) {
    sessionStorage.removeItem("mensajito_mock_session");
    return;
  }
  await request<{ ok: true }>("/api/logout", { method: "POST" });
}

export function hasMockSession() {
  return sessionStorage.getItem("mensajito_mock_session") === "active";
}

/** GET /api/contacts → lista paginada con preview del último mensaje. */
export async function listContacts(filters: ContactFilters = {}): Promise<{ items: ContactListItem[]; total: number }> {
  if (!USE_MOCK) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value !== undefined && params.set(key, String(value)));
    return request(`/api/contacts?${params.toString()}`);
  }
  await pause();
  const query = filters.q?.trim().toLocaleLowerCase("es") ?? "";
  const items = mockContacts.filter((contact) => {
    const matchesAgent = !filters.agent || contact.agent === filters.agent;
    const matchesStage =
      !filters.stage ||
      (filters.stage === "needs_followup" ? requiresFollowUp(contact) : contact.stage === filters.stage);
    const matchesQuery =
      !query ||
      contact.name?.toLocaleLowerCase("es").includes(query) ||
      contact.phone.includes(query) ||
      contact.lastMessagePreview.toLocaleLowerCase("es").includes(query);
    return matchesAgent && matchesStage && matchesQuery;
  });
  return { items: copy(items), total: items.length };
}

/** GET /api/contacts/:id → contacto, últimos mensajes y seguimientos. */
export async function getContact(id: string): Promise<ContactDetail> {
  if (!USE_MOCK) return request(`/api/contacts/${id}`);
  await pause();
  const contact = mockContacts.find((item) => item.id === id);
  if (!contact) throw new Error("No encontramos este lead");
  return copy({
    contact,
    messages: mockMessages.filter((message) => message.contactId === id),
    followUps: mockFollowUps.filter((followUp) => followUp.contactId === id),
  });
}

/** PATCH /api/contacts/:id → actualiza datos, perfil y etapa del lead. */
export async function patchContact(id: string, patch: ContactPatch): Promise<ContactListItem> {
  assertWritable();
  if (!USE_MOCK) return request(`/api/contacts/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  await pause();
  const index = mockContacts.findIndex((item) => item.id === id);
  const current = mockContacts[index];
  if (!current) throw new Error("No encontramos este lead");
  if (patch.stage && patch.stage !== current.stage && !STAGE_TRANSITIONS[current.stage].includes(patch.stage)) {
    throw new Error("Ese cambio de etapa no está permitido");
  }
  const next = {
    ...current,
    ...patch,
    profile: { ...current.profile, ...patch.profile },
    updatedAt: new Date().toISOString(),
  };
  mockContacts[index] = next;
  return copy(next);
}

/** POST /api/contacts/:id/reply → envía respuesta del asesor dentro de la ventana de 24 h. */
export async function reply(id: string, body: string): Promise<Message> {
  assertWritable();
  if (!USE_MOCK) {
    const result = await request<{ message: Message }>(`/api/contacts/${id}/reply`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    return result.message;
  }
  await pause();
  const contact = mockContacts.find((item) => item.id === id);
  if (!contact) throw new Error("No encontramos este lead");
  if (!contact.sessionOpen) throw new Error("La ventana de 24 h cerró. Programa una plantilla de seguimiento.");
  const message: Message = {
    id: crypto.randomUUID(), contactId: id, role: "advisor", content: body.trim(), kapsoId: null, createdAt: new Date().toISOString(),
  };
  mockMessages.push(message);
  contact.lastMessagePreview = body.trim();
  contact.lastOutboundAt = message.createdAt;
  contact.updatedAt = message.createdAt;
  return copy(message);
}

/** POST /api/contacts/:id/follow-ups → agenda un seguimiento, sin enviarlo aún. */
export async function scheduleFollowUp(id: string, dueAt: string, note: string): Promise<FollowUp> {
  assertWritable();
  if (!USE_MOCK) return request(`/api/contacts/${id}/follow-ups`, { method: "POST", body: JSON.stringify({ dueAt, note }) });
  await pause();
  const contact = mockContacts.find((item) => item.id === id);
  if (!contact) throw new Error("No encontramos este lead");
  const followUp: FollowUp = {
    id: crypto.randomUUID(), contactId: id, dueAt, status: "pending", note: note.trim() || null, createdAt: new Date().toISOString(),
  };
  mockFollowUps.push(followUp);
  contact.nextFollowUpAt = dueAt;
  contact.updatedAt = followUp.createdAt;
  return copy(followUp);
}

/** POST /api/follow-ups/:id/cancel → cancela un seguimiento pendiente. */
export async function cancelFollowUp(id: string): Promise<void> {
  assertWritable();
  if (!USE_MOCK) return void (await request(`/api/follow-ups/${id}/cancel`, { method: "POST" }));
  await pause();
  const followUp = mockFollowUps.find((item) => item.id === id);
  if (!followUp) throw new Error("No encontramos este seguimiento");
  followUp.status = "cancelled";
  const contact = mockContacts.find((item) => item.id === followUp.contactId);
  if (contact?.nextFollowUpAt === followUp.dueAt) contact.nextFollowUpAt = null;
}

/** GET /api/stats → resumen operativo de leads, agentes y seguimientos. */
export async function getStats(): Promise<Stats> {
  if (!USE_MOCK) return request("/api/stats");
  await pause();
  const byStage = mockContacts.reduce<Partial<Record<Stage, number>>>((result, contact) => {
    result[contact.stage] = (result[contact.stage] ?? 0) + 1;
    return result;
  }, {});
  return {
    leadsThisMonth: mockContacts.length,
    byStage,
    byAgent: {
      sales: mockContacts.filter((contact) => contact.agent === "sales").length,
      housing: mockContacts.filter((contact) => contact.agent === "housing").length,
    },
    followUpsPending: mockFollowUps.filter((item) => item.status === "pending").length,
  };
}
