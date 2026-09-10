export type AgentKind = "sales" | "housing";

export type Stage =
  | "new"
  | "qualifying"
  | "qualified"
  | "visit_scheduled"
  | "won"
  | "lost"
  | "nurture"
  | "appointment_requested"
  | "handed_off"
  | "closed"
  | "unknown";

export type MessageRole = "human" | "ai" | "advisor" | "outbound";

export type Contact = {
  id: string;
  agent: AgentKind;
  phone: string;
  username: string | null;
  name: string | null;
  email: string | null;
  stage: Stage;
  intentScore: number | null;
  profile: Record<string, unknown>;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  nextFollowUpAt: string | null;
  sessionOpen: boolean;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  sourceStage?: string;
  conversationCount?: number;
  messageCount?: number;
};

export type ContactListItem = Contact & {
  lastMessagePreview: string;
};

export type Message = {
  id: string;
  contactId: string;
  role: MessageRole;
  content: string;
  kapsoId: string | null;
  createdAt: string;
};

export type FollowUp = {
  id: string;
  contactId: string;
  dueAt: string;
  status: "pending" | "sent" | "cancelled" | "failed";
  note: string | null;
  createdAt: string;
};

export type ContactDetail = {
  contact: Contact;
  messages: Message[];
  followUps: FollowUp[];
  appointments?: Appointment[];
};

export type Appointment = {
  id: string;
  contactId: string;
  kind: "call" | "visit";
  requestedFor: string | null;
  status: "requested" | "confirmed" | "cancelled" | "completed";
  notes: string | null;
};

export type ContactSort = "recent" | "priority" | "score" | "oldest";

export type ContactFilters = {
  sort?: ContactSort;
  agent?: AgentKind;
  stage?: Stage | "needs_followup";
  q?: string;
  limit?: number;
  offset?: number;
};

export type ContactPatch = Partial<
  Pick<
    Contact,
    "stage" | "name" | "email" | "intentScore" | "nextFollowUpAt" | "assignedTo"
  >
> & { profile?: Record<string, unknown> };

export type Stats = {
  leadsThisMonth: number;
  byStage: Partial<Record<Stage, number>>;
  byAgent: Record<AgentKind, number>;
  followUpsPending: number;
};

export const STAGES: Stage[] = [
  "new",
  "qualifying",
  "qualified",
  "visit_scheduled",
  "won",
  "lost",
  "appointment_requested",
  "handed_off",
  "closed",
  "unknown",
  "nurture",
];

export const STAGE_TRANSITIONS: Record<Stage, Stage[]> = {
  appointment_requested: [],
  handed_off: [],
  closed: [],
  unknown: [],
  new: ["qualifying", "lost"],
  qualifying: ["qualified", "nurture", "lost"],
  qualified: ["visit_scheduled", "nurture", "lost"],
  visit_scheduled: ["won", "lost", "nurture", "qualified"],
  nurture: ["qualifying", "qualified", "lost"],
  won: ["nurture"],
  lost: ["nurture"],
};
