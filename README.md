# Receptionist AI

Agente inmobiliario para WhatsApp construido con Bun, TypeScript, Express, Kapso,
LangChain y Supabase. Está preparado para desplegarse en Vercel.

## Configuración

Instala las dependencias:

```bash
bun install
```

Crea tu configuración local:

```bash
cp .env.example .env
```

Completa en `.env` las credenciales de Kapso, la Secret key de Supabase y la API
key del modelo. Nunca subas ese archivo al repositorio.

Aplica la migración inicial ubicada en
`supabase/migrations/20260910204500_initial_lead_memory.sql` a tu proyecto de
Supabase.

## Ejecutar

```bash
bun run index.ts
```

El servidor queda disponible en `http://localhost:3000` y expone:

- `GET /health` — comprobación de salud.
- `POST /webhooks/kapso` — recepción segura de eventos de Kapso.

Para enviar el mensaje aislado de prueba:

```bash
bun run send:test
```
