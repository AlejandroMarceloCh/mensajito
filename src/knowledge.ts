export type KnowledgeChunk = {
  id: string;
  title: string;
  tags: string[];
  content: string;
};

export const housingKnowledge: KnowledgeChunk[] = [
  {
    id: "mivivienda-overview",
    title: "Nuevo Crédito Mivivienda",
    tags: ["mivivienda", "credito", "bbp", "cuota"],
    content: `El Nuevo Crédito Mivivienda es un crédito hipotecario del Fondo MIVIVIENDA (FMV) otorgado a través de bancos, cajas y financieras. Sirve para comprar vivienda nueva o usada, o para construir en terreno propio, dentro de los valores máximos vigentes del programa.

Beneficios típicos:
- Plazos largos (hasta 25 años según la entidad).
- Posible Bono del Buen Pagador (BBP) que reduce el monto a financiar si la vivienda está en el rango de valor social.
- Posible Bono Mivivienda Sostenible si el proyecto tiene certificación sostenible.
- La cuota se calcula con la tasa de la entidad financiera, no con una tasa única del Estado.

Requisitos habituales (confirmar con la entidad):
- Ser mayor de edad y tener capacidad de pago.
- No ser propietario de otra vivienda a nivel nacional (hay excepciones puntuales; verificar).
- Aportar una cuota inicial (suele partir de 10%, a veces financiable o complementada con bono).
- El inmueble debe estar en el rango de valor del programa y, si se usa BBP, cumplir condiciones de vivienda de interés social.

Este asistente da orientación. Los montos oficiales, UIT y topes se actualizan: hay que contrastarlos en mivivienda.com.pe o con un banco.`,
  },
  {
    id: "techo-propio",
    title: "Techo Propio y Bono Familiar Habitacional",
    tags: ["techo propio", "bfh", "bono", "ingresos"],
    content: `Techo Propio es el programa del FMV orientado a familias de menores ingresos. El apoyo principal es el Bono Familiar Habitacional (BFH), un subsidio que no se devuelve y se aplica a compra de vivienda nueva, construcción en sitio propio o mejoramiento.

Perfil típico:
- Hogares con ingresos familiares por debajo del tope vigente (históricamente ligado a un múltiplo de UIT; confirmar el tope actual).
- No ser propietario de vivienda.
- Estar inscrito y calificado en el sistema del programa.
- Ahorro mínimo o cuota inicial según la modalidad.

Modalidades:
- Adquisición de vivienda nueva en proyectos inscritos.
- Construcción en sitio propio (terreno saneado).
- Mejoramiento de vivienda.

El BFH no es un préstamo. Si el precio de la vivienda supera el bono, la diferencia se cubre con ahorro y, si aplica, un crédito complementario.

Importante: cupos, cronogramas de convocatoria y valores del bono cambian. Hay que revisar el estado de la convocatoria en el portal de Techo Propio / FMV.`,
  },
  {
    id: "capacidad-pago",
    title: "Capacidad de pago referencial",
    tags: ["capacidad", "cuota", "ingresos", "endeudamiento"],
    content: `La precalificación informal usa una regla conservadora: la cuota hipotecaria no debería superar el 30% del ingreso familiar neto mensual. Algunas entidades aceptan hasta cerca del 40% si hay codeudor y bajo endeudamiento, pero 30% es más seguro para no sobreendeudar.

Fórmula referencial:
- Cuota máxima ≈ ingreso familiar mensual × 0.30
- Si hay deudas (tarjetas, préstamos), restar esas cuotas antes de aplicar el 30%.

Ejemplo: ingreso familiar S/ 4,000, sin deudas → cuota máxima referencial S/ 1,200. Con una deuda de S/ 300 → S/ 1,050.

El monto de crédito aproximado se estima con una anualidad a 20 años y una tasa referencial de mercado (no es la tasa FMV ni una oferta bancaria). Sirve solo para filtrar proyectos del catálogo.

Nunca prometas aprobación. La entidad financiera evalúa historial en SBS, estabilidad laboral, cuota inicial y el inmueble.`,
  },
  {
    id: "bbp-sostenible",
    title: "Bono del Buen Pagador y bono sostenible",
    tags: ["bbp", "sostenible", "subsidio"],
    content: `El Bono del Buen Pagador (BBP) es un incentivo del FMV que se abona al crédito Mivivienda cuando la vivienda está dentro de ciertos valores. Reduce el capital y, por tanto, la cuota.

El Bono Mivivienda Sostenible es un complemento si el proyecto tiene criterios de sostenibilidad (agua, energía, residuos, etc.).

Los montos del BBP dependen del valor de la vivienda y se actualizan. No cites un monto exacto como definitivo: indica rangos o que se confirma con la entidad y el proyecto.

Para Techo Propio el apoyo principal es el BFH, no el BBP.`,
  },
  {
    id: "documentos",
    title: "Documentos y siguientes pasos",
    tags: ["documentos", "dni", "sbs", "banco"],
    content: `Para una precalificación en banco o caja suelen pedir:
- DNI de titular y cónyuge/conviviente.
- Boletas, recibos por honorarios o declaración de renta según el tipo de trabajo.
- Historial de ahorros o voucher de inicial.
- Si es independiente: PDT, movimientos de cuenta, o constancias de ingresos.
- Independencia registral / no ser propietario: se verifica en SUNARP.

Flujo recomendado:
1. Entender ingreso familiar, deudas e inicial.
2. Ver si el perfil encaja más en Techo Propio o Mivivienda.
3. Elegir 1 o 2 proyectos del catálogo que calcen precio y distrito.
4. Agendar visita a sala de ventas o derivar a un asesor humano para expediente formal.

Este canal no reemplaza la calificación del FMV ni del banco.`,
  },
];

export function searchKnowledge(query: string): KnowledgeChunk[] {
  const terms = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/\s+/)
    .filter((term) => term.length > 2);

  const scored = housingKnowledge
    .map((chunk) => {
      const haystack = `${chunk.title} ${chunk.tags.join(" ")} ${chunk.content}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
      const score = terms.reduce(
        (sum, term) => sum + (haystack.includes(term) ? 1 : 0),
        0,
      );
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return housingKnowledge.slice(0, 2);
  return scored.slice(0, 3).map((item) => item.chunk);
}
