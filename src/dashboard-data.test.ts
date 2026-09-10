import { describe, expect, test } from "bun:test";
import { createSnapshotReader, mapSnapshot, type SourceTables } from "./dashboard-data";

const now = Date.parse("2026-09-10T20:00:00Z");
const contact = (id: string, agent = "sales") => ({ id, agent, name: `Fixture ${id}`, phone_number: `test-${id}`, created_at: "2026-08-01T12:00:00Z", updated_at: "2026-09-10T12:00:00Z" });
const tables = (overrides: Partial<SourceTables> = {}): SourceTables => ({ contacts: [contact("a")], conversations: [], messages: [], lead_profiles: [], follow_ups: [], appointments: [], ...overrides });
const conversation = (id: string, contact_id: string, overrides = {}) => ({ id, contact_id, stage: "new", is_active: true, last_message_at: "2026-09-10T12:00:00Z", ...overrides });
const message = (id: string, conversation_id: string, direction: string, created_at: string, body = id) => ({ id, conversation_id, direction, created_at, body, message_type: "text" });

describe("live dashboard source mapping", () => {
  test("hides seed labels in presentation without changing stored provenance or real contacts", () => {
    const source = tables({
      contacts: [{ ...contact("a"), name: "Ana Torres · DEMO", email: "ana@example.invalid" }, { ...contact("b"), name: "Demo Studio" }],
      lead_profiles: [{ contact_id: "a", extra: { demo: true, demoBatch: "seed-1", notes: "[DEMO] Visita simulada para demostración.", assignedTo: "Equipo demo" } }],
      appointments: [{ id: "visit", contact_id: "a", kind: "visit", status: "confirmed", requested_for: "2026-09-12T16:00:00Z", notes: "[DEMO · NO RESERVA REAL] Visita simulada a las 11:00." }],
      follow_ups: [{ id: "follow", contact_id: "a", scheduled_for: "2026-09-11T16:00:00Z", status: "pending", reason: "[DEMO · NO ENVIAR] Seguimiento simulado vencido", created_at: "2026-09-10T16:00:00Z" }],
    });
    const original = structuredClone(source);
    const result = mapSnapshot(source, now);
    expect(result.contacts[0]).toMatchObject({ name: "Ana Torres", phone: "Sin teléfono vinculado", email: null, profile: { demo: true, demoBatch: "seed-1", notes: "Visita." } });
    expect(result.contacts[1]?.name).toBe("Demo Studio");
    expect(result.appointments[0]?.notes).toBe("Visita a las 11:00.");
    expect(result.details.get("a")?.followUps[0]?.note).toBe("Seguimiento vencido");
    expect(source).toEqual(original);
  });
  test("joins all historical conversations without mixing contact histories", () => {
    const result = mapSnapshot(tables({
      contacts: [contact("a"), contact("b", "housing")],
      conversations: [conversation("old", "a", { is_active: false, stage: "closed" }), conversation("current", "a", { stage: "qualified" }), conversation("other", "b")],
      messages: [message("a-new", "current", "inbound", "2026-09-10T13:00:00Z"), message("b-private", "other", "inbound", "2026-09-10T15:00:00Z"), message("a-old", "old", "outbound", "2026-09-09T13:00:00Z")],
    }), now);
    expect(result.details.get("a")?.messages.map(m => m.id)).toEqual(["a-old", "a-new"]);
    expect(result.details.get("b")?.messages.map(m => m.id)).toEqual(["b-private"]);
    expect(result.contacts[0]).toMatchObject({ conversationCount: 2, messageCount: 2, stage: "qualified", lastMessagePreview: "a-new" });
    expect(result.details.get("a")?.messages.every(m => m.contactId === "a")).toBe(true);
  });

  test("uses the active conversation even when an archived conversation has a later timestamp", () => {
    const result = mapSnapshot(tables({ conversations: [conversation("archived", "a", { is_active: false, last_message_at: "2026-09-11T00:00:00Z", stage: "closed" }), conversation("active", "a", { stage: "discovering" })] }), now);
    expect(result.contacts[0]?.stage).toBe("qualifying");
  });

  test("uses the latest conversation when none is active", () => {
    const result = mapSnapshot(tables({ conversations: [conversation("first", "a", { is_active: false, stage: "new", last_message_at: "2026-09-09T12:00:00Z" }), conversation("last", "a", { is_active: false, stage: "closed" })] }), now);
    expect(result.contacts[0]?.stage).toBe("closed");
  });

  test("preserves closed, unknown and requested states without fabricating sales", () => {
    for (const [sourceStage, expected] of [["closed", "closed"], ["unexpected-status", "unknown"], ["appointment_requested", "appointment_requested"], ["handed_off", "handed_off"], ["nurturing", "nurture"]] as const) {
      const result = mapSnapshot(tables({ conversations: [conversation("current", "a", { stage: sourceStage })] }), now);
      expect(result.contacts[0]?.stage).toBe(expected);
      expect(result.contacts[0]?.sourceStage).toBe(sourceStage);
      expect(["won", "lost", "visit_scheduled"]).not.toContain(result.contacts[0]!.stage);
    }
  });

  test("keeps unknown stage when there is no conversation", () => {
    expect(mapSnapshot(tables(), now).contacts[0]).toMatchObject({ stage: "unknown", conversationCount: 0, messageCount: 0, sessionOpen: false });
  });

  test("derives inbound and outbound timestamps independently; outbound is not assumed AI", () => {
    const result = mapSnapshot(tables({ conversations: [conversation("current", "a")], messages: [message("last-out", "current", "outbound", "2026-09-10T19:00:00Z"), message("last-in", "current", "inbound", "2026-09-10T18:00:00Z"), message("old-in", "current", "inbound", "2026-09-09T18:00:00Z")] }), now);
    expect(result.contacts[0]).toMatchObject({ lastInboundAt: "2026-09-10T18:00:00Z", lastOutboundAt: "2026-09-10T19:00:00Z", sessionOpen: true });
    expect(result.details.get("a")?.messages.at(-1)?.role).toBe("outbound");
  });

  test("closes the session exactly at 24 hours and rejects future inbound timestamps", () => {
    for (const timestamp of ["2026-09-09T20:00:00Z", "2026-09-11T20:00:00Z"]) {
      expect(mapSnapshot(tables({ conversations: [conversation("current", "a")], messages: [message("m", "current", "inbound", timestamp)] }), now).contacts[0]?.sessionOpen).toBe(false);
    }
  });

  test("uses a media label rather than inventing text for bodyless messages", () => {
    const result = mapSnapshot(tables({ conversations: [conversation("current", "a")], messages: [{ ...message("m", "current", "inbound", "2026-09-10T18:00:00Z"), body: null, message_type: "image" }] }), now);
    expect(result.details.get("a")?.messages[0]?.content).toBe("[image]");
  });

  test("maps structured profile plus qualification notes and retains zero values", () => {
    const result = mapSnapshot(tables({ conversations: [conversation("current", "a", { summary: "conversation summary" })], lead_profiles: [{ contact_id: "a", preferred_zones: ["Fixture district"], budget_max: 100000, bedrooms: 0, extra: { qualificationNote: "Registered qualification", intentScore: 0, assignedTo: "Fixture owner" } }] }), now);
    expect(result.contacts[0]).toMatchObject({ intentScore: 0, assignedTo: "Fixture owner", profile: { district: "Fixture district", budgetMax: 100000, bedrooms: 0, notes: "Registered qualification" } });
  });

  test("uses profile notes first and current summary only as fallback", () => {
    const base = { conversations: [conversation("current", "a", { summary: "Current summary" })] };
    expect(mapSnapshot(tables(base), now).contacts[0]?.profile.notes).toBe("Current summary");
    expect(mapSnapshot(tables({ ...base, lead_profiles: [{ contact_id: "a", extra: { notes: "Explicit note", qualificationNote: "Other" } }] }), now).contacts[0]?.profile.notes).toBe("Explicit note");
  });

  test("prefers the real CRM columns over legacy JSON values", () => {
    const result = mapSnapshot(tables({ contacts: [{ ...contact("a"), intent_score: 5 }], lead_profiles: [{ contact_id: "a", savings: 0, extra: { intentScore: 2, savings: 30000 } }] }), now);
    expect(result.contacts[0]).toMatchObject({ intentScore: 5, profile: { savings: 0 } });
  });

  test("keeps legacy JSON values when CRM columns are absent or null", () => {
    const result = mapSnapshot(tables({ contacts: [{ ...contact("a"), intent_score: null }], lead_profiles: [{ contact_id: "a", savings: null, extra: { intentScore: 4, savings: 30000 } }] }), now);
    expect(result.contacts[0]).toMatchObject({ intentScore: 4, profile: { savings: 30000 } });
  });

  test("does not invent contact dates from profile edits or booking dates", () => {
    const result = mapSnapshot(tables({ contacts: [{ ...contact("a"), updated_at: "2026-09-10T19:00:00Z" }], appointments: [{ id: "booking", contact_id: "a", kind: "visit", status: "confirmed", requested_for: "2026-09-12T20:00:00Z" }] }), now);
    expect(result.contacts[0]).toMatchObject({ lastInboundAt: null, lastOutboundAt: null, sessionOpen: false });
  });

  test("keeps failed follow-ups visible but only pending follow-ups drive the next contact", () => {
    const result = mapSnapshot(tables({ follow_ups: [
      { id: "failed", contact_id: "a", scheduled_for: "2026-09-08T20:00:00Z", status: "failed", reason: "Delivery failed", created_at: "2026-09-01T20:00:00Z" },
      { id: "pending", contact_id: "a", scheduled_for: "2026-09-12T20:00:00Z", status: "pending", created_at: "2026-09-01T20:00:00Z" },
      { id: "sent", contact_id: "a", scheduled_for: "2026-09-09T20:00:00Z", status: "sent", created_at: "2026-09-01T20:00:00Z" },
    ] }), now);
    expect(result.contacts[0]?.nextFollowUpAt).toBe("2026-09-12T20:00:00Z");
    expect(result.details.get("a")?.followUps[0]).toMatchObject({ status: "failed", note: "Delivery failed" });
    expect(result.details.get("a")?.followUps).toHaveLength(3);
  });

  test("keeps requested appointments separate from confirmed and scoped to the right contact", () => {
    const result = mapSnapshot(tables({ contacts: [contact("a"), contact("b")], appointments: [
      { id: "requested", contact_id: "a", kind: "visit", status: "requested", requested_for: null, notes: "Awaiting confirmation" },
      { id: "confirmed", contact_id: "b", kind: "call", status: "confirmed", requested_for: "2026-09-12T20:00:00Z", notes: null },
    ] }), now);
    expect(result.details.get("a")?.appointments).toEqual([{ id: "requested", contactId: "a", kind: "visit", status: "requested", requestedFor: null, notes: "Awaiting confirmation" }]);
    expect(result.details.get("b")?.appointments?.[0]?.status).toBe("confirmed");
    expect(result.contacts[0]?.stage).toBe("unknown");
  });

  test("fails visibly for an unsupported agent instead of silently assigning sales", () => {
    expect(() => mapSnapshot(tables({ contacts: [contact("a", "unrecognized")] }), now)).toThrow("Agente de origen no reconocido");
  });

  test("recognizes a confirmed visit from main only when tied to the current conversation", () => {
    const base = { conversations: [conversation("current", "a", { stage: "appointment_requested" })] };
    const booking = { id: "booking", contact_id: "a", conversation_id: "current", kind: "visit", status: "confirmed", requested_for: "2026-09-12T20:00:00Z" };
    expect(mapSnapshot(tables({ ...base, appointments: [booking] }), now).contacts[0]).toMatchObject({ stage: "visit_scheduled", sourceStage: "appointment_requested" });
    for (const changes of [{ status: "requested" }, { status: "cancelled" }, { requested_for: null }, { conversation_id: "archived" }, { kind: "call" }]) {
      expect(mapSnapshot(tables({ ...base, appointments: [{ ...booking, ...changes }] }), now).contacts[0]?.stage).toBe("appointment_requested");
    }
  });

  test("does not mutate source table ordering", () => {
    const source = tables({ conversations: [conversation("current", "a")], messages: [message("late", "current", "inbound", "2026-09-10T18:00:00Z"), message("early", "current", "outbound", "2026-09-09T18:00:00Z")] });
    const original = JSON.stringify(source);
    mapSnapshot(source, now);
    expect(JSON.stringify(source)).toBe(original);
  });
});

describe("dashboard snapshot reader", () => {
  const fixtureFetch = (respond: (url: URL) => Response | Promise<Response>) => ((input: string | URL | Request) => respond(new URL(input instanceof Request ? input.url : String(input)))) as typeof fetch;

  test("selects explicit safe columns and pages beyond the first 500 contacts", async () => {
    const requests: URL[] = [];
    const fetcher = fixtureFetch(url => {
      requests.push(url);
      const table = url.pathname.split("/").at(-1);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const items = table === "contacts" ? Array.from({ length: offset === 0 ? 500 : 1 }, (_, index) => contact(`fixture-${offset + index}`)) : [];
      return Response.json(items);
    });
    const result = await createSnapshotReader("https://fixture.invalid", "fixture-key", fetcher)();
    expect(result.contacts).toHaveLength(501);
    expect(requests.filter(url => url.pathname.endsWith("/contacts"))).toHaveLength(2);
    for (const url of requests) {
      expect(url.searchParams.get("select")).not.toBe("*");
      expect(url.searchParams.get("select")).not.toContain("raw_payload");
      expect(url.searchParams.get("limit")).toBe("500");
      expect(url.searchParams.get("order")).toBe(url.pathname.endsWith("/lead_profiles") ? "contact_id.asc" : "id.asc");
    }
  });

  test("shares concurrent reads and caches successful snapshots briefly", async () => {
    let requests = 0;
    const read = createSnapshotReader("https://fixture.invalid", "fixture-key", fixtureFetch(() => { requests++; return Response.json([]); }));
    const [a, b] = await Promise.all([read(), read()]);
    expect(a).toBe(b);
    expect(await read()).toBe(a);
    expect(requests).toBe(6);
  });

  test("reads real CRM columns on a migrated database", async () => {
    const requests: URL[] = [];
    const read = createSnapshotReader("https://fixture.invalid", "fixture-key", fixtureFetch(url => {
      requests.push(url);
      if (url.pathname.endsWith("/contacts")) return Response.json([{ ...contact("a"), intent_score: 5 }]);
      if (url.pathname.endsWith("/lead_profiles")) return Response.json([{ contact_id: "a", savings: 50000 }]);
      return Response.json([]);
    }));
    expect((await read()).contacts[0]).toMatchObject({ intentScore: 5, profile: { savings: 50000 } });
    expect(requests.find(url => url.pathname.endsWith("/contacts"))?.searchParams.get("select")).toContain("intent_score");
    expect(requests.find(url => url.pathname.endsWith("/lead_profiles"))?.searchParams.get("select")).toContain("savings");
  });

  test("falls back only for the two exact optional CRM columns on an older database", async () => {
    const requests: URL[] = [];
    const read = createSnapshotReader("https://fixture.invalid", "fixture-key", fixtureFetch(url => {
      requests.push(url);
      const selection = url.searchParams.get("select") ?? "";
      if (url.pathname.endsWith("/contacts")) {
        if (selection.includes("intent_score")) return Response.json({ code: "42703", message: "column contacts.intent_score does not exist" }, { status: 400 });
        return Response.json([contact("a")]);
      }
      if (url.pathname.endsWith("/lead_profiles")) {
        if (selection.includes("savings")) return Response.json({ code: "PGRST204", message: "Could not find the 'savings' column of 'lead_profiles' in the schema cache" }, { status: 400 });
        return Response.json([{ contact_id: "a", extra: { intentScore: 4, savings: 12000 } }]);
      }
      return Response.json([]);
    }));
    expect((await read()).contacts[0]).toMatchObject({ intentScore: 4, profile: { savings: 12000 } });
    expect(requests.filter(url => url.pathname.endsWith("/contacts"))).toHaveLength(2);
    expect(requests.filter(url => url.pathname.endsWith("/lead_profiles"))).toHaveLength(2);
  });

  test("does not hide unrelated schema or permission errors behind optional-column fallback", async () => {
    for (const error of [{ code: "42703", message: "column contacts.name does not exist" }, { code: "42501", message: "permission denied for contacts.intent_score" }, { code: "PGRST204", message: "Could not find the 'intent_score' column of 'other_table'" }]) {
      let contactRequests = 0;
      const read = createSnapshotReader("https://fixture.invalid", "fixture-key", fixtureFetch(url => {
        if (url.pathname.endsWith("/contacts")) { contactRequests++; return Response.json(error, { status: 400 }); }
        return Response.json([]);
      }));
      await expect(read()).rejects.toThrow(`No se pudo leer contacts (${error.code})`);
      expect(contactRequests).toBe(1);
    }
  });

  test("fails the entire snapshot if one source table fails, then retries instead of caching demo data", async () => {
    let fail = true;
    const read = createSnapshotReader("https://fixture.invalid", "fixture-key", fixtureFetch(url => {
      if (fail && url.pathname.endsWith("/appointments")) return Response.json({ code: "42501", message: "fixture sensitive upstream message" }, { status: 403 });
      return Response.json([]);
    }));
    await expect(read()).rejects.toThrow("No se pudo leer appointments (42501)");
    fail = false;
    expect((await read()).contacts).toEqual([]);
  });

  test("refuses partial statistics at the maximum table scan limit", async () => {
    let contactPages = 0;
    const batch = Array.from({ length: 500 }, (_, index) => contact(`fixture-${index}`));
    const read = createSnapshotReader("https://fixture.invalid", "fixture-key", fixtureFetch(url => {
      if (url.pathname.endsWith("/contacts")) { contactPages++; return Response.json(batch); }
      return Response.json([]);
    }));
    await expect(read()).rejects.toThrow("límite de lectura");
    expect(contactPages).toBe(200);
  });
});
