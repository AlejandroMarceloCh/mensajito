import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Overview } from "./overview.jsx";
import { LayoutDashboard, Inbox, LogOut } from "lucide-react";
import "./live-inbox.css";
import type { AgentKind, ContactDetail, ContactListItem, Stage, Stats } from "./types";
import { STAGES, STAGE_TRANSITIONS } from "./types";
import {
  USE_MOCK,
  READ_ONLY,
  initializeDashboard,
  cancelFollowUp,
  getContact,
  getStats,
  hasMockSession,
  listContacts,
  login,
  logout,
  patchContact,
  reply,
  scheduleFollowUp,
} from "./api";

const stageLabels: Record<Stage, string> = {
  new: "Nuevo",
  qualifying: "En evaluación",
  qualified: "Calificado",
  visit_scheduled: "Visita agendada",
  won: "Ganado",
  lost: "Perdido",
  nurture: "Seguimiento",
  appointment_requested: "Cita solicitada",
  handed_off: "Derivado a asesor",
  closed: "Cerrado",
  unknown: "Sin etapa registrada",
};

const agentLabels: Record<AgentKind, { name: string; purpose: string }> = {
  sales: { name: "Tami", purpose: "Ventas" },
  housing: { name: "Milo", purpose: "Vivienda" },
};

type IconName =
  | "arrow-left"
  | "building"
  | "calendar"
  | "check"
  | "chevron"
  | "clock"
  | "inbox"
  | "logout"
  | "message"
  | "search"
  | "send"
  | "spark"
  | "user";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    "arrow-left": <><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></>,
    building: <><path d="M3 21h18"/><path d="M6 21V5l6-3 6 3v16"/><path d="M9 9h1"/><path d="M14 9h1"/><path d="M9 13h1"/><path d="M14 13h1"/><path d="M9 17h6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    inbox: <><path d="M4 5h16l1 14H3L4 5Z"/><path d="M3.5 14h5l1.5 2h4l1.5-2h5"/></>,
    logout: <><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></>,
    message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></>,
    spark: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z"/><path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function initials(contact: ContactListItem | ContactDetail["contact"]) {
  const label = contact.name ?? contact.username ?? "Lead";
  return label.split(" ").slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function relativeTime(value: string | null) {
  if (!value) return "Sin actividad";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  if (minutes < 1440) return `Hace ${Math.floor(minutes / 60)} h`;
  const days = Math.floor(minutes / 1440);
  return `Hace ${days} ${days === 1 ? "día" : "días"}`;
}

function formatDate(value: string | null, withTime = true) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Sin fecha registrada";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

function money(value: unknown) {
  return typeof value === "number"
    ? new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(value)
    : null;
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(password);
      onSuccess();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-story" aria-label="Presentación">
        <div className="brand brand--light"><span className="brand-mark"><Icon name="message" size={19}/></span><span>mensajito</span></div>
        <div className="story-copy">
          <p className="eyebrow eyebrow--light">Centro de leads inmobiliarios</p>
          <h1>Cada conversación, un paso más cerca del hogar correcto.</h1>
          <p>Prioriza oportunidades, entiende el contexto y acompaña a tus leads sin perder el hilo.</p>
        </div>
        <div className="story-status"><span className="live-dot"/> {USE_MOCK ? "Entorno de demostración" : "Historial de WhatsApp · acceso privado"}</div>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="mobile-brand brand"><span className="brand-mark"><Icon name="message" size={19}/></span><span>mensajito</span></div>
          <p className="eyebrow">Acceso del equipo</p>
          <h2>Bienvenido de vuelta</h2>
          <p className="muted">Ingresa la contraseña del equipo para consultar las conversaciones{READ_ONLY ? " en modo solo lectura" : ""}.</p>
          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••••" autoComplete="current-password" autoFocus />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button--primary button--wide" disabled={loading}>{loading ? "Ingresando…" : "Ingresar al CRM"}</button>
          {USE_MOCK && <p className="demo-note"><span className="demo-pill">DEMO</span> Usa cualquier contraseña de 4 caracteres.</p>}
        </form>
      </section>
    </main>
  );
}

function StagePill({ stage }: { stage: Stage }) {
  return <span className={`stage stage--${stage}`}><span className="stage-dot"/>{stageLabels[stage]}</span>;
}

function Score({ value }: { value: number | null }) {
  if (!value) return <span className="score score--empty">Sin score</span>;
  return <span className="score" aria-label={`Intención ${value} de 5`}><Icon name="spark" size={13}/> {value}/5</span>;
}

function App() {
  const [view, setView] = useState<"overview" | "inbox">("overview");
  const [authenticated, setAuthenticated] = useState(() =>
    USE_MOCK ? hasMockSession() : false,
  );
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [agent, setAgent] = useState<AgentKind | "all">("all");
  const [stage, setStage] = useState<Stage | "needs_followup" | "all">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const listRequest = useRef(0);

  async function refresh(silent = false) {
    if (!authenticated) return;
    const requestId = ++listRequest.current;
    if (!silent) setLoading(true);
    try {
      const [result, nextStats] = await Promise.all([
        listContacts({
          agent: agent === "all" ? undefined : agent,
          stage: stage === "all" ? undefined : stage,
          q: query || undefined,
        }),
        getStats(),
      ]);
      if (requestId !== listRequest.current) return;
      setContacts(result.items);
      setStats(nextStats);
      setSelectedId((current) => current && result.items.some((item) => item.id === current)
        ? current
        : window.matchMedia("(max-width: 860px)").matches ? null : result.items[0]?.id ?? null);
    } catch (reason) {
      if (requestId !== listRequest.current) return;
      setToast(reason instanceof Error ? reason.message : "No pudimos cargar los leads");
    } finally {
      if (requestId === listRequest.current) setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 220);
    const polling = setInterval(() => void refresh(true), 10_000);
    return () => { ++listRequest.current; clearTimeout(timer); clearInterval(polling); };
  }, [authenticated, agent, stage, query]);

  useEffect(() => {
    if (!authenticated || !selectedId) { setDetail(null); return; }
    let active = true;
    let pending = false;
    setDetail(null);
    setDetailLoading(true);
    async function refreshDetail() {
      if (pending) return;
      pending = true;
      try {
        const nextDetail = await getContact(selectedId!);
        if (active) setDetail(nextDetail);
      } catch (reason) {
        if (active) setToast(reason instanceof Error ? reason.message : "No pudimos actualizar la conversación");
      } finally {
        pending = false;
        if (active) setDetailLoading(false);
      }
    }
    void refreshDetail();
    const polling = setInterval(() => void refreshDetail(), 10_000);
    return () => { active = false; clearInterval(polling); };
  }, [selectedId, authenticated]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  async function updateStage(nextStage: Stage) {
    if (!detail || READ_ONLY) return;
    try {
      const updated = await patchContact(detail.contact.id, { stage: nextStage });
      setDetail({ ...detail, contact: updated });
      await refresh(true);
      setToast(`Lead movido a “${stageLabels[nextStage]}”`);
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "No pudimos cambiar la etapa");
    }
  }

  async function sendReply(body: string) {
    if (!detail || READ_ONLY) return;
    try {
      const message = await reply(detail.contact.id, body);
      setDetail({ ...detail, messages: [...detail.messages, message] });
      await refresh(true);
      setToast("Respuesta enviada");
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "No pudimos enviar la respuesta");
    }
  }

  async function addFollowUp(dueAt: string, note: string) {
    if (!detail || READ_ONLY) return;
    try {
      const followUp = await scheduleFollowUp(detail.contact.id, dueAt, note);
      setDetail({ ...detail, contact: { ...detail.contact, nextFollowUpAt: dueAt }, followUps: [...detail.followUps, followUp] });
      await refresh(true);
      setToast("Seguimiento programado");
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "No pudimos programar el seguimiento");
    }
  }

  async function removeFollowUp(id: string) {
    if (!detail || READ_ONLY) return;
    try {
      await cancelFollowUp(id);
      setDetail({
        ...detail,
        contact: { ...detail.contact, nextFollowUpAt: null },
        followUps: detail.followUps.map((item) => item.id === id ? { ...item, status: "cancelled" } : item),
      });
      await refresh(true);
      setToast("Seguimiento cancelado");
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "No pudimos cancelar el seguimiento");
    }
  }

  async function signOut() {
    await logout();
    setAuthenticated(false);
    setContacts([]);
    setDetail(null);
    setSelectedId(null);
    setStats(null);
  }

  if (!authenticated) return <LoginScreen onSuccess={() => setAuthenticated(true)} />;

  const followUpCount = stats?.followUpsPending ?? 0;
  const connectedAgents = (["sales", "housing"] as const).filter((kind) => (stats?.byAgent[kind] ?? 0) > 0);
  return (
    <div className={`app-shell ${view === "inbox" && selectedId ? "has-detail" : ""}`}>
      <aside className="sidebar">
        <div className="brand brand--light"><span className="brand-mark"><Icon name="message" size={19}/></span><span>mensajito</span></div>
        <nav className="sidebar-nav" aria-label="Navegación principal">
          <button title="Dashboard" aria-label="Dashboard" aria-current={view === "overview" ? "page" : undefined} className={`nav-item ${view === "overview" ? "nav-item--active" : ""}`} onClick={() => setView("overview")}><LayoutDashboard size={18}/><span>Dashboard</span></button>
          <button title="Bandeja" aria-label="Bandeja" aria-current={view === "inbox" ? "page" : undefined} className={`nav-item ${view === "inbox" ? "nav-item--active" : ""}`} onClick={() => setView("inbox")}><Inbox size={18}/> <span>Bandeja</span><b>{stats?.leadsThisMonth ?? contacts.length}</b></button>
          <button className="nav-item" disabled><Icon name="building"/> <span>Proyectos</span><em>Pronto</em></button>
        </nav>
        <div className="sidebar-agent-card">
          <span className="live-dot"/><div><strong>{USE_MOCK ? "Datos de demostración" : "Supabase · solo lectura"}</strong><small>{connectedAgents.length ? connectedAgents.map((kind) => agentLabels[kind].name).join(" · ") : "Sin agentes con registros"}</small></div>
        </div>
        <button className="nav-item logout" onClick={() => void signOut()}><Icon name="logout"/><span>Cerrar sesión</span></button>
      </aside>

      {view === "overview" ? <Overview onOpen={(id: string) => { setAgent("all"); setStage("all"); setQuery(""); setSelectedId(id); setView("inbox"); }} /> : <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Operación comercial</p>
            <h1>Conversaciones</h1>
          </div>
          <div className="topbar-actions">
            <span className={`environment ${USE_MOCK ? "" : "environment--live"}`}><span/> {USE_MOCK ? "Datos demo" : "Supabase · solo lectura"}</span>
          </div>
        </header>

        <section className="stats-strip" aria-label="Resumen de conversaciones">
          <div><span>Leads registrados</span><strong>{stats?.leadsThisMonth ?? "—"}</strong></div>
          <div><span>Resultados del filtro</span><strong>{contacts.length}</strong></div>
          <button className={stage === "needs_followup" ? "is-active" : ""} onClick={() => setStage(stage === "needs_followup" ? "all" : "needs_followup")}><span>Seguimientos pendientes</span><strong>{followUpCount}</strong><Icon name="chevron" size={16}/></button>
          <div className="coverage"><span>Ventana de WhatsApp</span><strong>{contacts.filter((item) => item.sessionOpen).length}<small> / {contacts.length} disponibles</small></strong></div>
        </section>

        <section className="inbox-layout">
          <div className="lead-pane">
            <div className="lead-toolbar">
              <div className="agent-tabs" role="tablist" aria-label="Agente">
                {(["all", "sales", "housing"] as const).map((value) => (
                  <button key={value} role="tab" aria-selected={agent === value} className={agent === value ? "active" : ""} onClick={() => setAgent(value)}>
                    {value === "all" ? "Todos" : agentLabels[value].name}
                    <span>{value === "all" ? stats?.leadsThisMonth : stats?.byAgent[value]}</span>
                  </button>
                ))}
              </div>
              <div className="filter-row">
                <label className="search-box"><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lead o mensaje" aria-label="Buscar lead"/></label>
                <select value={stage} onChange={(event) => setStage(event.target.value as Stage | "needs_followup" | "all")} aria-label="Filtrar por etapa">
                  <option value="all">Todas las etapas</option>
                  <option value="needs_followup">Necesita seguimiento</option>
                  {STAGES.map((value) => <option key={value} value={value}>{stageLabels[value]}</option>)}
                </select>
              </div>
              <div className="list-heading"><span>{contacts.length} {contacts.length === 1 ? "lead" : "leads"}</span><small>Actualiza cada 10 s</small></div>
            </div>

            <div className="lead-list" aria-live="polite">
              {loading ? <LeadListSkeleton/> : contacts.length === 0 ? <EmptyState filtered={Boolean(query || stage !== "all" || agent !== "all")} /> : contacts.map((contact) => (
                <button key={contact.id} className={`lead-row ${selectedId === contact.id ? "lead-row--active" : ""}`} onClick={() => setSelectedId(contact.id)}>
                  <span className={`avatar avatar--${contact.agent}`}>{initials(contact)}</span>
                  <span className="lead-content">
                    <span className="lead-line"><strong>{contact.name ?? contact.phone}</strong><time>{relativeTime(contact.lastInboundAt)}</time></span>
                    <span className="lead-meta"><StagePill stage={contact.stage}/><Score value={contact.intentScore}/>{contact.nextFollowUpAt && new Date(contact.nextFollowUpAt) <= new Date() && <span className="overdue"><Icon name="clock" size={12}/> Vencido</span>}</span>
                    <span className="preview">{contact.lastMessagePreview}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="detail-pane">
            {detailLoading ? <DetailSkeleton/> : detail ? (
              <LeadDetail
                key={detail.contact.id}
                detail={detail}
                onBack={() => setSelectedId(null)}
                onStage={updateStage}
                onReply={sendReply}
                onFollowUp={addFollowUp}
                onCancelFollowUp={removeFollowUp}
              />
            ) : <NoSelection/>}
          </div>
        </section>
      </main>}
      <nav className="mobile-app-nav" aria-label="Navegación móvil">
        <button aria-current={view === "overview" ? "page" : undefined} onClick={() => setView("overview")}><LayoutDashboard size={19}/>Dashboard</button>
        <button aria-current={view === "inbox" ? "page" : undefined} onClick={() => { setSelectedId(null); setView("inbox"); }}><Inbox size={19}/>Bandeja</button>
        <button onClick={() => void signOut()}><LogOut size={19}/>Salir</button>
      </nav>
      {toast && <div className="toast" role="status"><Icon name="check" size={16}/>{toast}</div>}
    </div>
  );
}

function LeadDetail({
  detail,
  onBack,
  onStage,
  onReply,
  onFollowUp,
  onCancelFollowUp,
}: {
  detail: ContactDetail;
  onBack: () => void;
  onStage: (stage: Stage) => Promise<void>;
  onReply: (body: string) => Promise<void>;
  onFollowUp: (dueAt: string, note: string) => Promise<void>;
  onCancelFollowUp: (id: string) => Promise<void>;
}) {
  const { contact, messages, followUps } = detail;
  const appointments = detail.appointments ?? [];
  const [replyBody, setReplyBody] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [sending, setSending] = useState(false);
  const [panel, setPanel] = useState<"profile" | "followup">("profile");
  const allowedStages = useMemo(() => [contact.stage, ...STAGE_TRANSITIONS[contact.stage]], [contact.stage]);
  const activeFollowUp = followUps.find((item) => item.status === "pending");
  const profileFields: Array<[string, string | number]> = [
    ["Distrito", contact.profile.district],
    ["Proyecto", contact.profile.projectInterest],
    ["Dormitorios", contact.profile.bedrooms],
    ["Presupuesto", money(contact.profile.budgetMax)],
    ["Ingreso mensual", money(contact.profile.monthlyIncome)],
    ["Cuota inicial", money(contact.profile.downPayment)],
    ["Programa", contact.profile.programInterest],
  ].filter((entry): entry is [string, string | number] => entry[1] !== null && entry[1] !== undefined);
  const objections = typeof contact.profile.objections === "string" ? contact.profile.objections : null;
  const notes = typeof contact.profile.notes === "string" ? contact.profile.notes : null;

  async function submitReply(event: FormEvent) {
    event.preventDefault();
    if (!replyBody.trim() || READ_ONLY) return;
    setSending(true);
    try { await onReply(replyBody); setReplyBody(""); } finally { setSending(false); }
  }

  async function submitFollowUp(event: FormEvent) {
    event.preventDefault();
    if (!followUpDate || READ_ONLY) return;
    setSending(true);
    try {
      await onFollowUp(new Date(followUpDate).toISOString(), followUpNote);
      setFollowUpDate(""); setFollowUpNote(""); setPanel("profile");
    } finally { setSending(false); }
  }

  return (
    <article className="lead-detail">
      <header className="detail-header">
        <button className="icon-button mobile-back" onClick={onBack} aria-label="Volver a la lista"><Icon name="arrow-left"/></button>
        <span className={`avatar avatar--large avatar--${contact.agent}`}>{initials(contact)}</span>
        <div className="identity">
          <div className="identity-name"><h2>{contact.name ?? "Lead sin nombre"}</h2><span className={`agent-tag agent-tag--${contact.agent}`}>{agentLabels[contact.agent].name} · {agentLabels[contact.agent].purpose}</span></div>
          <p>{contact.phone}{contact.email ? ` · ${contact.email}` : ""}</p>
        </div>
        <select className="stage-select" value={contact.stage} onChange={(event) => void onStage(event.target.value as Stage)} disabled={READ_ONLY} aria-label={READ_ONLY ? "Etapa registrada (solo lectura)" : "Cambiar etapa"} title={READ_ONLY ? "Etapa registrada en Supabase. No se modifica desde esta vista." : undefined}>
          {STAGES.map((value) => <option key={value} value={value} disabled={!allowedStages.includes(value)}>{stageLabels[value]}</option>)}
        </select>
      </header>

      <div className="detail-body">
        <section className="conversation-panel">
          <div className="section-title"><div><span>Historial de WhatsApp</span><small>{messages.length} mensajes registrados · hora de Lima</small></div><span className={contact.sessionOpen ? "session session--open" : "session session--closed"}><span/>{contact.sessionOpen ? "Ventana abierta" : "Ventana cerrada"}</span></div>
          <div className="timeline" role="log" aria-label="Historial de mensajes" aria-live="polite">
            {messages.length === 0 ? <p className="timeline-empty">Todavía no hay mensajes en esta conversación.</p> : messages.map((message, index) => {
              const previous = messages[index - 1];
              const showDay = !previous || formatDate(previous.createdAt, false) !== formatDate(message.createdAt, false);
              return <div key={message.id}>
                {showDay && <div className="day-separator"><span>{formatDate(message.createdAt, false)}</span></div>}
                <div className={`message message--${message.role}`}>
                  <div className="message-author">{message.role === "human" ? contact.name?.split(" ")[0] ?? "Lead" : message.role === "ai" ? agentLabels[contact.agent].name : message.role === "outbound" ? "Saliente" : "Asesor"}</div>
                  <p>{message.content}</p>
                  <time>{formatDate(message.createdAt)}</time>
                </div>
              </div>;
            })}
          </div>
          {READ_ONLY ? <div className="read-only-notice" role="note"><Icon name="message" size={19}/><div><strong>Historial conectado, sin modificar conversaciones</strong><p>Se actualiza cada 10 segundos. Esta vista no envía mensajes ni cambia etapas.</p></div></div> : <form className="composer" onSubmit={submitReply}>
            {!contact.sessionOpen && <div className="session-warning"><Icon name="clock" size={16}/><span>La ventana de 24 h terminó. Usa una plantilla aprobada desde Seguimiento.</span></div>}
            <textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder={contact.sessionOpen ? "Escribe una respuesta como asesor…" : "Respuesta directa no disponible"} disabled={!contact.sessionOpen || sending} maxLength={1000} rows={2}/>
            <div className="composer-actions"><span>{replyBody.length}/1000</span><button className="button button--primary button--compact" disabled={!replyBody.trim() || !contact.sessionOpen || sending}><span>Enviar</span><Icon name="send" size={16}/></button></div>
          </form>}
        </section>

        <aside className="context-panel">
          <div className="context-tabs">
            <button className={panel === "profile" ? "active" : ""} onClick={() => setPanel("profile")}>Perfil</button>
            <button className={panel === "followup" ? "active" : ""} onClick={() => setPanel("followup")}>Seguimiento{activeFollowUp && <span/>}</button>
          </div>
          {panel === "profile" ? <>
            <section className="context-section">
              <h3>Calificación</h3>
              <div className="intent-block"><div><span>Intención de compra</span><strong>{contact.intentScore ? `${contact.intentScore}/5` : "Sin evaluar"}</strong></div><div className="meter"><span style={{ width: `${(contact.intentScore ?? 0) * 20}%` }}/></div></div>
              <dl className="profile-grid">
                {profileFields.length ? profileFields.map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{String(value)}</dd></div>) : <p className="muted">No hay datos de calificación registrados para este lead.</p>}
              </dl>
            </section>
            {(objections || notes) && <section className="context-section note-section">
              <h3>Contexto comercial</h3>
              {objections && <div><span>Objeción</span><p>{objections}</p></div>}
              {notes && <div><span>Nota</span><p>{notes}</p></div>}
            </section>}
            <section className="context-section appointment-section">
              <h3>Citas registradas <span>{appointments.length}</span></h3>
              {appointments.length === 0 ? <p className="muted">No hay citas guardadas para este lead. Una propuesta en el chat no equivale a una cita confirmada.</p> : <ol className="appointment-list">{appointments.map((appointment) => <li key={appointment.id}>
                <div className="appointment-title"><strong>{appointment.kind === "visit" ? "Visita" : "Llamada"}</strong><span className={`appointment-status appointment-status--${appointment.status}`}>{{ requested: "Solicitada", confirmed: "Confirmada", cancelled: "Cancelada", completed: "Completada" }[appointment.status]}</span></div>
                <time>{formatDate(appointment.requestedFor)}</time>
                {appointment.notes && <p>{appointment.notes}</p>}
              </li>)}</ol>}
            </section>
            <section className="context-section assignment"><h3>Responsable</h3><div className="assignee"><span className="avatar avatar--tiny"><Icon name="user" size={14}/></span><div><strong>{contact.assignedTo ?? "Sin asignar"}</strong><small>Última actividad {relativeTime(contact.updatedAt).toLowerCase()}</small></div></div></section>
            {!READ_ONLY && contact.stage !== "lost" && contact.stage !== "won" && <button className="danger-link" onClick={() => void onStage("lost")}>Marcar oportunidad como perdida</button>}
          </> : <section className="context-section followup-section">
            <h3>Próximo contacto</h3>
            {activeFollowUp ? <div className={`followup-card ${new Date(activeFollowUp.dueAt) <= new Date() ? "followup-card--overdue" : ""}`}>
              <span className="followup-icon"><Icon name="calendar"/></span><div><strong>{formatDate(activeFollowUp.dueAt)}</strong><p>{activeFollowUp.note ?? "Sin nota"}</p>{!READ_ONLY && <button onClick={() => void onCancelFollowUp(activeFollowUp.id)}>Cancelar seguimiento</button>}</div>
            </div> : <p className="muted">No hay seguimientos pendientes para este lead.</p>}
            {READ_ONLY ? <p className="read-only-context">Los seguimientos se consultan desde Supabase. Programarlos o cancelarlos no está habilitado en esta vista.</p> : <form className="followup-form" onSubmit={submitFollowUp}>
              <label htmlFor="followup-date">Fecha y hora</label><input id="followup-date" type="datetime-local" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} min={new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 16)} required/>
              <label htmlFor="followup-note">Nota para el equipo</label><textarea id="followup-note" value={followUpNote} onChange={(event) => setFollowUpNote(event.target.value)} placeholder="Ej. Enviar requisitos y confirmar llamada" rows={3}/>
              <button className="button button--primary button--wide" disabled={!followUpDate || sending}>Programar seguimiento</button>
              {!contact.sessionOpen && <small className="template-hint">Al enviarse, deberá usar una plantilla aprobada por Meta.</small>}
            </form>}
          </section>}
        </aside>
      </div>
    </article>
  );
}

function LeadListSkeleton() {
  return <>{[1,2,3,4].map((item) => <div className="lead-row skeleton-row" key={item}><span className="skeleton skeleton-avatar"/><span className="lead-content"><span className="skeleton skeleton-line"/><span className="skeleton skeleton-line skeleton-line--short"/><span className="skeleton skeleton-line"/></span></div>)}</>;
}

function DetailSkeleton() {
  return <div className="detail-skeleton"><div className="skeleton skeleton-title"/><div className="skeleton skeleton-card"/><div className="skeleton skeleton-card skeleton-card--short"/></div>;
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return <div className="empty-state"><span><Icon name={filtered ? "search" : "inbox"} size={24}/></span><h3>{filtered ? "No encontramos coincidencias" : "Aún no hay leads"}</h3><p>{filtered ? "Prueba quitando un filtro o usando otro término." : "Cuando alguien escriba al WhatsApp aparecerá aquí."}</p></div>;
}

function NoSelection() {
  return <div className="no-selection"><span><Icon name="message" size={26}/></span><h3>Selecciona una conversación</h3><p>Abre un lead para ver su contexto y continuar la atención.</p></div>;
}

const root = document.getElementById("root");
if (!root) throw new Error("No se encontró el contenedor del dashboard");

const rootElement = root as HTMLElement & { __mensajitoRoot?: Root };
const reactRoot = rootElement.__mensajitoRoot ?? createRoot(rootElement);
rootElement.__mensajitoRoot = reactRoot;
reactRoot.render(<main className="startup-state" aria-busy="true"><span className="eyebrow">Mensajito</span><h1>Conectando el dashboard…</h1><p>Comprobando la fuente de datos.</p></main>);
void initializeDashboard().then(() => reactRoot.render(<App/>)).catch(() => {
  reactRoot.render(<main className="startup-state" role="alert"><span className="eyebrow">Conexión no disponible</span><h1>No pudimos abrir el dashboard.</h1><p>No se mostraron datos ficticios. Comprueba que el servidor del dashboard esté disponible y vuelve a intentarlo.</p><button className="button button--primary" onClick={() => window.location.reload()}>Volver a intentar</button></main>);
});
