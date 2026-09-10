export type LeadScore = 1 | 2 | 3 | 4 | 5;

export type LeadScoreResult = {
  score: LeadScore;
  qualified: boolean;
  reason: string;
};

const REJECT =
  /\bno me interesa\b|\bya compre\b|\bya compré\b|\bno escriban\b|\bdejen de escribir\b|\bcancel(o|a|ar)\b la visita/;

const VISIT =
  /\bvisit(a|ar|arnos)\b|\bagend(a|ar|emos|amos)\b|\bseparar\b|\bquiero comprar\b|\bvoy a comprar\b|\bsala de ventas\b/;

const FIT =
  /\bse acomoda\b|\bme calza\b|\bme queda\b|\bsi me acomoda\b|\bbusquemos otra\b|\balternativa\b/;

const UNIT =
  /\b(\d)\s*(dorm|habitacion)|departamento|depa\b|\bcasa\b/;

export function scoreLeadIntent(input: {
  profile: Record<string, unknown>;
  userText?: string;
}): LeadScoreResult {
  const text = (input.userText ?? "").toLowerCase();
  const profile = input.profile;

  if (REJECT.test(text)) {
    return { score: 1, qualified: false, reason: "El lead rechazó o pidió no seguir" };
  }

  if (
    profile.visitBooked === true ||
    profile.visitRequested === true ||
    VISIT.test(text)
  ) {
    return { score: 5, qualified: true, reason: "Pidió o confirmó visita / intención de compra" };
  }

  const hasSavings = numberOrZero(profile.savings) > 0 || numberOrZero(profile.downPayment) > 0;
  if (profile.capacityFits === true || (hasSavings && FIT.test(text))) {
    return { score: 4, qualified: true, reason: "Cerró capacidad o confirmó que le calza" };
  }
  if (hasSavings) {
    return { score: 4, qualified: false, reason: "Declaró ahorro o cuota inicial" };
  }

  const hasProject = typeof profile.projectInterest === "string" && profile.projectInterest.length > 0;
  const hasDistrict = typeof profile.district === "string" && profile.district.length > 0;
  const hasBedrooms = typeof profile.bedrooms === "number";
  if ((hasProject || hasDistrict) && (hasBedrooms || UNIT.test(text))) {
    return { score: 3, qualified: false, reason: "Proyecto o zona más tipología" };
  }

  if (hasProject || hasDistrict || hasBedrooms || UNIT.test(text)) {
    return { score: 2, qualified: false, reason: "Mostró interés de zona, proyecto o tipo de unidad" };
  }

  return { score: 1, qualified: false, reason: "Conversación iniciada, aún sin señales de compra" };
}

export function nextLeadScore(input: {
  profile: Record<string, unknown>;
  userText?: string;
}): LeadScoreResult {
  const computed = scoreLeadIntent(input);
  const previous = clampScore(input.profile.intentScore);
  if (computed.score === 1 && /rechazó|no seguir/.test(computed.reason)) {
    return computed;
  }
  const score = Math.max(previous ?? 1, computed.score) as LeadScore;
  return {
    score,
    qualified: computed.qualified || score >= 4,
    reason: computed.reason,
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clampScore(value: unknown): LeadScore | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < 1 || value > 5) return undefined;
  return value as LeadScore;
}
