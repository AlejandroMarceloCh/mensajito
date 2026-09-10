export type AgentKind = "sales" | "housing";

const isTest = Boolean(process.env.BUN_TEST) || process.env.NODE_ENV === "test";

const REQUIRED_ENV = [
  "KAPSO_API_KEY",
  "KAPSO_WEBHOOK_SECRET",
  "OPENROUTER_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
] as const;

export function missingEnvVars(names: readonly string[] = REQUIRED_ENV): string[] {
  return names.filter((name) => !process.env[name]?.trim());
}

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

function salesPhoneNumberId(): string {
  const value =
    process.env.SALES_PHONE_NUMBER_ID?.trim() ||
    process.env.KAPSO_PHONE_NUMBER_ID?.trim();
  if (value) return value;
  if (isTest) return "test-SALES_PHONE_NUMBER_ID";
  throw new Error("Falta SALES_PHONE_NUMBER_ID (o KAPSO_PHONE_NUMBER_ID)");
}

const missing = isTest ? [] : missingEnvVars();
if (missing.length > 0) {
  throw new Error(`Faltan variables de entorno: ${missing.join(", ")}`);
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  kapsoApiKey: required("KAPSO_API_KEY"),
  webhookSecret: required("KAPSO_WEBHOOK_SECRET"),
  openRouterApiKey: required("OPENROUTER_API_KEY"),
  openRouterModel: process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini",
  salesPhoneNumberId: salesPhoneNumberId(),
  // Opcional hasta el siguiente frente: Milo / Mi Vivienda.
  housingPhoneNumberId:
    optional("HOUSING_PHONE_NUMBER_ID") ??
    (isTest ? "test-HOUSING_PHONE_NUMBER_ID" : undefined),
  calApiKey: optional("CAL_API_KEY"),
  calEventTypeId: optional("CAL_EVENT_TYPE_ID"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
};

export function agentForPhoneNumberId(phoneNumberId: string): AgentKind | null {
  if (phoneNumberId === config.salesPhoneNumberId) return "sales";
  if (
    config.housingPhoneNumberId &&
    phoneNumberId === config.housingPhoneNumberId
  ) {
    return "housing";
  }
  // Un solo agente activo: no descartar el sandbox si el id no coincide.
  if (!config.housingPhoneNumberId) return "sales";
  return null;
}

export function phoneNumberIdForAgent(agent: AgentKind): string {
  if (agent === "sales") return config.salesPhoneNumberId;
  if (!config.housingPhoneNumberId) {
    throw new Error("HOUSING_PHONE_NUMBER_ID no está configurado todavía");
  }
  return config.housingPhoneNumberId;
}
