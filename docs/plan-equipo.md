# Plan de equipo — Mensajito (agentes WhatsApp + CRM)

Documento para dividir el trabajo entre personas. Cada **frente** es un bloque que se puede asignar. El dashboard puede arrancar en paralelo al webhook usando contratos de API y datos mock, sin esperar a Kapso.

**Producto:** dos números de WhatsApp, dos agentes (Tami = ventas inmobiliarias, Milo = Fondo Mivivienda / Techo Propio), memoria en Supabase, dashboard CRM (estado del lead + follow-up), deploy en EC2.

**Referencias:** [receptionist-ai](https://github.com/crafter-station/receptionist-ai), [Pascal](https://www.iapascal.com/es), Kapso webhooks v2.

---

## Cómo usar este documento

1. Asignar un **owner** por frente (tabla de más abajo).
2. El owner no cruza de frente sin avisar: los contratos (tablas y JSON de API) son la interfaz.
3. Marcar cada tarea `Pendiente` / `En curso` / `Hecho` en la checklist del frente.
4. No mergear a `main` si rompe `/health` o el webhook (ACK 200).

### Asignación sugerida

| Frente | Quién | Puede empezar ya | Bloqueado por |
| --- | --- | --- | --- |
| A — Contratos y Supabase | Persona 1 | Sí | Nada (es el primero que desbloquea a todos) |
| B — Webhook y agentes | Persona 2 | Casi: mock de DB al inicio | A para Postgres real |
| C — Dashboard CRM | Persona 3 | Sí, con fetch mock / MSW | A para tipos; B solo para datos reales |
| D — Follow-up y plantillas | Persona 2 o 4 | Después de A | A + plantilla Meta + B (envío Kapso) |
| E — Deploy EC2 | Persona 4 / DevOps | En paralelo (Docker) | Dominio + IP (cuenta AWS) |
| F — Cuentas y Meta | Producto / ops | Ya | Nadie (es trabajo fuera de Git) |

---

## Stack y estilo de código (obligatorio)

Todo el equipo usa las mismas reglas. Si un PR las ignora, se pide cambio antes de merge.

### Runtime y paquetes

- **Bun**, no Node/npm/pnpm/vite. `bun install`, `bun test`, `bun --hot index.ts`.
- Servidor: `Bun.serve()` con `routes`. No Express.
- Postgres: `Bun.sql` + `DATABASE_URL` de Supabase. No `pg` / `postgres.js` / SQLite en el resultado final.
- WhatsApp: `@kapso/whatsapp-cloud-api`.
- Agentes: LangChain JS (`@langchain/openai`, tools con Zod).
- Front del CRM: HTML import + React en el mismo proceso Bun (ver `CLAUDE.md`). Sin Vite.

### TypeScript

- `strict` del `tsconfig` actual. No `any` nuevo. Preferir `unknown` + narrowing.
- Tipos de dominio en `src/types.ts` (un solo archivo al inicio). El dashboard **importa** esos tipos; no duplicar `Contact` en el front.
- Fechas en API: ISO 8601 UTC (`2026-09-10T20:00:00.000Z`). En UI, `America/Lima`.
- IDs de contactos/proyectos: `uuid` en Postgres (`gen_random_uuid()`).

### Archivos y nombres

```
mensajito/
  index.ts                 # solo arranque: serve + worker
  src/
    config.ts              # env, un objeto config
    types.ts               # AgentKind, Stage, Contact, Message, Project
    crypto.ts              # HMAC Kapso
    inbound.ts             # parse webhook v2 / batch
    handle-inbound.ts      # orquesta: persistir → agent → send
    whatsapp.ts            # sendText / sendTemplate
    db.ts                  # único acceso SQL
    agent.ts               # prompts + loop de tools
    tools.ts               # tools LangChain
    finance.ts             # cuota (puro, testeable)
    knowledge.ts           # FMV (puro, testeable)
    catalog.ts             # helpers de filtro; queries viven en db.ts
    followup.ts            # worker
    api/
      auth.ts
      contacts.ts
      projects.ts
    dashboard/             # Frente C
      index.html
      app.tsx
      api.ts               # fetch tipado a /api/*
      pages/
      components/
  supabase/migrations/
  deploy/
  docs/
```

- Archivos en **kebab-case** o el estilo ya usado (`handle-inbound.ts`). Componentes React: `PascalCase.tsx`.
- Funciones y variables: `camelCase`. Tablas SQL: `snake_case`. JSON de API: `camelCase`.
- Un módulo, una responsabilidad. `index.ts` no contiene SQL ni prompts.

### Comentarios

- Comentar **por qué**, no el qué. Prohibido: `// incrementa i`.
- Comentario corto en español o inglés, **un idioma por archivo** (preferir español en prompts de negocio y comentarios de dominio Perú/FMV; inglés en crypto/HMAC si se copia de Kapso).
- JSDoc solo en funciones públicas de `src/db.ts` y `src/api/*` (las usa otro frente).
- No dejar `TODO` sin owner y fecha: `// TODO(frente-C): paginar contactos — Ana — 2026-09-20`.
- No commitear claves. `.env` está en gitignore.

### Logs

Una línea JSON por evento (no `console.log` decorativos):

```ts
console.log(JSON.stringify({ msg: "contact_upserted", contactId, agent }));
```

`msg` en `snake_case`. Nada de PII de más: teléfono sí (operación), no DNI ni texto completo del chat en logs de prod.

### Errores HTTP

| Código | Cuándo |
| --- | --- |
| 200 | Webhook Kapso siempre que la firma sea válida (el trabajo pesado es async) |
| 400 | JSON / query inválida |
| 401 | Firma Kapso mala o cookie CRM inválida |
| 404 | Contacto / proyecto no existe |
| 409 | Follow-up duplicado o stage ilegal |
| 422 | Body Zod falló (devolver `{ error, fields }`) |
| 503 | Supabase caído |

Cuerpo de error CRM:

```json
{ "error": "validation_failed", "fields": { "stage": "valor no permitido" } }
```

### Tests

- `bun test`. Cada frente deja tests de **lógica pura** (HMAC, parse inbound, cuota, transiciones de `stage`, matching de proyectos).
- El Frente C: tests de helpers de UI si hay; si no, checklist manual en el PR.
- No llamar OpenAI ni Kapso en CI. Mockear `sendWhatsAppText`.

### Git

- Ramas: `frente-a/supabase`, `frente-b/agentes`, `frente-c/dashboard`, `frente-d/followup`, `frente-e/deploy`.
- Commits: un cambio por commit, mensaje en presente: `add contacts list API`.
- No mezclar migración SQL + UI en el mismo PR si se puede evitar. El contrato (`types.ts` + OpenAPI informal de este doc) sí puede ir en el PR de A.

### WhatsApp (reglas de producto)

- Mensajes del bot: 2–5 frases, español peruano, una o dos preguntas por turno.
- No inventar precios fuera de `projects`.
- Milo no promete calificación oficial FMV/banco.
- Fuera de ventana 24h: **solo plantilla** aprobada. El dashboard debe mostrar si la sesión está abierta (`sessionOpen: boolean`).

---

## Contratos compartidos

Definir esto el día 1 (Frente A). El dashboard mockea con estos JSON.

### `AgentKind`

`"sales"` | `"housing"`

### `Stage`

`"new"` → `"qualifying"` → `"qualified"` → `"visit_scheduled"` → `"won"` | `"lost"` | `"nurture"`

Transiciones permitidas (servidor las valida):

- desde `new`: `qualifying`, `lost`
- desde `qualifying`: `qualified`, `nurture`, `lost`
- desde `qualified`: `visit_scheduled`, `nurture`, `lost`
- desde `visit_scheduled`: `won`, `lost`, `nurture`, `qualified`
- desde `nurture`: `qualifying`, `qualified`, `lost`
- `won` y `lost` son terminales salvo un `PATCH` explícito a `nurture` (reabrir)

### `Contact` (API)

```ts
type Contact = {
  id: string;
  agent: "sales" | "housing";
  phone: string;
  username: string | null;
  name: string | null;
  email: string | null;
  stage: Stage;
  intentScore: number | null; // 1-5
  profile: Record<string, unknown>;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  nextFollowUpAt: string | null;
  sessionOpen: boolean; // lastInboundAt dentro de 24h
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
};
```

`profile` sugerido (no todos los campos a la vez):

```json
{
  "district": "Santiago de Surco",
  "bedrooms": 2,
  "budgetMax": 420000,
  "monthlyIncome": 4000,
  "monthlyDebts": 200,
  "downPayment": 20000,
  "programInterest": "mivivienda",
  "projectInterest": "surco-parques",
  "objections": "precio",
  "notes": "Prefiere sábado 11"
}
```

### `Message`

```ts
type Message = {
  id: string;
  contactId: string;
  role: "human" | "ai" | "advisor";
  content: string;
  kapsoId: string | null;
  createdAt: string;
};
```

---

## Catálogo de endpoints

Base: mismo host que el webhook. JSON `Content-Type: application/json`.

Auth CRM: cookie httpOnly `mensajito_session` (HMAC o token firmado con `DASHBOARD_SECRET`). Todas las rutas `/api/*` excepto `POST /api/login` la requieren.

### Sistema

| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| GET | `/health` | No | `{ "ok": true }` |
| GET | `/login` | No | HTML login |
| POST | `/api/login` | No | `{ "password": "..." }` → Set-Cookie; 401 si falla |
| POST | `/api/logout` | Cookie | Borra cookie |
| GET | `/` | Cookie | SPA dashboard (HTML) |
| GET | `/contacts/:id` | Cookie | Misma SPA (client router) |

### Webhook Kapso (Frente B)

| Método | Ruta | Auth |
| --- | --- | --- |
| POST | `/webhooks/whatsapp` | Header `X-Webhook-Signature` HMAC-SHA256 del **body crudo** |

Headers a leer: `X-Webhook-Event`, `X-Webhook-Signature`, `X-Idempotency-Key`, `X-Webhook-Payload-Version`.

Responder **200 `OK` en < 1s** si la firma es válida. Procesar LLM en background. Eventos distintos de `whatsapp.message.received`: 200 y no-op.

Body: un evento o batch `{ "batch": true, "data": [ ... ] }`. Extraer `phone_number_id`, `message.from`, `message.text.body`. Ignorar `direction === "outbound"`.

### Contactos (Frente C consume, B y D escriben)

**GET `/api/contacts`**

Query:

- `agent` = `sales` \| `housing`
- `stage` = una stage o `needs_followup` (alias: `nextFollowUpAt <= now` o inactivo y stage en `qualifying|qualified|nurture`)
- `q` = busca nombre o teléfono
- `limit` default 50, max 100
- `offset`

Respuesta:

```json
{
  "items": [ { "...Contact + lastMessagePreview" } ],
  "total": 128
}
```

`lastMessagePreview`: string ≤ 140 chars.

**GET `/api/contacts/:id`**

```json
{
  "contact": { },
  "messages": [ ],
  "followUps": [ ]
}
```

Mensajes: últimos 100, orden cronológico ascendente.

**PATCH `/api/contacts/:id`**

Body (todos opcionales):

```json
{
  "stage": "qualified",
  "name": "Ana",
  "email": "ana@correo.pe",
  "intentScore": 4,
  "nextFollowUpAt": "2026-09-12T16:00:00.000Z",
  "assignedTo": "juan",
  "profile": { "notes": "Llamar sábado" }
}
```

`profile` se **mergea** (no se borra lo que no viene). Validar transición de `stage`.

**POST `/api/contacts/:id/reply`**

Asesor escribe en la ventana 24h.

```json
{ "body": "Hola Ana, te confirmo la visita el sábado 11." }
```

- Si `sessionOpen === false` → `409` `{ "error": "session_closed", "hint": "usa /follow-up con plantilla" }`
- Éxito: `{ "message": { } }` y fila `role: "advisor"`

**POST `/api/contacts/:id/follow-up`**

Disparo inmediato.

```json
{
  "mode": "text" | "template",
  "body": "¿Seguimos viendo el depa de Surco?",
  "templateName": "seguimiento_visita"
}
```

- `text` solo si sesión abierta.
- `template` usa `FOLLOWUP_TEMPLATE_NAME` si no mandan `templateName`.
- Crea/actualiza `follow_ups` a `sent` y mensaje en el hilo.

**POST `/api/contacts/:id/follow-ups`**

Programar (no envía ahora).

```json
{ "dueAt": "2026-09-12T16:00:00.000Z", "note": "Si no responde, plantilla" }
```

**POST `/api/follow-ups/:id/cancel`**

Body vacío. Status `cancelled`.

### Proyectos (catálogo)

**GET `/api/projects`**

Query: `district`, `program` (`mivivienda` \| `techo_propio`), `maxPrice`, `bedrooms`, `active=true`.

**POST `/api/projects`** (opcional MVP+; si no hay tiempo, seed SQL y listado read-only)

**PATCH `/api/projects/:id`** — `active`, precios. Solo si Frente C hace pantalla de catálogo (fase 2). En MVP: seed + GET.

### Métricas (nice-to-have, Frente C si hay tiempo)

**GET `/api/stats`**

```json
{
  "leadsThisMonth": 585,
  "byStage": { "new": 40, "qualifying": 12 },
  "byAgent": { "sales": 200, "housing": 80 },
  "followUpsPending": 9
}
```

---

## Frente A — Contratos y Supabase

**Objetivo:** tablas reales + `src/types.ts` + `src/db.ts` con funciones que B y C importan.

### Pasos

1. Crear proyecto Supabase. Pegar `DATABASE_URL` en `.env` (no commitear).
2. Escribir `supabase/migrations/001_init.sql` (abajo el esquema).
3. Aplicar: SQL editor de Supabase o `psql $DATABASE_URL -f supabase/migrations/001_init.sql`.
4. Seed `002_seed_projects.sql` (copiar los 6 proyectos actuales de `src/catalog.ts`).
5. Implementar `src/db.ts` con `Bun.sql`: `upsertContact`, `getContact`, `listContacts`, `updateContact`, `insertMessage`, `listMessages`, `listProjects`, `claimIdempotencyKey`, `enqueueFollowUp`, `dueFollowUps`.
6. Exportar tipos. Abrir PR **solo** de migración + db + types. C y B se basan en ese PR.

### Esquema SQL (mínimo)

```sql
create type agent_kind as enum ('sales', 'housing');
create type contact_stage as enum (
  'new', 'qualifying', 'qualified', 'visit_scheduled',
  'won', 'lost', 'nurture'
);
create type message_role as enum ('human', 'ai', 'advisor');
create type follow_up_status as enum ('pending', 'sent', 'cancelled');

create table projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  district text not null,
  city text not null,
  bedrooms int[] not null,
  price_from int not null,
  price_to int not null,
  monthly_from int not null,
  programs text[] not null,
  stage text not null,
  highlights text[] not null default '{}',
  active boolean not null default true
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  agent agent_kind not null,
  phone text not null,
  username text,
  name text,
  email text,
  stage contact_stage not null default 'new',
  intent_score int check (intent_score between 1 and 5),
  profile jsonb not null default '{}',
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  next_follow_up_at timestamptz,
  assigned_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent, phone)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id),
  role message_role not null,
  content text not null,
  kapso_id text unique,
  created_at timestamptz not null default now()
);

create table follow_ups (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id),
  due_at timestamptz not null,
  status follow_up_status not null default 'pending',
  note text,
  created_at timestamptz not null default now()
);

create table processed_webhooks (
  idempotency_key text primary key,
  created_at timestamptz not null default now()
);

create index on contacts (stage);
create index on contacts (next_follow_up_at);
create index on messages (contact_id, created_at);
```

RLS: el servidor usa connection string (bypass). No hace falta RLS para el MVP si nadie usa la anon key en el browser. **El dashboard no habla con Supabase directo;** solo con `/api`.

### Definition of done

- [ ] Migración aplicada en el proyecto compartido
- [ ] `bun test` de `listContacts` / merge de profile (puede ser contra DB de test o funciones puras de stage)
- [ ] README corto en `supabase/README.md`: cómo correr la migración

---

## Frente B — Webhook y agentes

**Objetivo:** un mensaje al número 1 habla con Tami; al 2, con Milo; queda en Supabase.

### Pasos

1. Completar `src/config.ts`: `SALES_PHONE_NUMBER_ID`, `HOUSING_PHONE_NUMBER_ID`, `KAPSO_*`, `OPENAI_*`.
2. HMAC en `src/crypto.ts` (ya existe). Tests obligatorios.
3. `src/inbound.ts`: batch + v2 (ya esbozado). Enrutar por `phone_number_id`.
4. `handle-inbound.ts`: upsert contacto `stage=new`, insert mensaje `human`, `runAgent`, `sendText`, insert `ai`, actualizar `last_*`.
5. ACK inmediato en `index.ts` (ya existe). No mover el LLM al request síncrono.
6. Tools: `guardar_perfil`, `buscar_proyectos` (SQL), `marcar_calificacion` (set `stage` + `intentScore`), `consultar_programas`, `calcular_capacidad_pago`. Cal.com opcional (`CAL_API_KEY`).
7. Prompts en `src/agent.ts`: Tami (Pascal: atender, calificar, visita). Milo: FMV + preprospectación + catálogo. Disclaimer de montos referenciales.
8. Si A no está mergeado: interfaz `ContactStore` y un fake in-memory para no bloquear.

### Definition of done

- [ ] ngrok + Kapso: hola a cada número, respuesta coherente
- [ ] Filas en `contacts` / `messages` con `agent` correcto
- [ ] Firma inválida → 401
- [ ] Tests de inbound y cuota sin red

---

## Frente C — Dashboard CRM (puede ir en paralelo)

**Objetivo:** el asesor ve el pipeline, abre la ficha, cambia estado, escribe o programa follow-up.

### UX (MVP)

1. Login (password de equipo).
2. Home: tabs **Tami** / **Milo** / **Todos**. Filtro por stage. Columna o lista “Necesita follow-up”.
3. Cada fila: nombre o teléfono, stage, score, preview, tiempo desde último inbound.
4. Click → ficha: perfil (ingresos, distrito, proyecto), timeline de mensajes, select de stage, textarea respuesta, datetime de próximo follow-up, botón Perdido.
5. Vacío: “Aún no hay leads. Cuando alguien escriba al WhatsApp aparecen aquí.”

Estilo: sobrio, denso, tipo inbox (no landing). Tipografía de sistema. Estados de stage con color accesible (no solo color: texto visible). Mobile: lista usable; ficha apilada. Español.

Mismo `Bun.serve`: `dashboard/index.html` importa `app.tsx`.

### Pasos

1. Pactar con A los JSON de este doc. Crear `src/dashboard/api.ts` con las funciones `listContacts`, `getContact`, `patchContact`, `reply`, `scheduleFollowUp`.
2. Hasta que exista backend: `api.ts` con flag `USE_MOCK=true` y 8 contactos fake (4 sales, 4 housing, varios stages).
3. Login + cookie. Si 401, redirigir a `/login`.
4. Lista + ficha. Polling cada 10s en la lista (MVP; sin websocket).
5. Cuando B/A estén listos: `USE_MOCK=false`.
6. Pantalla de catálogo **no** es MVP (solo lectura en ficha si el profile trae `projectInterest`).

### Definition of done

- [ ] Recorrido login → lista → ficha → cambio de stage → reply mock o real
- [ ] Filtro `needs_followup`
- [ ] No layout roto a 390px de ancho en lista
- [ ] Comentario en `api.ts` de cada endpoint y el tipo de respuesta

### Checklist de prueba (cuando hay backend)

- [ ] Lead nuevo de WhatsApp aparece en < 10s (poll)
- [ ] Reply llega al teléfono si sesión abierta
- [ ] Reply con sesión cerrada muestra el error de plantilla
- [ ] Stage ilegal muestra 409

---

## Frente D — Follow-up

**Objetivo:** reenganchar leads que no contestan, sin spamear.

### Pasos

1. Worker `src/followup.ts`: cada 60s, `dueFollowUps` + contactos con `next_follow_up_at <= now()`.
2. Si `sessionOpen`: `sendText` con copy corto (guardado en config o generado una sola vez, no un LLM por tick salvo que el owner lo pida).
3. Si no: `sendTemplate(FOLLOWUP_TEMPLATE_NAME)` o dejar `pending` y que el CRM muestre “enviar plantilla”.
4. Idempotencia: no enviar dos veces el mismo `follow_ups.id`.
5. Frente F debe crear la plantilla en Meta (cuerpo tipo: “Hola {{1}}, ¿seguimos con tu consulta de vivienda?”).

### Definition of done

- [ ] Un follow-up programado en el CRM se envía a la hora
- [ ] Cancelar desde API evita el envío
- [ ] Log JSON `follow_up_sent` / `follow_up_skipped_no_template`

---

## Frente E — Deploy EC2

**Objetivo:** `https://<dominio>/health` y dashboard en el mismo host.

### Pasos (código)

1. `Dockerfile` (oven/bun, `bun start`, user no-root).
2. `docker-compose.yml`: `app` (3000 interno) + `caddy` (80/443).
3. `Caddyfile`: reverse proxy, TLS automático con `DOMAIN`.
4. `deploy/ec2.md`: Ubuntu, t3.medium recomendado, SG 22/80/443, Elastic IP, DNS A, `docker compose up -d`.

### Pasos (infra, Frente F / AWS)

Ver sección “Cuentas”. El código no crea la instancia.

### Definition of done

- [ ] `curl https://dominio/health`
- [ ] Webhook Kapso de prod (ngrok apagado)
- [ ] Dashboard con HTTPS y cookie Secure

---

## Frente F — Cuentas y accesos (fuera de Git)

Esto **no lo hace el código**. Sin esto, B/D/E se quedan a medias.

| Ítem | Quién | Para qué |
| --- | --- | --- |
| Proyecto Supabase + `DATABASE_URL` | F + A | Memoria |
| `KAPSO_API_KEY`, secret de webhook | F | Envío y HMAC |
| Dos `phone_number_id` | F | Routing Tami / Milo |
| Webhook Kapso → ngrok (dev) y dominio (prod) | F | Inbound |
| `OPENAI_API_KEY` | F | Agentes |
| Plantilla follow-up aprobada en Meta | F | Fuera de 24h |
| EC2 + Elastic IP + dominio A | F | HTTPS |
| `DASHBOARD_PASSWORD` / `DASHBOARD_SECRET` | F | CRM |
| Cal.com (opcional) | F | Visitas Tami |

**No hace falta pasar la IP al chat para programar.** Sí hace falta dominio + IP cuando Caddy deba emitir certificado.

Variables `.env.example` (completar, no commitear valores reales):

```
KAPSO_API_KEY=
KAPSO_WEBHOOK_SECRET=
SALES_PHONE_NUMBER_ID=
HOUSING_PHONE_NUMBER_ID=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
DATABASE_URL=postgresql://...
DASHBOARD_PASSWORD=
DASHBOARD_SECRET=
FOLLOWUP_TEMPLATE_NAME=
FOLLOWUP_INACTIVE_HOURS=24
PORT=3000
DOMAIN=agente.ejemplo.com
CAL_API_KEY=
CAL_EVENT_TYPE_ID=
```

---

## Orden temporal (aunque los frentes sean paralelos)

El alcance no cambia (Tami + Milo + CRM + deploy). Solo el **orden de avance**:

```
Ahora      B: Tami (ventas) operativa de punta a punta (webhook, tools, catálogo, visita)
Luego      B: Milo (Mi Vivienda) en el segundo número
En paralelo C: dashboard con mock; A: Supabase
Después    D: follow-up; E/F: EC2 + DNS + prueba de los 2 números
```

Detalle por día (igual que antes, con ventas primero):

```
Día 1     A: migración + types.ts + db stubs     F: cuentas (empezar por el número de ventas)
Día 1–3   C: UI con mock                         B: webhook + Tami (DB fake si A no listo)
Día 3     Integración A+B: mensajes reales de ventas en CRM
Día 4     B: Milo en el segundo número            D: worker
Día 5     C: API real                             E: Docker local
Día 6     F: EC2 + DNS + corte de webhook a prod + prueba de los 2 números
```

Si C termina antes: mergean mock detrás de flag; no bloquean a B.

---

## Criterios de aceptación del producto (todos los frentes)

- [ ] Número ventas: Tami califica y propone visita o proyecto del catálogo
- [ ] Número vivienda: Milo explica programa, estima cuota, recomienda 1–2 proyectos
- [ ] El mismo lead se ve en el dashboard con stage e hilo
- [ ] Un asesor cambia stage y programa follow-up
- [ ] Follow-up se dispara (texto o queda pendiente de plantilla)
- [ ] Producción en HTTPS; firma Kapso verificada
- [ ] Nada de secretos en el repo

---

## Fuera de alcance (no asignar todavía)

Multi-usuario con roles, HubSpot, pgvector, campañas masivas, varios inmobiliarias en un tenant, app móvil.

---

## Contacto entre frentes

Si cambia un campo JSON, se actualiza **este archivo** en el mismo PR que el código. El Frente C no adivina nombres de propiedades.
