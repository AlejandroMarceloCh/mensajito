import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createDashboardHandler } from "./dashboard-http";
import { mapSnapshot, type DashboardSnapshot } from "./dashboard-data";

const password = "fixture-password-only";
const secret = "fixture-session-signing-secret-not-a-real-credential";
const origin = "https://dashboard.invalid";
const snapshot = () => mapSnapshot({
  contacts: [{ id: "a", agent: "sales", name: "Fixture Alpha", phone_number: "test-a", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-09-10T12:00:00Z" }, { id: "b", agent: "housing", name: "Fixture Beta", phone_number: "test-b", created_at: "2026-09-10T12:00:00Z", updated_at: "2026-09-10T12:00:00Z" }],
  conversations: [{ id: "a-conv", contact_id: "a", stage: "qualified", is_active: true, last_message_at: "2026-09-10T12:00:00Z" }],
  messages: [], lead_profiles: [], appointments: [{ id: "apt-a", contact_id: "a", status: "requested", kind: "visit", requested_for: null }],
  follow_ups: [{ id: "f-a", contact_id: "a", status: "pending", scheduled_for: "2000-01-01T00:00:00Z", created_at: "2000-01-01T00:00:00Z" }, { id: "f-b", contact_id: "b", status: "failed", scheduled_for: "2000-01-01T00:00:00Z", created_at: "2000-01-01T00:00:00Z" }],
});
type Handler = ReturnType<typeof createDashboardHandler>;
const request = (path: string, method = "GET", cookie?: string, body?: string, requestOrigin?: string) => new Request(`${origin}${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(requestOrigin ? { origin: requestOrigin } : {}) }, ...(body === undefined ? {} : { body }) });
const handler = (read: () => Promise<DashboardSnapshot> = async () => snapshot()) => createDashboardHandler(read, password, secret);
const login = async (handle: Handler) => handle(request("/api/login", "POST", undefined, JSON.stringify({ password }), origin));
const session = async (handle: Handler) => (await login(handle)).headers.get("set-cookie")!.split(";")[0]!;
const signed = (expiry: number) => `mensajito_session=${expiry}.${createHmac("sha256", secret).update(String(expiry)).digest("base64url")}`;

describe("live dashboard HTTP guardrails", () => {
  test("requires nonempty authentication configuration", () => {
    expect(() => createDashboardHandler(async () => snapshot(), "", secret)).toThrow();
    expect(() => createDashboardHandler(async () => snapshot(), password, "")).toThrow();
  });

  test("exposes only safe connection metadata before login", async () => {
    const response = await handler()(request("/api/dashboard/config"));
    expect(await response.json()).toEqual({ mode: "live", readOnly: true, source: "Supabase" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("protects contacts, individual history, stats and appointments without reading the database", async () => {
    let reads = 0;
    const handle = handler(async () => { reads++; return snapshot(); });
    for (const path of ["/api/contacts", "/api/contacts/a", "/api/stats", "/api/appointments"]) expect((await handle(request(path))).status).toBe(401);
    expect(reads).toBe(0);
  });

  test("rejects wrong password and unexpected JSON values without issuing a cookie", async () => {
    const handle = handler();
    for (const body of [{ password: "wrong" }, { password: 123 }, null, [], "password", {}]) {
      const response = await handle(request("/api/login", "POST", undefined, JSON.stringify(body), origin));
      expect(response.status).toBe(401);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  test("returns a controlled error for malformed JSON", async () => {
    expect((await handler()(request("/api/login", "POST", undefined, "{", origin))).status).toBe(400);
  });

  test("issues an HttpOnly, SameSite Strict, Secure, bounded-life cookie on HTTPS", async () => {
    const response = await login(handler());
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    for (const flag of ["HttpOnly", "SameSite=Strict", "Secure", "Path=/", "Max-Age=3600"]) expect(cookie).toContain(flag);
    expect(cookie).not.toContain(password);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("allows local HTTP login without adding a Secure-only cookie", async () => {
    const response = await handler()(new Request("http://localhost:3000/api/login", { method: "POST", body: JSON.stringify({ password }) }));
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  test("rejects expired, tampered, malformed and extra-segment session tokens", async () => {
    const handle = handler();
    const valid = await session(handle);
    for (const cookie of [signed(Date.now() - 1), valid + "tamper", valid + ".extra", "mensajito_session=garbage", "mensajito_session=Infinity.signature", "mensajito_session=1.2", "other=abc"]) {
      expect((await handle(request("/api/contacts", "GET", cookie))).status).toBe(401);
    }
  });

  test("accepts the signed session amid unrelated cookies", async () => {
    const handle = handler();
    expect((await handle(request("/api/contacts", "GET", `other=abc; ${await session(handle)}; another=def`))).status).toBe(200);
  });

  test("clears session cookie on logout", async () => {
    const response = await handler()(request("/api/logout", "POST", undefined, undefined, origin));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("blocks all authenticated mutations without calling the source", async () => {
    let reads = 0;
    const handle = handler(async () => { reads++; return snapshot(); });
    const cookie = await session(handle);
    for (const [path, method] of [["/api/contacts/a", "PATCH"], ["/api/contacts/a/messages", "POST"], ["/api/appointments", "POST"], ["/api/contacts/a", "DELETE"], ["/api/dashboard/config", "POST"]]) expect((await handle(request(path!, method!, cookie, "{}", origin))).status).toBe(403);
    expect(reads).toBe(0);
  });

  test("rejects cross-origin login, logout and mutation requests", async () => {
    const handle = handler();
    const cookie = await session(handle);
    for (const path of ["/api/login", "/api/logout", "/api/contacts/a"]) expect((await handle(request(path, "POST", cookie, JSON.stringify({ password }), "https://untrusted.invalid"))).status).toBe(403);
  });

  test("returns live contacts with global filters, totals, pagination and no unrelated history", async () => {
    const handle = handler();
    const cookie = await session(handle);
    const response = await handle(request("/api/contacts?agent=sales&stage=qualified&q=alpha&limit=1", "GET", cookie));
    const data = await response.json();
    expect(data.total).toBe(1);
    expect(data.items.map((item: { id: string }) => item.id)).toEqual(["a"]);
    expect(data.items[0].messages).toBeUndefined();
    const paged = await (await handle(request("/api/contacts?offset=1&limit=1", "GET", cookie))).json();
    expect(paged.total).toBe(2);
    expect(paged.items[0].id).toBe("b");
  });

  test("needs-followup uses pending tasks, not failed attempts", async () => {
    const handle = handler();
    const body = await (await handle(request("/api/contacts?stage=needs_followup", "GET", await session(handle)))).json();
    expect(body.items.map((item: { id: string }) => item.id)).toEqual(["a"]);
  });

  test("returns registered appointment state without upgrading requested to confirmed", async () => {
    const handle = handler();
    const cookie = await session(handle);
    const all = await (await handle(request("/api/appointments", "GET", cookie))).json();
    expect(all.items[0]).toMatchObject({ contactId: "a", status: "requested", requestedFor: null });
    const detail = await (await handle(request("/api/contacts/a", "GET", cookie))).json();
    expect(detail.appointments[0].id).toBe("apt-a");
    expect((await handle(request("/api/contacts/missing", "GET", cookie))).status).toBe(404);
  });

  test("reports historical count consistently and counts pending followups only", async () => {
    const handle = handler();
    const body = await (await handle(request("/api/stats", "GET", await session(handle)))).json();
    expect(body).toEqual({ leadsThisMonth: 2, byStage: { qualified: 1, unknown: 1 }, byAgent: { sales: 1, housing: 1 }, followUpsPending: 1 });
  });

  test("fails closed with 503 and a generic message, never mock contacts or upstream details", async () => {
    const handle = handler(async () => { throw new Error("sensitive upstream diagnostic fixture"); });
    const cookie = await session(handle);
    for (const path of ["/api/contacts", "/api/contacts/a", "/api/stats", "/api/appointments"]) {
      const response = await handle(request(path, "GET", cookie));
      expect(response.status).toBe(503);
      const body = await response.text();
      expect(body).not.toContain("sensitive upstream diagnostic fixture");
      expect(body).not.toContain("Fixture Alpha");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });

  test("rate limits repeated password failures", async () => {
    const handle = handler();
    for (let attempt = 0; attempt < 10; attempt++) expect((await handle(request("/api/login", "POST", undefined, JSON.stringify({ password: "wrong" }), origin))).status).toBe(401);
    expect((await login(handle)).status).toBe(429);
  });
});
