import type { AgentKind } from "./config";

export type Contact = {
  id: string;
  conversationId: string;
  agent: AgentKind;
  phone: string;
  username: string | null;
  name: string | null;
  email: string | null;
  profileJson: string;
};

export type StoredMessage = {
  id: string;
  contactId: string;
  role: "human" | "ai" | "advisor";
  content: string;
  kapsoId: string | null;
  createdAt: string;
};
