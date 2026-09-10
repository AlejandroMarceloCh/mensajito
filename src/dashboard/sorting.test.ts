import { expect, test } from "bun:test";
import { lastActivity, normalizeSort, sortContacts } from "./sorting";
import type { ContactListItem } from "./types";

const lead = (id: string, values: Partial<ContactListItem> = {}): ContactListItem => ({
  id, name: id, agent: "sales", phone: "", username: null, email: null, stage: "new",
  intentScore: null, profile: {}, lastInboundAt: null, lastOutboundAt: null, nextFollowUpAt: null,
  sessionOpen: false, assignedTo: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
  lastMessagePreview: "", ...values,
});
const ids = (items: ContactListItem[]) => items.map(item => item.id);
test("sorts activity using both directions, without using profile updates or mutating source", () => {
  const rows = [lead("a"), lead("b", { lastInboundAt: "2026-03-01T00:00:00Z" }), lead("c", { lastOutboundAt: "2026-04-01T00:00:00Z" })];
  expect(ids(sortContacts(rows))).toEqual(["c", "b", "a"]);
  expect(ids(sortContacts(rows, "oldest"))).toEqual(["a", "b", "c"]);
  expect(ids(rows)).toEqual(["a", "b", "c"]);
  expect(lastActivity(lead("invalid", { createdAt: "bad", lastInboundAt: "bad" }))).toBe(0);
});
test("priority ranks overdue active leads before score; closed leads are not urgent", () => {
  const rows = [lead("high", { intentScore: 5 }), lead("due", { intentScore: 2, nextFollowUpAt: "2026-01-02T00:00:00Z" }), lead("closed", { stage: "closed", intentScore: 1, nextFollowUpAt: "2026-01-02T00:00:00Z" }), lead("future", { intentScore: 3, nextFollowUpAt: "2027-01-01T00:00:00Z" })];
  expect(ids(sortContacts(rows, "priority", Date.parse("2026-09-01")))).toEqual(["due", "high", "future", "closed"]);
});
test("score puts unevaluated/invalid scores last and breaks ties deterministically", () => {
  const rows = [lead("z"), lead("b", { intentScore: 5 }), lead("a", { intentScore: 5 }), lead("x", { intentScore: 10 }), lead("c", { intentScore: 1 })];
  expect(ids(sortContacts(rows, "score"))).toEqual(["a", "b", "c", "x", "z"]);
  expect(normalizeSort("bogus")).toBe("recent");
  expect(normalizeSort("priority")).toBe("priority");
});
