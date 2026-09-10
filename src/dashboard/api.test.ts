import { describe, expect, test } from "bun:test";
import { getContact, getStats, listContacts, patchContact, reply } from "./api";

describe("dashboard mock contract", () => {
  test("filters contacts by agent and follow-up need", async () => {
    const sales = await listContacts({ agent: "sales" });
    const pending = await listContacts({ stage: "needs_followup" });

    expect(sales.items).toHaveLength(4);
    expect(sales.items.every((contact) => contact.agent === "sales")).toBe(true);
    expect(pending.items.length).toBeGreaterThan(0);
  });

  test("returns the detail contract in chronological order", async () => {
    const detail = await getContact("c-ana-torres");

    expect(detail.contact.name).toBe("Ana Torres");
    expect(detail.messages.length).toBeGreaterThan(1);
    expect(new Date(detail.messages[0]!.createdAt).getTime())
      .toBeLessThan(new Date(detail.messages.at(-1)!.createdAt).getTime());
  });

  test("rejects an illegal stage transition", async () => {
    expect(patchContact("c-valeria-paz", { stage: "won" }))
      .rejects.toThrow("no está permitido");
  });

  test("blocks a direct reply when the WhatsApp session is closed", async () => {
    expect(reply("c-jorge-quispe", "Hola, Jorge"))
      .rejects.toThrow("ventana de 24 h");
  });

  test("calculates stats from the same mock store", async () => {
    const stats = await getStats();

    expect(stats.leadsThisMonth).toBe(8);
    expect(stats.byAgent).toEqual({ sales: 4, housing: 4 });
    expect(stats.followUpsPending).toBe(4);
  });
});
