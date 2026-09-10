const WEEKDAYS: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export function parseVisitSlot(
  text: string,
  now = new Date(),
): { iso: string; label: string } | null {
  const hay = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  let weekday: number | null = null;
  let hour = 11;
  let label = "";

  if (/\bsabado\b/.test(hay)) {
    weekday = 6;
    hour = 11;
    label = "sábado 11am";
  } else if (/\bdomingo\b/.test(hay)) {
    weekday = 0;
    hour = 16;
    label = "domingo 4pm";
  } else if (/entre semana|lunes|martes|miercoles|jueves|viernes/.test(hay)) {
    weekday = nextWeekdayIndex(now, [1, 2, 3, 4, 5]);
    hour = 18;
    label = "entre semana 6pm";
  } else {
    return null;
  }

  const parsedHour = hay.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (parsedHour) {
    let value = Number(parsedHour[1]);
    const meridiem = parsedHour[3];
    if (meridiem === "pm" && value < 12) value += 12;
    if (meridiem === "am" && value === 12) value = 0;
    if (value >= 8 && value <= 20) {
      hour = value;
      label = weekday === 6 ? `sábado ${formatHour(hour)}` : weekday === 0 ? `domingo ${formatHour(hour)}` : `${formatHour(hour)}`;
    }
  }

  return {
    iso: limaLocalToIso(nextDateOnWeekday(now, weekday), hour, 0),
    label,
  };
}

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

function limaParts(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Lima",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS[parts.weekday!.slice(0, 3).toLowerCase()] ?? 0,
  };
}

function nextDateOnWeekday(now: Date, weekday: number): { year: number; month: number; day: number } {
  const today = limaParts(now);
  let delta = (weekday - today.weekday + 7) % 7;
  if (delta === 0) delta = 7;
  const next = new Date(Date.UTC(today.year, today.month - 1, today.day + delta));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function nextWeekdayIndex(now: Date, allowed: number[]): number {
  const today = limaParts(now).weekday;
  for (let i = 1; i <= 7; i++) {
    const candidate = (today + i) % 7;
    if (allowed.includes(candidate)) return candidate;
  }
  return 1;
}

function limaLocalToIso(
  date: { year: number; month: number; day: number },
  hour: number,
  minute: number,
): string {
  return new Date(Date.UTC(date.year, date.month - 1, date.day, hour + 5, minute)).toISOString();
}
