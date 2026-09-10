# Mensajito

Plan de trabajo por persona (endpoints, estilo, frentes en paralelo): **[docs/plan-equipo.md](docs/plan-equipo.md)**.

Dos agentes de WhatsApp en un mismo webhook: uno comercial (atiende, califica y agenda visitas) y otro de orientación para Fondo MIVIVIENDA / Techo Propio. Cada agente usa su propio número. El enrutado es por `phone_number_id` de Kapso, como en el [curso receptionist-ai](https://github.com/crafter-station/receptionist-ai), con LangChain para herramientas, historial y conocimiento.

Orden de implementación (el producto no cambia): **primero Tami**, después Milo. El servidor puede arrancar solo con el número de ventas.

## Agentes

| Número | Variable | Agente | Qué hace |
| --- | --- | --- | --- |
| 1 | `SALES_PHONE_NUMBER_ID` | Tami (ventas) | Responde 24/7, califica intención, objeciones, recomienda del catálogo y agenda visita |
| 2 | `HOUSING_PHONE_NUMBER_ID` | Milo (vivienda) | Explica Mivivienda / Techo Propio / BBP, estima capacidad de pago y sugiere proyectos |

El flujo comercial sigue la idea de [Pascal](https://www.iapascal.com/es): lead → atención → calificación → seguimiento → visita.

El de vivienda hace una **preprospectación** (no es calificación oficial del FMV ni del banco) y recién después recomienda el catálogo.

## Stack

- Bun + TypeScript
- Kapso WhatsApp Cloud API ([firma HMAC del cuerpo crudo](https://docs.kapso.ai/docs/platform/webhooks/security))
- LangChain (`ChatOpenAI` + tools)
- Supabase (Postgres) es la **base principal**: contactos, mensajes, score, visitas, inventario. El CRM y el resto del producto leen de ahí.

Cal.com es opcional, igual que en el recepcionista del curso.

## Configuración

```bash
bun install
cp .env.example .env
```

Completa Kapso, ambos `phone_number_id` cuando toque cada agente, OpenAI y las claves de Supabase (`SUPABASE_URL` + `SUPABASE_SECRET_KEY`). Para el avance actual basta `SALES_PHONE_NUMBER_ID`.

Aplica las migraciones de `supabase/migrations/` en orden (SQL editor o Management API). Sin esas tablas el servidor no arranca: no hay fallback a SQLite.

En Kapso conecta **dos** números y crea un webhook **por cada phone number** (no uses solo un webhook de proyecto: esos no reciben `whatsapp.message.received`). Mientras avanzamos Tami, configura primero el de ventas. Apunta ambos a:

`https://<tu-dominio>/webhooks/whatsapp`

(`POST /webhooks/kapso` es el mismo handler, por compatibilidad con el código anterior.)

Evento: `whatsapp.message.received`. Mismo `KAPSO_WEBHOOK_SECRET` que en `.env`. Payload v2.

Localmente:

```bash
bun run dev
ngrok http 3000
```

Envío de prueba (no es el webhook; solo un saludo saliente):

```bash
TEST_AGENT=sales bun run send:test
TEST_AGENT=housing bun run send:test
```

## Cómo ampliar el catálogo y el conocimiento

- Proyectos (agente): `src/catalog.ts`
- Inventario (CRM): tablas `projects` y `project_units`
- Leads para el CRM: vista `crm_leads` (`intent_score`, `stage`, `extra`, última visita)
- Programas FMV: `src/knowledge.ts` (el tool `consultar_programas` busca ahí)
- Prompts: `src/agent.ts`

Los montos de bonos y topes de UIT cambian. El agente está instruido a tratarlos como referenciales.
