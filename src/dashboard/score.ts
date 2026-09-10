export function scoreVisual(value: number | null | undefined) {
  if (value == null || !Number.isInteger(value) || value < 1 || value > 5) return { tone: "none", label: "Sin evaluar" };
  if (value <= 2) return { tone: "low", label: "Intención baja" };
  if (value === 3) return { tone: "medium", label: "Intención media" };
  return { tone: "high", label: "Intención alta" };
}
