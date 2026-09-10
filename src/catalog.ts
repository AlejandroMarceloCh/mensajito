export type HousingProgram = "mivivienda" | "techo_propio" | "ambos" | "ninguno";

export type UnitKind = "departamento" | "casa";

export type UnitType = {
  kind: UnitKind;
  bedrooms: number;
  bathrooms: number;
  areaM2: number;
  price: number;
  monthly: number;
  total: number;
  sold: number;
};

export type Project = {
  id: string;
  name: string;
  district: string;
  city: string;
  bedrooms: number[];
  priceFrom: number;
  priceTo: number;
  monthlyFrom: number;
  programs: Array<"mivivienda" | "techo_propio">;
  stage: string;
  highlights: string[];
  units: UnitType[];
};

function projectFromUnits(
  base: Omit<Project, "bedrooms" | "priceFrom" | "priceTo" | "monthlyFrom" | "units">,
  units: UnitType[],
): Project {
  const prices = units.map((unit) => unit.price);
  const monthlies = units.map((unit) => unit.monthly);
  return {
    ...base,
    units,
    bedrooms: [...new Set(units.map((unit) => unit.bedrooms))].sort((a, b) => a - b),
    priceFrom: Math.min(...prices),
    priceTo: Math.max(...prices),
    monthlyFrom: Math.min(...monthlies),
  };
}

export const projects: Project[] = [
  projectFromUnits(
    {
      id: "surco-parques",
      name: "Parques de Surco",
      district: "Santiago de Surco",
      city: "Lima",
      programs: ["mivivienda"],
      stage: "entrega 2027",
      highlights: ["cerca al parque de la amistad", "áreas comunes", "cuota inicial financiable"],
    },
    [
      { kind: "departamento", bedrooms: 2, bathrooms: 2, areaM2: 68, price: 318_000, monthly: 1650, total: 45, sold: 28 },
      { kind: "departamento", bedrooms: 3, bathrooms: 2, areaM2: 92, price: 465_000, monthly: 2350, total: 30, sold: 19 },
    ],
  ),
  projectFromUnits(
    {
      id: "comas-norte",
      name: "Alameda Norte",
      district: "Comas",
      city: "Lima",
      programs: ["mivivienda", "techo_propio"],
      stage: "en construcción",
      highlights: ["apto Techo Propio", "cerca a avenida Túpac Amaru", "bono del buen pagador"],
    },
    [
      { kind: "departamento", bedrooms: 2, bathrooms: 1, areaM2: 58, price: 145_000, monthly: 780, total: 80, sold: 52 },
      { kind: "departamento", bedrooms: 3, bathrooms: 2, areaM2: 74, price: 228_000, monthly: 1180, total: 40, sold: 22 },
    ],
  ),
  projectFromUnits(
    {
      id: "carabayllo-sol",
      name: "Sol de Carabayllo",
      district: "Carabayllo",
      city: "Lima",
      programs: ["techo_propio"],
      stage: "preventa",
      highlights: ["BFH aplicable", "casas y departamentos", "proyectos de interés social"],
    },
    [
      { kind: "departamento", bedrooms: 2, bathrooms: 1, areaM2: 52, price: 118_000, monthly: 620, total: 60, sold: 21 },
      { kind: "casa", bedrooms: 3, bathrooms: 2, areaM2: 86, price: 175_000, monthly: 890, total: 24, sold: 9 },
    ],
  ),
  projectFromUnits(
    {
      id: "san-miguel-mar",
      name: "Mar Pacífico",
      district: "San Miguel",
      city: "Lima",
      programs: ["mivivienda"],
      stage: "entrega inmediata",
      highlights: ["cerca al malecón", "1 a 3 dormitorios", "sala de ventas en el edificio"],
    },
    [
      { kind: "departamento", bedrooms: 1, bathrooms: 1, areaM2: 42, price: 245_000, monthly: 1280, total: 20, sold: 17 },
      { kind: "departamento", bedrooms: 2, bathrooms: 2, areaM2: 64, price: 328_000, monthly: 1690, total: 48, sold: 31 },
      { kind: "departamento", bedrooms: 3, bathrooms: 2, areaM2: 88, price: 410_000, monthly: 2100, total: 16, sold: 8 },
    ],
  ),
  projectFromUnits(
    {
      id: "ate-bosques",
      name: "Bosques de Ate",
      district: "Ate",
      city: "Lima",
      programs: ["mivivienda"],
      stage: "en construcción",
      highlights: ["valor Mivivienda", "parques internos", "fácil acceso a Javier Prado"],
    },
    [
      { kind: "departamento", bedrooms: 2, bathrooms: 2, areaM2: 61, price: 168_000, monthly: 890, total: 70, sold: 38 },
      { kind: "departamento", bedrooms: 3, bathrooms: 2, areaM2: 79, price: 255_000, monthly: 1320, total: 36, sold: 14 },
    ],
  ),
  projectFromUnits(
    {
      id: "trujillo-ribera",
      name: "Ribera del Moche",
      district: "Víctor Larco",
      city: "Trujillo",
      programs: ["mivivienda", "techo_propio"],
      stage: "preventa",
      highlights: ["provincias", "programas FMV", "cuotas accesibles"],
    },
    [
      { kind: "departamento", bedrooms: 2, bathrooms: 1, areaM2: 56, price: 132_000, monthly: 710, total: 54, sold: 16 },
      { kind: "departamento", bedrooms: 3, bathrooms: 2, areaM2: 78, price: 198_000, monthly: 1050, total: 28, sold: 7 },
    ],
  ),
];

export type ProjectQuery = {
  name?: string;
  district?: string;
  city?: string;
  bedrooms?: number;
  maxPrice?: number;
  maxMonthly?: number;
  program?: "mivivienda" | "techo_propio";
};

const PROJECT_ALIASES: Record<string, string[]> = {
  "surco-parques": ["parques de surco", "parques surco"],
  "comas-norte": ["alameda norte"],
  "carabayllo-sol": ["sol de carabayllo", "sol carabayllo", "carabayllo"],
  "san-miguel-mar": ["mar pacifico", "mar pacífico"],
  "ate-bosques": ["bosques de ate", "bosques ate"],
  "trujillo-ribera": ["ribera del moche", "ribera moche"],
};

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findProjectInText(text: string): Project | undefined {
  const hay = normalizeText(text);
  if (!hay) return undefined;

  const ranked = projects
    .flatMap((project) =>
      projectAliases(project).map((alias) => ({ project, alias })),
    )
    .sort((a, b) => b.alias.length - a.alias.length);

  return ranked.find(({ alias }) => hay.includes(alias))?.project;
}

function projectAliases(project: Project): string[] {
  return [
    normalizeText(project.name),
    ...(PROJECT_ALIASES[project.id] ?? []).map(normalizeText),
  ].filter((alias) => alias.length >= 6);
}

const DISTRICT_NEIGHBORS: Record<string, string[]> = {
  surco: ["san miguel", "ate"],
  "santiago de surco": ["san miguel", "ate"],
  miraflores: ["santiago de surco", "san miguel"],
  "san isidro": ["santiago de surco", "san miguel"],
  barranco: ["santiago de surco", "san miguel"],
  chorrillos: ["santiago de surco", "san miguel"],
  "la molina": ["ate", "santiago de surco"],
  "san borja": ["santiago de surco", "ate"],
  "san miguel": ["santiago de surco"],
  magdalena: ["san miguel"],
  "pueblo libre": ["san miguel"],
  callao: ["san miguel"],
  ate: ["santiago de surco", "comas"],
  comas: ["carabayllo"],
  carabayllo: ["comas"],
  "los olivos": ["comas", "carabayllo"],
  "san martin de porres": ["comas"],
  "san martín de porres": ["comas"],
  independencia: ["comas"],
  "puente piedra": ["carabayllo"],
  trujillo: ["víctor larco"],
  "victor larco": ["víctor larco"],
};

export function availableUnits(unit: UnitType): number {
  return Math.max(0, unit.total - unit.sold);
}

export function projectStock(project: Project): {
  total: number;
  sold: number;
  available: number;
} {
  return project.units.reduce(
    (acc, unit) => ({
      total: acc.total + unit.total,
      sold: acc.sold + unit.sold,
      available: acc.available + availableUnits(unit),
    }),
    { total: 0, sold: 0, available: 0 },
  );
}

export function searchProjects(query: ProjectQuery): Project[] {
  if (query.name) {
    const named = findProjectInText(query.name);
    if (named && matchesQuery(named, { ...query, name: undefined, district: undefined })) {
      return [named];
    }
  }
  return projects.filter((project) => matchesQuery(project, query)).slice(0, 4);
}

export function recommendProjects(query: ProjectQuery): {
  matches: Project[];
  alternatives: Project[];
  requestedDistrict?: string;
  requestedName?: string;
} {
  if (query.name) {
    const named = findProjectInText(query.name);
    if (named) {
      return { matches: [named], alternatives: [], requestedName: named.name };
    }
  }

  const matches = searchProjects(query);
  if (matches.length > 0 || !query.district) {
    return { matches, alternatives: [], requestedDistrict: query.district };
  }

  const withoutDistrict = { ...query, district: undefined };
  const neighbors = neighborDistricts(query.district);
  const similar = projects.filter((project) => {
    if (!matchesQuery(project, withoutDistrict)) return false;
    if (neighbors.length === 0) return true;
    return neighbors.some((district) => project.district.toLowerCase().includes(district));
  });

  const pool = similar.length > 0 ? similar : projects.filter((project) => matchesQuery(project, withoutDistrict));
  return {
    matches: [],
    alternatives: pool.slice(0, 2),
    requestedDistrict: query.district,
  };
}

export function formatProject(project: Project): string {
  const programs = project.programs
    .map((program) => (program === "mivivienda" ? "Nuevo Crédito Mivivienda" : "Techo Propio"))
    .join(" y ");
  const stock = projectStock(project);
  const typologies = project.units.map((unit) => {
    const kind = unit.kind === "casa" ? "casa" : "depa";
    return `${unit.bedrooms} dorm. ${kind} (${unit.areaM2} m², ${unit.bathrooms} baños): ${availableUnits(unit)} disponibles de ${unit.total} (${unit.sold} vendidos) · S/ ${unit.price.toLocaleString("es-PE")} · cuota desde S/ ${unit.monthly.toLocaleString("es-PE")}`;
  });

  return [
    `${project.name} — ${project.district}, ${project.city}`,
    `Inventario: ${stock.available} disponibles de ${stock.total} (${stock.sold} vendidos) · ${project.stage} · ${programs}`,
    ...typologies,
    project.highlights.join(" · "),
  ].join("\n");
}

export function formatRecommendation(result: ReturnType<typeof recommendProjects>): string {
  if (result.matches.length > 0) {
    const heading = result.requestedName
      ? `PROYECTO NOMBRADO: ${result.requestedName}. Quédate en este proyecto.`
      : result.requestedDistrict
        ? `PROYECTOS EN ${result.requestedDistrict.toUpperCase()}:`
        : "PROYECTOS QUE CALZAN:";
    return [heading, ...result.matches.map(formatProject)].join("\n\n");
  }

  if (result.alternatives.length > 0) {
    return [
      `SIN_PROYECTO_EN_DISTRITO: ${result.requestedDistrict ?? "esa zona"}`,
      "ALTERNATIVAS CON CARACTERÍSTICAS SIMILARES:",
      ...result.alternatives.map(formatProject),
      "Dile que no tienes en ese distrito y ofrece una alternativa. Pregunta si quiere seguir y si le envías la ficha.",
    ].join("\n\n");
  }

  return "No hay proyectos del catálogo con esos filtros. Relaja distrito o dormitorios y vuelve a buscar.";
}

export function inferProgram(input: {
  monthlyIncome?: number;
  hasProperty?: boolean;
  maxPrice?: number;
}): HousingProgram {
  const income = input.monthlyIncome ?? 0;
  if (input.hasProperty) return "mivivienda";
  if (income > 0 && income <= 3713 && (input.maxPrice ?? 0) <= 140_000) {
    return "techo_propio";
  }
  if (income > 0 && income <= 3713) return "ambos";
  if (income > 3713) return "mivivienda";
  return "ninguno";
}

function matchesQuery(project: Project, query: ProjectQuery): boolean {
  const district = query.district?.toLowerCase();
  const city = query.city?.toLowerCase();

  if (district && !project.district.toLowerCase().includes(district)) {
    return false;
  }
  if (city && !project.city.toLowerCase().includes(city)) {
    return false;
  }
  if (query.bedrooms && !project.bedrooms.includes(query.bedrooms)) {
    return false;
  }
  if (query.maxPrice && project.priceFrom > query.maxPrice) {
    return false;
  }
  if (query.maxMonthly && project.monthlyFrom > query.maxMonthly) {
    return false;
  }
  if (query.program && !project.programs.includes(query.program)) {
    return false;
  }
  return projectStock(project).available > 0;
}

function neighborDistricts(district: string): string[] {
  const key = district.trim().toLowerCase();
  if (DISTRICT_NEIGHBORS[key]) return DISTRICT_NEIGHBORS[key];
  const hit = Object.entries(DISTRICT_NEIGHBORS).find(([name]) => key.includes(name) || name.includes(key));
  return hit?.[1] ?? [];
}

const INICIAL_RATE = 0.1;

export function typicalInicial(price: number): number {
  return Math.round(price * INICIAL_RATE);
}

export function evaluateAffordability(input: {
  savings?: number;
  downPayment?: number;
  maxMonthly?: number;
  projectName?: string;
  bedrooms?: number;
}): string {
  const inicialAvailable = Math.max(0, input.downPayment ?? input.savings ?? 0);
  if (inicialAvailable <= 0) {
    return "Falta el monto ahorrado o la cuota inicial para evaluar. Pregunta eso antes de agendar.";
  }

  const focus = input.projectName ? findProjectInText(input.projectName) : undefined;
  const unit = focus ? pickUnit(focus, input.bedrooms) : undefined;
  const focusFits = unit
    ? unitFits(unit, inicialAvailable, input.maxMonthly)
    : false;

  const alternatives = projects
    .filter((project) => project.id !== focus?.id)
    .map((project) => ({ project, unit: pickUnit(project, input.bedrooms) }))
    .filter(({ unit: candidate }) => candidate && unitFits(candidate, inicialAvailable, input.maxMonthly))
    .sort((a, b) => a.unit!.price - b.unit!.price)
    .slice(0, 2);

  const lines = [
    `Inicial disponible: S/ ${inicialAvailable.toLocaleString("es-PE")} (10% referencial de inicial).`,
    input.savings != null ? `Ahorro declarado: S/ ${input.savings.toLocaleString("es-PE")}` : null,
    input.downPayment != null ? `Cuota inicial declarada: S/ ${input.downPayment.toLocaleString("es-PE")}` : null,
  ].filter(Boolean);

  if (focus && unit) {
    const required = typicalInicial(unit.price);
    lines.push(
      `${focus.name} · ${unit.bedrooms} dorm. ${unit.kind}: precio S/ ${unit.price.toLocaleString("es-PE")}, inicial referencial S/ ${required.toLocaleString("es-PE")}, cuota desde S/ ${unit.monthly.toLocaleString("es-PE")}.`,
      focusFits
        ? "RESULTADO=CALZA. Pregúntale si se acomoda a sus posibilidades. Si dice que sí, recién agenda la visita."
        : `RESULTADO=NO_CALZA. Le faltan S/ ${Math.max(0, required - inicialAvailable).toLocaleString("es-PE")} de inicial. Ofrece una alternativa más accesible.`,
    );
  }

  if (!focusFits && alternatives.length > 0) {
    lines.push("ALTERNATIVAS QUE SÍ SE ADAPTAN:");
    for (const { project, unit: candidate } of alternatives) {
      lines.push(
        `${project.name} (${project.district}) · ${candidate!.bedrooms} dorm. · inicial S/ ${typicalInicial(candidate!.price).toLocaleString("es-PE")} · cuota desde S/ ${candidate!.monthly.toLocaleString("es-PE")}`,
      );
    }
  } else if (!focusFits && !unit) {
    lines.push("No hay una tipología que calce con esa inicial. Sé honesta y no agendas todavía.");
  }

  return lines.join("\n");
}

function pickUnit(project: Project, bedrooms?: number): UnitType | undefined {
  const available = project.units.filter((unit) => availableUnits(unit) > 0);
  const pool = bedrooms ? available.filter((unit) => unit.bedrooms === bedrooms) : available;
  return [...(pool.length ? pool : available)].sort((a, b) => a.price - b.price)[0];
}

function unitFits(unit: UnitType, inicialAvailable: number, maxMonthly?: number): boolean {
  if (typicalInicial(unit.price) > inicialAvailable) return false;
  if (maxMonthly && unit.monthly > maxMonthly) return false;
  return true;
}
