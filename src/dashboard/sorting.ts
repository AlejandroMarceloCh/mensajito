import type { ContactListItem, ContactSort } from "./types";

const timestamp = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
export const lastActivity = (contact: ContactListItem) =>
  Math.max(timestamp(contact.lastInboundAt), timestamp(contact.lastOutboundAt)) || timestamp(contact.createdAt);
const score = (contact: ContactListItem) => {
  const value = contact.intentScore;
  return value != null && Number.isInteger(value) && value >= 1 && value <= 5 ? value : -1;
};
export function normalizeSort(value: string | null | undefined): ContactSort {
  return value === "priority" || value === "score" || value === "oldest" ? value : "recent";
}

/** Sort a copy so concurrent requests never reorder the shared source snapshot. */
export function sortContacts(contacts: ContactListItem[], order: ContactSort = "recent", now = Date.now()) {
  const overdue = (contact: ContactListItem) => {
    const due = timestamp(contact.nextFollowUpAt);
    return Number(due > 0 && due <= now && !["won", "lost", "closed"].includes(contact.stage));
  };
  return [...contacts].sort((a, b) => {
    if (order === "priority") {
      const urgency = overdue(b) - overdue(a);
      if (urgency) return urgency;
    }
    if (order === "score" || order === "priority") {
      const difference = score(b) - score(a);
      if (difference) return difference;
    }
    const activity = lastActivity(b) - lastActivity(a);
    return (order === "oldest" ? -activity : activity) || a.id.localeCompare(b.id);
  });
}
