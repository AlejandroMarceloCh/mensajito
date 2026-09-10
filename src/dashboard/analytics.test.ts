import { describe, expect, test } from "bun:test";
import { analyticsModel, attentionReason } from "./analytics";
import { mockContacts } from "./mock-data";
import type { ContactListItem } from "./types";

const now = Date.parse("2026-09-10T20:00:00Z");
const contact = (createdAt: string, overrides: Partial<ContactListItem> = {}): ContactListItem => ({ ...mockContacts[0]!, createdAt, ...overrides });
describe("analytics measures", () => {
  test("uses Lima midnight boundaries and reconciles chart totals", () => {
    const all = [contact("2026-09-04T04:59:59Z"), contact("2026-09-04T05:00:00Z"), contact("2026-09-11T04:59:59Z", { agent: "housing" }), contact("2026-09-11T05:00:00Z")];
    const model = analyticsModel(all, 7, "all", now);
    expect(model.rows).toHaveLength(2);
    expect(model.previous).toHaveLength(1);
    expect(model.trend.reduce((sum, b) => sum + b.Tami + b.Milo, 0)).toBe(model.rows.length);
    expect(analyticsModel(all, 7, "housing", now).rows).toHaveLength(1);
  });
  test("does not count terminal leads as overdue", () => {
    const overdue = contact("2026-09-09T12:00:00Z", { nextFollowUpAt: "2026-09-10T12:00:00Z" });
    expect(attentionReason(overdue, now)?.priority).toBe(0);
    expect(attentionReason({ ...overdue, stage: "won" }, now)).toBeNull();
    expect(attentionReason({ ...overdue, stage: "lost" }, now)).toBeNull();
  });
  test("calification excludes nurture and evaluation even with high intent", () => {
    const all = ["qualifying", "qualified", "visit_scheduled", "won", "nurture"].map(stage => contact("2026-09-09T12:00:00Z", { stage: stage as ContactListItem["stage"] }));
    expect(analyticsModel(all, 7, "all", now).qualified).toHaveLength(3);
    expect(analyticsModel([], 7, "all", now).trend.every(b => b.Tami === 0 && b.Milo === 0)).toBe(true);
  });
});
