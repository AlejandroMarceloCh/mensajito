import { createClient } from "@supabase/supabase-js";
import type { Appointment, ContactDetail, ContactListItem, FollowUp, Message, Stage } from "./dashboard/types";

type Row = Record<string, unknown>;
export type SourceTables = { contacts: Row[]; conversations: Row[]; messages: Row[]; lead_profiles: Row[]; follow_ups: Row[]; appointments: Row[] };
export type DashboardSnapshot = { contacts: ContactListItem[]; details: Map<string, ContactDetail>; appointments: Appointment[] };
const text = (v: unknown) => typeof v === "string" ? v : null;
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
const object = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const time = (v: unknown) => { const value = typeof v === "string" ? Date.parse(v) : NaN; return Number.isFinite(value) ? value : 0; };
const groupBy = <T extends Row>(rows: T[], key: string) => {
  const groups = new Map<unknown, T[]>();
  for (const row of rows) { const group = groups.get(row[key]) ?? []; group.push(row); groups.set(row[key], group); }
  return groups;
};

// Keep requested appointments, handoffs and closed conversations distinct.
// In particular, "closed" is not proof of a sale or a lost opportunity.
const sourceStages: Record<string, Stage> = { new: "new", discovering: "qualifying", qualified: "qualified", appointment_requested: "appointment_requested", handed_off: "handed_off", nurturing: "nurture", closed: "closed" };
export function mapSnapshot(source: SourceTables, now = Date.now()): DashboardSnapshot {
  const details = new Map<string, ContactDetail>();
  const appointments: Appointment[] = source.appointments.map(a => ({ id: String(a.id), contactId: String(a.contact_id), kind: a.kind as Appointment["kind"], requestedFor: text(a.requested_for), status: a.status as Appointment["status"], notes: text(a.notes) }));
  // Index relationships once; do not rescan the entire message table for every lead.
  const conversationsByContact = groupBy(source.conversations, "contact_id");
  const messagesByConversation = groupBy(source.messages, "conversation_id");
  const followUpsByContact = groupBy(source.follow_ups, "contact_id");
  const profilesByContact = new Map(source.lead_profiles.map(profile => [profile.contact_id, profile]));
  const appointmentsByContact = groupBy(appointments, "contactId");
  const contacts = source.contacts.map(c => {
    const id = String(c.id);
    const conversations = (conversationsByContact.get(id) ?? []).sort((a,b) => Number(b.is_active === true) - Number(a.is_active === true) || time(b.last_message_at) - time(a.last_message_at));
    const current = conversations[0];
    const history = conversations.flatMap(v => messagesByConversation.get(v.id) ?? []).sort((a,b) => time(a.created_at) - time(b.created_at) || String(a.id).localeCompare(String(b.id)));
    const messages: Message[] = history.map(m => ({ id: String(m.id), contactId: id, role: m.direction === "inbound" ? "human" : "outbound", content: text(m.body) ?? `[${text(m.message_type) ?? "Mensaje sin texto"}]`, kapsoId: text(m.kapso_message_id), createdAt: String(m.created_at) }));
    const storedProfile = profilesByContact.get(id) ?? {};
    const extra = object(storedProfile.extra);
    const zones = Array.isArray(storedProfile.preferred_zones) ? storedProfile.preferred_zones : [];
    const profile: Row = { ...extra, district: text(extra.district) ?? text(zones[0]), budgetMax: num(extra.budgetMax) ?? num(storedProfile.budget_max), bedrooms: num(extra.bedrooms) ?? num(storedProfile.bedrooms), notes: text(extra.notes) ?? text(extra.qualificationNote) ?? text(current?.summary) };
    const followUps: FollowUp[] = (followUpsByContact.get(id) ?? []).map(f => ({ id: String(f.id), contactId:id, dueAt:String(f.scheduled_for), status:f.status as FollowUp["status"], note:text(f.reason), createdAt:String(f.created_at) })).sort((a,b) => time(a.dueAt) - time(b.dueAt));
    const lastInboundAt = messages.filter(m => m.role === "human").at(-1)?.createdAt ?? null;
    const lastOutboundAt = messages.filter(m => m.role !== "human").at(-1)?.createdAt ?? null;
    if (c.agent !== "sales" && c.agent !== "housing") throw new Error("Agente de origen no reconocido; no se asignará un agente por defecto.");
    const sourceStage = text(current?.stage) ?? "unknown";
    const contact: ContactListItem = { id, agent:c.agent, phone:text(c.phone_number) ?? text(c.whatsapp_id) ?? "Sin teléfono", username:text(extra.username), name:text(c.name), email:text(c.email), stage:sourceStages[sourceStage] ?? "unknown", sourceStage, intentScore:num(extra.intentScore), profile, lastInboundAt, lastOutboundAt, nextFollowUpAt:followUps.find(f => f.status === "pending")?.dueAt ?? null, sessionOpen:Boolean(lastInboundAt && now >= time(lastInboundAt) && now - time(lastInboundAt) < 86400000), assignedTo:text(extra.assignedTo), createdAt:String(c.created_at), updatedAt:String(c.updated_at), lastMessagePreview:messages.at(-1)?.content ?? "Sin mensajes registrados", conversationCount:conversations.length, messageCount:messages.length };
    details.set(id, { contact, messages, followUps, appointments:appointmentsByContact.get(id) ?? [] });
    return contact;
  });
  return { contacts, details, appointments };
}

const columns: Record<keyof SourceTables, string> = {
  contacts:"id,agent,whatsapp_id,phone_number,name,email,created_at,updated_at",
  conversations:"id,contact_id,stage,summary,is_active,last_message_at",
  messages:"id,conversation_id,direction,message_type,body,kapso_message_id,created_at",
  lead_profiles:"contact_id,extra,preferred_zones,budget_max,bedrooms",
  follow_ups:"id,contact_id,scheduled_for,status,reason,created_at",
  appointments:"id,contact_id,kind,requested_for,status,notes",
};
export function createSnapshotReader(url: string, key: string, fetcher?: typeof fetch) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, ...(fetcher ? { global: { fetch: fetcher } } : {}) });
  let pending: Promise<DashboardSnapshot> | undefined;
  let cached: DashboardSnapshot | undefined;
  let expires = 0;
  const readTable = async (table: keyof SourceTables): Promise<Row[]> => {
    const rows: Row[] = [];
    for (let offset = 0; offset < 100000; offset += 500) {
      const { data, error } = await client.from(table).select(columns[table]).order(table === "lead_profiles" ? "contact_id" : "id").range(offset, offset + 499);
      if (error) throw new Error(`No se pudo leer ${table} (${error.code}).`);
      rows.push(...data as unknown as Row[]);
      if (data.length < 500) return rows;
    }
    throw new Error(`La tabla ${table} supera el límite de lectura del dashboard; no se mostrarán conteos parciales.`);
  };
  return async () => {
    if (cached && Date.now() < expires) return cached;
    if (pending) return pending;
    pending = (async () => {
      const entries = await Promise.all((Object.keys(columns) as (keyof SourceTables)[]).map(async table => [table, await readTable(table)] as const));
      cached = mapSnapshot(Object.fromEntries(entries) as SourceTables);
      expires = Date.now() + 5000;
      return cached;
    })().finally(() => { pending = undefined; });
    return pending;
  };
}
