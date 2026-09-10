export type AgentKind = "sales" | "housing";

const isTest = Boolean(process.env.BUN_TEST) || process.env.NODE_ENV === "test";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (isTest) return `test-${name}`;
  throw new Error(`Falta la variable de entorno ${name}`);
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  kapsoApiKey: required("KAPSO_API_KEY"),
  webhookSecret: required("KAPSO_WEBHOOK_SECRET"),
  openaiApiKey: required("OPENAI_API_KEY"),
  openaiModel: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
  salesPhoneNumberId: required("SALES_PHONE_NUMBER_ID"),
  housingPhoneNumberId: required("HOUSING_PHONE_NUMBER_ID"),
  calApiKey: optional("CAL_API_KEY"),
  calEventTypeId: optional("CAL_EVENT_TYPE_ID"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
};

export function agentForPhoneNumberId(phoneNumberId: string): AgentKind | null {
  if (phoneNumberId === config.salesPhoneNumberId) return "sales";
  if (phoneNumberId === config.housingPhoneNumberId) return "housing";
  return null;
}

export function phoneNumberIdForAgent(agent: AgentKind): string {
  return agent === "sales"
    ? config.salesPhoneNumberId
    : config.housingPhoneNumberId;
}
