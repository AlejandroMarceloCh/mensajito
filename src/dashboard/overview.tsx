import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import { ArrowDownToLine, ArrowRight, CalendarDays, Check, CircleHelp, Clock3, Database, LockKeyhole, MessageSquare, RefreshCw, Users, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import type { AgentKind, Appointment, ContactListItem } from "./types";
import { listAppointments, listContacts, READ_ONLY, USE_MOCK } from "./api";
import { STAGE_META, agentName, analyticsModel, attentionReason, shortDate } from "./analytics";
import "./overview.css";

type ReportTab = "summary" | "acquisition" | "followups" | "appointments";
const tabs: { id: ReportTab; label: string }[] = [
  { id: "summary", label: "Resumen" }, { id: "acquisition", label: "Captación" },
  { id: "followups", label: "Seguimientos" }, { id: "appointments", label: "Citas" },
];
const appointmentLabels: Record<Appointment["status"], string> = { requested: "Solicitada", confirmed: "Confirmada", cancelled: "Cancelada", completed: "Completada" };
const supplementalStages: Record<string, string> = { appointment_requested: "Cita solicitada", handed_off: "Derivado a asesor", closed: "Cerrado", unknown: "Sin clasificar" };
const stageLabel = (c: ContactListItem) => c.stage === "unknown" && c.sourceStage ? `Sin clasificar: ${c.sourceStage}` : STAGE_META.find(s => s.stage === c.stage)?.label ?? supplementalStages[c.stage] ?? c.sourceStage ?? c.stage;
const textValue = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const timeValue = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const lastActivity = (c: ContactListItem) => Math.max(timeValue(c.lastInboundAt), timeValue(c.lastOutboundAt));
const dateTime = (value: string | null) => value && timeValue(value) ? new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Por coordinar";
const plural = (n: number, one: string, many: string) => n === 1 ? one : many;

export function Overview({ onOpen }: { onOpen: (id: string) => void }) {
  const [all, setAll] = useState<ContactListItem[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoaded, setAppointmentsLoaded] = useState(false);
  const [appointmentError, setAppointmentError] = useState("");
  const [agent, setAgent] = useState<"all" | AgentKind>("all");
  const [period, setPeriod] = useState(30);
  const [tab, setTab] = useState<ReportTab>("summary");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updated, setUpdated] = useState(Date.now());
  const [drawer, setDrawer] = useState<{ title: string; description: string; rows: ContactListItem[] } | null>(null);
  const [definitions, setDefinitions] = useState(false);
  const [exported, setExported] = useState(false);
  const [followupFilter, setFollowupFilter] = useState<"attention" | "upcoming">("attention");
  const alive = useRef(true);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    const readContacts = async () => {
      const contacts: ContactListItem[] = [];
      for (let offset = 0; ; offset += 100) {
        const result = await listContacts({ limit: 100, offset });
        contacts.push(...result.items);
        if (contacts.length >= result.total || !result.items.length) break;
      }
      return contacts;
    };
    try {
      const [contactsResult, appointmentsResult] = await Promise.allSettled([readContacts(), listAppointments()]);
      if (!alive.current) return;
      if (contactsResult.status === "fulfilled") {
        setAll(contactsResult.value); setLoaded(true); setError(""); setUpdated(Date.now());
      } else setError("No se pudieron consultar los contactos. Los datos no se reemplazarán por una demo.");
      if (appointmentsResult.status === "fulfilled") {
        setAppointments(appointmentsResult.value.items); setAppointmentsLoaded(true); setAppointmentError("");
      } else { setAppointmentError("No se pudo consultar la tabla de citas."); setAppointmentsLoaded(false); }
    } finally { inFlight.current = false; if (alive.current) setRefreshing(false); }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => { alive.current = false; clearInterval(timer); };
  }, [load]);

  const model = useMemo(() => analyticsModel(all, period, agent, updated), [all, period, agent, updated]);
  const { rows, trend, qualified, attention, overdue, upcoming, previous } = model;
  const ids = useMemo(() => new Set(rows.map(c => c.id)), [rows]);
  const cohortAppointments = useMemo(() => appointments.filter(a => ids.has(a.contactId)).sort((a,b) => timeValue(b.requestedFor) - timeValue(a.requestedFor)), [appointments, ids]);
  const confirmedVisits = cohortAppointments.filter(a => a.kind === "visit" && a.status === "confirmed");
  const messagesKnown = rows.every(c => typeof c.messageCount === "number");
  const conversationsKnown = rows.every(c => typeof c.conversationCount === "number");
  const messageCount = rows.reduce((total, c) => total + (c.messageCount ?? 0), 0);
  const conversationCount = rows.reduce((total, c) => total + (c.conversationCount ?? 0), 0);
  const recent = [...rows].filter(c => lastActivity(c) || c.lastMessagePreview).sort((a,b) => lastActivity(b) - lastActivity(a))[0];
  const stages = useMemo(() => {
    const grouped = new Map<string, { stage: string; label: string; count: number; rows: ContactListItem[] }>();
    for (const c of rows) {
      const key = c.stage === "unknown" ? c.sourceStage ?? c.stage : c.stage;
      if (!grouped.has(key)) grouped.set(key, { stage: key, label: stageLabel(c), count: 0, rows: [] });
      const item = grouped.get(key)!; item.count++; item.rows.push(c);
    }
    return [...grouped.values()].sort((a,b) => b.count - a.count);
  }, [rows]);
  const actionRows = followupFilter === "attention" ? attention : upcoming;
  const show = (title: string, items: ContactListItem[], description = "Contactos creados en el período y agente seleccionados.") => setDrawer({ title, rows: items, description });
  const openMessages = () => {
    if (rows.length === 1) onOpen(rows[0]!.id);
    else show("Conversaciones registradas", rows, "Abre un contacto para consultar su historial de mensajes.");
  };
  const exportCsv = () => {
    const escape = (value: string) => '"' + (/^[=+@-]/.test(value) ? "'" : "") + value.replaceAll('"', '""') + '"';
    const csv = [["Nombre", "Agente", "Etapa actual", "Fecha de ingreso", "Mensajes registrados"], ...rows.map(c => [c.name ?? "Sin nombre", agentName(c.agent), stageLabel(c), c.createdAt, c.messageCount?.toString() ?? "No disponible"])].map(row => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `mensajito-leads-${period}d.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setExported(true); setTimeout(() => setExported(false), 2000);
  };

  return <main className="bi-workspace">
    <header className="bi-header">
      <div><p className="bi-eyebrow">MENSAJITO / INTELIGENCIA COMERCIAL</p><h1>De la conversación a la visita</h1><p className="bi-subtitle">Leads, actividad y citas. Una sola fuente de información.</p></div>
      <div className="bi-header-actions"><span className={"bi-source " + (USE_MOCK ? "is-demo" : "")}><Database size={17}/>{USE_MOCK ? "Datos de demostración" : "Supabase · datos reales"}</span>{READ_ONLY && <span className="bi-readonly"><LockKeyhole size={15}/>Solo lectura</span>}</div>
    </header>

    <div className="bi-controls">
      <div className="bi-filters"><label>Ingreso del lead<select aria-label="Período de ingreso" value={period} onChange={e => setPeriod(Number(e.target.value))}><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option></select></label><label>Agente<select aria-label="Filtrar dashboard por agente" value={agent} onChange={e => setAgent(e.target.value as "all" | AgentKind)}><option value="all">Todos los agentes</option><option value="sales">Tami · Ventas</option><option value="housing">Milo · Vivienda</option></select></label>{(period !== 30 || agent !== "all") && <button className="bi-text-button bi-reset" onClick={() => { setPeriod(30); setAgent("all"); }}>Restablecer</button>}</div>
      <div className="bi-tools"><button className="bi-button" disabled={refreshing} onClick={() => void load()}><RefreshCw size={18} className={refreshing ? "bi-rotating" : ""}/><span>Actualizar</span></button><button className="bi-button" disabled={!loaded || !rows.length || Boolean(error)} onClick={exportCsv}>{exported ? <Check size={18}/> : <ArrowDownToLine size={18}/>}<span>{exported ? "Exportado" : "Exportar CSV"}</span></button></div>
    </div>
    <div className="bi-tabs" role="tablist" aria-label="Vistas del dashboard">{tabs.map((t, index) => <button key={t.id} id={`bi-tab-${t.id}`} role="tab" tabIndex={tab === t.id ? 0 : -1} aria-selected={tab === t.id} aria-controls={`bi-panel-${t.id}`} onClick={() => setTab(t.id)} onKeyDown={event => {
      const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
      if (nextIndex === null) return;
      event.preventDefault(); const next = tabs[nextIndex]!; setTab(next.id); document.getElementById(`bi-tab-${next.id}`)?.focus();
    }}>{t.label}{t.id === "appointments" && appointmentsLoaded && <span>{cohortAppointments.length}</span>}</button>)}</div>

    <div className="bi-canvas">
      {error && <div className="bi-error" role="alert"><strong>No se puede mostrar una lectura actualizada</strong><p>{error}</p><button className="bi-button" onClick={() => void load()}>Reintentar consulta</button></div>}
      {!loaded && !error && <div className="bi-empty" role="status"><RefreshCw className="bi-rotating" size={26}/><h2>Consultando los registros…</h2><p>Contactos, conversaciones y citas.</p></div>}
      {loaded && !error && <section id={`bi-panel-${tab}`} role="tabpanel" aria-labelledby={`bi-tab-${tab}`}>
        {tab === "summary" && <>
          <div className="bi-metrics" aria-label="Indicadores principales">
            <button className="bi-metric" onClick={() => show("Leads registrados", rows)}><span className="bi-metric-label">Leads registrados <Users size={21}/></span><strong>{rows.length}</strong><span>{qualified.length} de {rows.length} calificados o avanzados</span><span className="bi-metric-link">Ver contactos <ArrowRight size={17}/></span></button>
            <button className="bi-metric" onClick={openMessages}><span className="bi-metric-label">Mensajes registrados <MessageSquare size={21}/></span><strong>{messagesKnown ? messageCount : "—"}</strong><span>{conversationsKnown ? `${conversationCount} ${plural(conversationCount, "conversación", "conversaciones")} en el historial` : "Consulta el historial por contacto"}</span><span className="bi-metric-link">Abrir conversaciones <ArrowRight size={17}/></span></button>
            <button className="bi-metric" onClick={() => setTab("appointments")}><span className="bi-metric-label">Visitas confirmadas <CalendarDays size={21}/></span><strong>{appointmentsLoaded ? confirmedVisits.length : "—"}</strong><span>{appointmentsLoaded ? `${cohortAppointments.length} ${plural(cohortAppointments.length, "cita registrada", "citas registradas")} en total` : "Datos de citas no disponibles"}</span><span className="bi-metric-link">Revisar citas <ArrowRight size={17}/></span></button>
          </div>

          <div className="bi-summary-grid">
            <section className="bi-panel bi-stage-panel"><div className="bi-panel-heading"><div><h2>Estado comercial actual</h2><p>{stages.length === 1 ? `${rows.length} ${plural(rows.length, "lead está", "leads están")} en «${stages[0]!.label}».` : `${rows.length} leads distribuidos en ${stages.length} etapas.`}</p></div></div>
              {stages.length ? <><div className="bi-stage-chart" style={{ height: Math.max(200, stages.length * 64 + 35) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={stages} layout="vertical" margin={{ top: 2, right: 35, bottom: 5, left: 0 }} accessibilityLayer><CartesianGrid horizontal={false} stroke="#e5e9ef"/><XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 16, fill: "#526071" }} domain={[0, Math.max(...stages.map(s => s.count), 1)]}/><YAxis dataKey="label" type="category" axisLine={false} tickLine={false} width={160} tick={{ fontSize: 16, fill: "#263344" }}/><Tooltip cursor={{ fill: "#f0f3f8" }} contentStyle={{ fontSize: 16, border: "1px solid #cbd3df", borderRadius: 4 }} formatter={value => [value, "Leads"]}/><Bar dataKey="count" maxBarSize={34} radius={[0,3,3,0]} isAnimationActive={false} onClick={(_data, index) => { const entry = stages[index]; if (entry) show(entry.label, entry.rows); }} cursor="pointer">{stages.map((s,i) => <Cell key={s.stage} fill={i === 0 ? "#245bd6" : "#9baac2"}/>)}<LabelList dataKey="count" position="right" style={{ fill: "#18283f", fontSize: 18, fontWeight: 650 }}/></Bar></BarChart></ResponsiveContainer></div><div className="bi-stage-links" aria-label="Explorar etapas">{stages.map(s => <button key={s.stage} onClick={() => show(s.label, s.rows)}>{s.label}<span>{s.count}</span><ArrowRight size={16}/></button>)}</div></> : <Empty title="No hay leads en esta selección" text="Amplía el período o cambia el agente."/>}
              <p className="bi-note">Es una foto del estado actual, no un embudo de conversión histórica.</p>
            </section>

            <section className="bi-panel bi-recent-panel"><div className="bi-panel-heading"><div><h2>Última conversación</h2><p>Del indicador al historial original.</p></div><MessageSquare size={23}/></div>
              {recent ? <><div className="bi-contact-heading"><span className="bi-contact-avatar">{(recent.name ?? "Lead").slice(0,1).toUpperCase()}</span><div><h3>{recent.name ?? "Contacto sin nombre"}</h3><p>{agentName(recent.agent)} · {stageLabel(recent)}</p></div></div><blockquote>{recent.lastMessagePreview || "Sin vista previa del mensaje."}</blockquote><div className="bi-recent-meta"><span>{recent.messageCount !== undefined ? `${recent.messageCount} mensajes registrados` : "Historial disponible"}</span><span>{lastActivity(recent) ? dateTime(new Date(lastActivity(recent)).toISOString()) : "Sin fecha de actividad"}</span></div><button className="bi-primary-button" onClick={() => onOpen(recent.id)}>Ver conversación completa <ArrowRight size={20}/></button></> : <Empty title="Sin conversación registrada" text="Aquí aparecerá la actividad de los leads seleccionados."/>}
            </section>
          </div>
          <div className={"bi-observation " + (overdue.length ? "needs-attention" : "")}><Clock3 size={21}/><div><strong>{overdue.length ? `${overdue.length} ${plural(overdue.length, "seguimiento vencido", "seguimientos vencidos")}` : "Seguimientos sin vencimientos registrados"}</strong><p>{overdue.length ? "Revisa qué se acordó antes de retomar el contacto." : `${attention.length} ${plural(attention.length, "lead requiere", "leads requieren")} revisión según el último mensaje o la fecha de seguimiento.`}</p></div><button className="bi-text-button" onClick={() => setTab("followups")}>Ver seguimientos <ArrowRight size={18}/></button></div>
        </>}

        {tab === "acquisition" && <>
          <div className="bi-section-intro"><h2>Captación de leads</h2><p><strong>{rows.length} registros</strong> en la selección actual · {previous.length} en el período anterior de igual duración.</p></div>
          <section className="bi-panel"><div className="bi-panel-heading"><div><h2>Nuevos contactos por fecha de ingreso</h2><p>{period > 7 ? "Agrupación en bloques de 7 días; el último bloque puede ser parcial." : "Registros diarios. El día actual todavía está en curso."}</p></div></div><div className="bi-legend"><span><i/>Tami · Ventas</span><span><i/>Milo · Vivienda</span></div><div className="bi-acquisition-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={trend} margin={{ top: 20, right: 25, left: 0, bottom: 15 }} accessibilityLayer><CartesianGrid vertical={false} stroke="#e2e7ee"/><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#526071", fontSize: 16 }} minTickGap={28} dy={10}/><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#526071", fontSize: 16 }}/><Tooltip cursor={{ fill: "#f0f3f8" }} contentStyle={{ fontSize: 16, borderRadius: 4, border: "1px solid #cbd3df" }} labelFormatter={(_label, payload) => String(payload[0]?.payload?.range ?? "")}/><Bar dataKey="Tami" fill="#245bd6" maxBarSize={48} radius={[3,3,0,0]} isAnimationActive={false}/><Bar dataKey="Milo" fill="#94a6c5" maxBarSize={48} radius={[3,3,0,0]} isAnimationActive={false}/></BarChart></ResponsiveContainer></div></section>
          <section className="bi-panel bi-table-panel"><h2>Desglose por agente</h2><div className="bi-table-wrap"><table><thead><tr><th>Agente</th><th>Leads</th><th>Calificados o avanzados</th><th>Ver detalle</th></tr></thead><tbody>{(["sales", "housing"] as const).filter(a => agent === "all" || agent === a).map(a => <tr key={a}><td>{agentName(a)} · {a === "sales" ? "Ventas" : "Vivienda"}</td><td className="bi-number">{rows.filter(c => c.agent === a).length}</td><td className="bi-number">{qualified.filter(c => c.agent === a).length}</td><td><button className="bi-text-button" onClick={() => show(`Leads de ${agentName(a)}`, rows.filter(c => c.agent === a))}>Abrir <ArrowRight size={16}/></button></td></tr>)}</tbody></table></div></section>
        </>}

        {tab === "followups" && <>
          <div className="bi-section-intro"><h2>Qué necesita atención</h2><p>Seguimientos registrados y conversaciones cuyo último mensaje proviene del lead.</p></div>
          <div className="bi-segmented"><button aria-pressed={followupFilter === "attention"} onClick={() => setFollowupFilter("attention")}>Por revisar <strong>{attention.length}</strong></button><button aria-pressed={followupFilter === "upcoming"} onClick={() => setFollowupFilter("upcoming")}>Próximos seguimientos <strong>{upcoming.length}</strong></button></div>
          <section className="bi-panel bi-followups">{actionRows.length ? actionRows.map(c => <article key={c.id}><div><h3>{c.name ?? "Contacto sin nombre"}</h3><p>{agentName(c.agent)} · {followupFilter === "attention" ? attentionReason(c, updated)?.label : dateTime(c.nextFollowUpAt)}</p><blockquote>{c.lastMessagePreview || "Sin vista previa del mensaje."}</blockquote></div><button className="bi-button" onClick={() => onOpen(c.id)}>Revisar conversación <ArrowRight size={18}/></button></article>) : <Empty title={followupFilter === "attention" ? "Sin pendientes registrados" : "No hay próximos seguimientos"} text="No se encontraron registros para los leads del período y agente seleccionados."/>}</section>
          <p className="bi-note">Un mensaje entrante más reciente sugiere revisión; no demuestra por sí solo abandono o pérdida del lead.</p>
        </>}

        {tab === "appointments" && <>
          <div className="bi-section-intro"><h2>Citas registradas</h2><p>Solicitudes, confirmaciones y resultados de la tabla <code>appointments</code>.</p></div>
          {appointmentError ? <div className="bi-error" role="alert"><strong>Citas no disponibles</strong><p>{appointmentError} No se muestra cero porque no se pudo verificar.</p><button className="bi-button" onClick={() => void load()}>Reintentar</button></div> : <section className="bi-panel bi-table-panel"><div className="bi-appointment-summary"><span><strong>{cohortAppointments.length}</strong> citas registradas</span><span><strong>{confirmedVisits.length}</strong> visitas confirmadas</span></div>{cohortAppointments.length ? <div className="bi-table-wrap"><table><thead><tr><th>Lead</th><th>Tipo</th><th>Fecha solicitada</th><th>Estado</th><th>Contexto</th></tr></thead><tbody>{cohortAppointments.map(a => { const contact = rows.find(c => c.id === a.contactId); return <tr key={a.id}><td><strong>{contact?.name ?? "Contacto sin nombre"}</strong>{a.notes && <p className="bi-table-note">{a.notes}</p>}</td><td>{a.kind === "visit" ? "Visita" : "Llamada"}</td><td>{dateTime(a.requestedFor)}</td><td><span className={"bi-appointment-status status-" + a.status}>{appointmentLabels[a.status]}</span></td><td><button className="bi-text-button" onClick={() => onOpen(a.contactId)}>Conversación <ArrowRight size={17}/></button></td></tr>; })}</tbody></table></div> : <Empty icon="calendar" title="Todavía no hay citas registradas" text="Las conversaciones no se convierten automáticamente en citas. Cuando el agente registre una solicitud o confirmación para estos leads, aparecerá aquí."/>}<p className="bi-note">Se muestran citas de los leads incluidos por fecha de ingreso y agente, independientemente de la fecha de la cita. Una solicitud no es una visita confirmada.</p></section>}
        </>}
      </section>}
      <footer className="bi-footer"><span><Database size={16}/>{USE_MOCK ? "Demostración" : "Supabase"} · {shortDate(model.start)} – {shortDate(model.end - 1)} · Hora de Lima<br/><span className="bi-freshness">{loaded ? `Última consulta: ${new Date(updated).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" })}` : "Esperando consulta"} · Actualización cada 30 s</span></span><button className="bi-text-button" onClick={() => setDefinitions(true)}><CircleHelp size={18}/> Fuentes y definiciones</button></footer>
    </div>

    <Dialog.Root open={Boolean(drawer)} onOpenChange={open => { if (!open) setDrawer(null); }}><Dialog.Portal><Dialog.Overlay className="bi-overlay"/><Dialog.Content className="bi-drawer"><Dialog.Close className="bi-close" aria-label="Cerrar detalle"><X size={24}/></Dialog.Close><Dialog.Title>{drawer?.title}</Dialog.Title><Dialog.Description>{drawer?.description}</Dialog.Description><p className="bi-drawer-count">{drawer?.rows.length ?? 0} contactos encontrados</p><div className="bi-drawer-leads">{drawer?.rows.map(c => <article key={c.id}><h3>{c.name ?? "Contacto sin nombre"}</h3><p>{agentName(c.agent)} · {stageLabel(c)}</p>{c.sourceStage && <p className="bi-raw-stage">Estado de origen: <code>{c.sourceStage}</code></p>}<blockquote>{c.lastMessagePreview || "Sin mensajes registrados."}</blockquote>{(textValue(c.profile.notes) || textValue(c.profile.objections)) && <p className="bi-context-note"><strong>Contexto registrado</strong>{textValue(c.profile.notes) ?? textValue(c.profile.objections)}</p>}<button className="bi-primary-button" onClick={() => { setDrawer(null); onOpen(c.id); }}>Abrir conversación <ArrowRight size={19}/></button></article>)}{!drawer?.rows.length && <Empty title="No hay contactos" text="Cambia los filtros o selecciona otra etapa."/>}</div></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={definitions} onOpenChange={setDefinitions}><Dialog.Portal><Dialog.Overlay className="bi-overlay"/><Dialog.Content className="bi-definitions"><Dialog.Close className="bi-close" aria-label="Cerrar definiciones"><X size={24}/></Dialog.Close><Dialog.Title>Fuentes y definiciones</Dialog.Title><Dialog.Description>El filtro global selecciona leads por fecha de creación y agente. No limita la fecha de sus mensajes o citas.</Dialog.Description><dl><dt>Leads registrados</dt><dd>Contactos únicos de la selección. Calificados o avanzados incluye las etapas calificado, visita agendada y ganado; un estado cerrado no se interpreta como venta.</dd><dt>Mensajes y conversaciones</dt><dd>Recuento del historial persistido asociado a los leads seleccionados. No es el número de mensajes enviados durante el período.</dd><dt>Visitas confirmadas</dt><dd>Registros de <code>appointments</code> con tipo visita y estado confirmado. Llamadas, solicitudes, cancelaciones y citas completadas no se cuentan en este indicador.</dd><dt>Seguimientos</dt><dd>Un seguimiento vencido tiene una fecha pendiente anterior a la consulta. También se señalan contactos cuyo último mensaje entrante es posterior al saliente; no se infiere abandono.</dd><dt>Etapas y captación</dt><dd>Las etapas muestran el estado actual. La captación usa la fecha de ingreso, con días en hora de Lima y semanas de siete días desde el inicio del filtro. El último bloque puede estar incompleto.</dd><dt>Fuente y límites</dt><dd>{USE_MOCK ? "Esta vista usa registros de demostración." : "Lectura del CRM en Supabase: contacts, conversations, messages y appointments. Las credenciales se mantienen en el servidor."} No se estiman retención, conversión histórica ni ventas sin eventos que las respalden.</dd></dl></Dialog.Content></Dialog.Portal></Dialog.Root>
  </main>;
}

function Empty({ title, text, icon }: { title: string; text: string; icon?: "calendar" }) {
  return <div className="bi-empty">{icon === "calendar" ? <CalendarDays size={35}/> : <Database size={30}/>}<h3>{title}</h3><p>{text}</p></div>;
}
