import { createHmac, timingSafeEqual } from "node:crypto";
import type { DashboardSnapshot } from "./dashboard-data";
import type { Stage, Stats } from "./dashboard/types";
import { normalizeSort, sortContacts } from "./dashboard/sorting.js";

const same = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export function createDashboardHandler(read: () => Promise<DashboardSnapshot>, password: string, secret: string) {
  if (!password || !secret) throw new Error("El dashboard requiere contraseña y secreto de sesión.");
  const sign = (expiry: string) => createHmac("sha256", secret).update(expiry).digest("base64url");
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options":"nosniff" };
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...headers, ...extra } });
  let failedAttempts = 0;
  let nextWindow = Date.now() + 60000;
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const cookieFlags = `HttpOnly; SameSite=Strict; Path=/${url.protocol === "https:" ? "; Secure" : ""}`;
    if (url.pathname === "/api/dashboard/config" && req.method === "GET") return json({ mode:"live", readOnly:true, source:"Supabase" });
    if (req.method !== "GET" && req.headers.get("origin") && req.headers.get("origin") !== url.origin) return json({ error:"Origen no permitido" }, 403);
    if (url.pathname === "/api/login" && req.method === "POST") {
      if (Date.now() > nextWindow) { failedAttempts = 0; nextWindow = Date.now() + 60000; }
      if (failedAttempts >= 10) return json({ error:"Demasiados intentos. Espera un minuto." }, 429);
      let input: unknown;
      try { input = await req.json(); } catch { return json({ error:"Solicitud inválida" }, 400); }
      const supplied = input && typeof input === "object" && !Array.isArray(input) && "password" in input ? input.password : undefined;
      if (typeof supplied !== "string" || !same(supplied, password)) { failedAttempts++; return json({ error:"Contraseña incorrecta" }, 401); }
      failedAttempts = 0;
      const expiry = String(Date.now() + 3600000);
      return json({ ok:true }, 200, { "Set-Cookie":`mensajito_session=${expiry}.${sign(expiry)}; Max-Age=3600; ${cookieFlags}` });
    }
    if (url.pathname === "/api/logout" && req.method === "POST") return json({ ok:true }, 200, { "Set-Cookie":`mensajito_session=; Max-Age=0; ${cookieFlags}` });
    const token = req.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith("mensajito_session="))?.slice("mensajito_session=".length);
    const parts = token?.split(".") ?? [];
    const [expiry = "", signature = ""] = parts;
    if (parts.length !== 2 || !/^\d+$/.test(expiry) || !Number.isSafeInteger(Number(expiry)) || Number(expiry) <= Date.now() || !same(signature, sign(expiry))) return json({ error:"Inicia sesión para consultar los datos" }, 401);
    if (req.method !== "GET") return json({ error:"Conexión de solo lectura. No se modificaron datos ni se enviaron mensajes." }, 403);
    try {
      const snapshot = await read();
      if (url.pathname === "/api/appointments") return json({ items:snapshot.appointments });
      if (url.pathname === "/api/stats") {
        const stats: Stats = { leadsThisMonth:snapshot.contacts.length, byStage:{}, byAgent:{sales:0,housing:0}, followUpsPending:0 };
        for (const c of snapshot.contacts) { stats.byStage[c.stage] = (stats.byStage[c.stage] ?? 0) + 1; stats.byAgent[c.agent]++; }
        for (const detail of snapshot.details.values()) stats.followUpsPending += detail.followUps.filter(f => f.status === "pending").length;
        return json(stats);
      }
      if (url.pathname === "/api/contacts") {
        const query = (url.searchParams.get("q") ?? "").toLocaleLowerCase("es");
        const agent = url.searchParams.get("agent");
        const stage = url.searchParams.get("stage");
        const filtered = snapshot.contacts.filter(c => (!agent || c.agent === agent) && (!stage || (stage === "needs_followup" ? c.nextFollowUpAt && Date.parse(c.nextFollowUpAt) <= Date.now() : c.stage === stage as Stage)) && (!query || [c.name, c.phone, c.lastMessagePreview].some(s => s?.toLocaleLowerCase("es").includes(query))));
        const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 100));
        const sorted = sortContacts(filtered, normalizeSort(url.searchParams.get("sort")));
        return json({ items:sorted.slice(offset, offset + limit), total:filtered.length });
      }
      const match = url.pathname.match(/^\/api\/contacts\/([^/]+)$/);
      if (match) { const detail = snapshot.details.get(match[1]!); return detail ? json(detail) : json({ error:"Contacto no encontrado" }, 404); }
      return json({ error:"Ruta no encontrada" }, 404);
    } catch { return json({ error:"No se pudo consultar la fuente de datos. Inténtalo nuevamente." }, 503); }
  };
}
