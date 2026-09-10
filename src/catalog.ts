export type HousingProgram = "mivivienda" | "techo_propio" | "ambos" | "ninguno";

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
};

export const projects: Project[] = [
  {
    id: "surco-parques",
    name: "Parques de Surco",
    district: "Santiago de Surco",
    city: "Lima",
    bedrooms: [2, 3],
    priceFrom: 318_000,
    priceTo: 465_000,
    monthlyFrom: 1650,
    programs: ["mivivienda"],
    stage: "entrega 2027",
    highlights: ["cerca al parque de la amistad", "áreas comunes", "cuota inicial financiable"],
  },
  {
    id: "comas-norte",
    name: "Alameda Norte",
    district: "Comas",
    city: "Lima",
    bedrooms: [2, 3],
    priceFrom: 145_000,
    priceTo: 228_000,
    monthlyFrom: 780,
    programs: ["mivivienda", "techo_propio"],
    stage: "en construcción",
    highlights: ["apto Techo Propio", "cerca a avenida Túpac Amaru", "bono del buen pagador"],
  },
  {
    id: "carabayllo-sol",
    name: "Sol de Carabayllo",
    district: "Carabayllo",
    city: "Lima",
    bedrooms: [2, 3],
    priceFrom: 118_000,
    priceTo: 175_000,
    monthlyFrom: 620,
    programs: ["techo_propio"],
    stage: "preventa",
    highlights: ["BFH aplicable", "casas y departamentos", "proyectos de interés social"],
  },
  {
    id: "san-miguel-mar",
    name: "Mar Pacífico",
    district: "San Miguel",
    city: "Lima",
    bedrooms: [1, 2, 3],
    priceFrom: 245_000,
    priceTo: 410_000,
    monthlyFrom: 1280,
    programs: ["mivivienda"],
    stage: "entrega inmediata",
    highlights: ["cerca al malecón", "1 a 3 dormitorios", "sala de ventas en el edificio"],
  },
  {
    id: "ate-bosques",
    name: "Bosques de Ate",
    district: "Ate",
    city: "Lima",
    bedrooms: [2, 3],
    priceFrom: 168_000,
    priceTo: 255_000,
    monthlyFrom: 890,
    programs: ["mivivienda"],
    stage: "en construcción",
    highlights: ["valor Mivivienda", "parques internos", "fácil acceso a Javier Prado"],
  },
  {
    id: "trujillo-ribera",
    name: "Ribera del Moche",
    district: "Víctor Larco",
    city: "Trujillo",
    bedrooms: [2, 3],
    priceFrom: 132_000,
    priceTo: 198_000,
    monthlyFrom: 710,
    programs: ["mivivienda", "techo_propio"],
    stage: "preventa",
    highlights: ["provincias", "programas FMV", "cuotas accesibles"],
  },
];

export type ProjectQuery = {
  district?: string;
  city?: string;
  bedrooms?: number;
  maxPrice?: number;
  maxMonthly?: number;
  program?: "mivivienda" | "techo_propio";
};

export function searchProjects(query: ProjectQuery): Project[] {
  const district = query.district?.toLowerCase();
  const city = query.city?.toLowerCase();

  return projects
    .filter((project) => {
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
      return true;
    })
    .slice(0, 4);
}

export function formatProject(project: Project): string {
  const programs = project.programs
    .map((program) => (program === "mivivienda" ? "Nuevo Crédito Mivivienda" : "Techo Propio"))
    .join(" y ");

  return [
    `${project.name} — ${project.district}, ${project.city}`,
    `Desde S/ ${project.priceFrom.toLocaleString("es-PE")} (cuota referencial desde S/ ${project.monthlyFrom.toLocaleString("es-PE")})`,
    `${project.bedrooms.join("/")} dormitorios · ${project.stage} · ${programs}`,
    project.highlights.join(" · "),
  ].join("\n");
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
