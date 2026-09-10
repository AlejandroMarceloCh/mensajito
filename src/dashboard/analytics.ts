import type { AgentKind, ContactListItem, Stage } from "./types";

export const STAGE_META: { stage: Stage; label: string; color: string }[] = [
  { stage: "new", label: "Nuevos", color: "#a5b1bc" },
  { stage: "qualifying", label: "En evaluación", color: "#7e8fe0" },
  { stage: "qualified", label: "Calificados", color: "#5264bd" },
  { stage: "visit_scheduled", label: "Visita agendada", color: "#2e8370" },
  { stage: "won", label: "Ganados", color: "#174f43" },
  { stage: "nurture", label: "Seguimiento", color: "#b68a3c" },
  { stage: "lost", label: "Perdidos", color: "#bc7e79" },
  { stage: "appointment_requested", label: "Cita solicitada", color: "#738299" },
  { stage: "handed_off", label: "Derivados a asesor", color: "#738299" },
  { stage: "closed", label: "Cerrados sin resultado", color: "#738299" },
  { stage: "unknown", label: "Etapa sin registrar", color: "#738299" },
];
export const agentName = (agent: AgentKind) => agent === "sales" ? "Tami" : "Milo";
export const dateKey = (value: string | number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
export const shortDate = (value: string | number) => new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short" }).format(new Date(value));
export const isActive = (c: ContactListItem) => !["won", "lost", "closed"].includes(c.stage);
export const isQualified = (c: ContactListItem) => ["qualified", "visit_scheduled", "won"].includes(c.stage);
export const ratio = (value: number, total: number) => total ? Math.round(value / total * 100) : null;
export function attentionReason(c: ContactListItem, now: number) {
  if (!isActive(c)) return null;
  if (c.nextFollowUpAt && +new Date(c.nextFollowUpAt) <= now) return { priority: 0, label: "Seguimiento vencido" };
  if (c.lastInboundAt && (!c.lastOutboundAt || new Date(c.lastInboundAt) > new Date(c.lastOutboundAt))) return { priority: 1, label: "Último mensaje del lead" };
  return null;
}
export function analyticsModel(all: ContactListItem[], period: number, agent: "all" | AgentKind, now: number) {
  const end = new Date(`${dateKey(now)}T00:00:00-05:00`).getTime() + 86400000;
  const start = end - period * 86400000;
  const scoped = all.filter(c => agent === "all" || c.agent === agent);
  const rows = scoped.filter(c => +new Date(c.createdAt) >= start && +new Date(c.createdAt) < end);
  const previous = scoped.filter(c => +new Date(c.createdAt) >= start - period * 86400000 && +new Date(c.createdAt) < start);
  // Buckets aggregate actual rows; missing days stay at zero.
  const step = period > 7 ? 7 : 1;
  const trend = Array.from({ length: Math.ceil(period / step) }, (_, i) => {
    const from = start + i * step * 86400000;
    const to = Math.min(end, from + step * 86400000);
    const items = rows.filter(c => +new Date(c.createdAt) >= from && +new Date(c.createdAt) < to);
    return { label: shortDate(from), range: `${shortDate(from)}${step > 1 ? ` – ${shortDate(to - 1)}` : ""}`, Tami: items.filter(c => c.agent === "sales").length, Milo: items.filter(c => c.agent === "housing").length };
  });
  const attention = rows.filter(c => attentionReason(c, now)).sort((a,b) => (attentionReason(a, now)?.priority ?? 2) - (attentionReason(b, now)?.priority ?? 2) || (b.intentScore ?? 0) - (a.intentScore ?? 0));
  const districts = Object.entries(rows.reduce<Record<string, ContactListItem[]>>((map, c) => { const key = typeof c.profile.district === "string" ? c.profile.district : "Sin distrito"; (map[key] ??= []).push(c); return map; }, {})).sort((a,b) => b[1].length - a[1].length);
  return { rows, previous, trend, attention, districts, start, end,
    qualified: rows.filter(isQualified), visits: rows.filter(c => c.stage === "visit_scheduled"),
    overdue: rows.filter(c => attentionReason(c, now)?.priority === 0),
    upcoming: rows.filter(c => isActive(c) && c.nextFollowUpAt && +new Date(c.nextFollowUpAt) > now).sort((a,b) => +new Date(a.nextFollowUpAt!) - +new Date(b.nextFollowUpAt!)),
  };
}
