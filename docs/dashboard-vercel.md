# Dashboard: Supabase + Vercel

Este frente agrega una interfaz React/Recharts con lecturas reales de Supabase. No cambia el webhook, los agentes, las migraciones ni el almacenamiento que subió el equipo.

## Qué está conectado

- Contactos, perfiles e historial completo de sus conversaciones.
- Mensajes entrantes/salientes, sin asumir que todo saliente fue generado por IA.
- Citas de `appointments`, distinguiendo solicitud, confirmación, cancelación y finalización.
- Seguimientos de `follow_ups`, sin crear ni enviar ninguno desde esta versión.
- Indicadores, filtros por ingreso/agente, tabla de citas y exportación CSV.

La sesión usa una cookie firmada, HttpOnly, SameSite=Strict y Secure bajo HTTPS. Todas las APIs de datos requieren autenticación. Las mutaciones están bloqueadas en cliente y servidor. No existe fallback a datos ficticios si Supabase falla.

## Ejecutar local

1. Copiar `.env.dashboard.example` a `.env.dashboard.local` y completar las variables con acceso autorizado.
2. `bun install`
3. `bun run dev:dashboard:live` → `http://127.0.0.1:3001`

El dashboard aislado de datos reales sigue disponible con `bun run dev:dashboard`, explícitamente marcado como demo. No confundir las URLs: el puerto 3001 se reserva para la conexión real.

## Vercel

El HTML/React se compila con Bun a `dist`. La función Node `api/[...path].ts` expone las lecturas del dashboard. No se despliega el servidor Bun del agente ni su webhook a Vercel.

Variables privadas de servidor para cada entorno que se despliegue (Production está configurado; Preview requiere su propia configuración):

| Variable | Uso |
| --- | --- |
| `SUPABASE_URL` | Proyecto compartido por el equipo |
| `SUPABASE_SECRET_KEY` | Clave servidor, nunca publicable |
| `DASHBOARD_PASSWORD` | Contraseña aleatoria de al menos 12 caracteres |
| `DASHBOARD_SECRET` | Secreto estable aleatorio de al menos 32 caracteres para firmar cookies |

No pegar valores en el PR, el README ni el frontend. `.env.dashboard.local` está ignorado por Git; `.vercelignore` excluye todos los `.env*` del upload. El acceso a logs y código se administra desde la cuenta de Vercel.

Guías usadas: [funciones Node de Vercel](https://vercel.com/docs/functions/runtimes/node-js), [configuración del proyecto](https://vercel.com/docs/project-configuration/vercel-json).

## Alcance de los indicadores

- Fecha global = fecha de creación del contacto en hora de Lima.
- Mensajes/conversaciones = todo el historial de los contactos de esa cohorte; no mensajes enviados solo en el período.
- Visitas confirmadas = filas `appointments.kind = visit` y `status = confirmed`; no son el número de leads con intención de visitar.
- `appointment_requested` no equivale a reserva confirmada. `closed` no implica venta ni pérdida.
- Sin eventos históricos no se presenta una tasa de retención ni se atribuye una mejora al agente.

## Compatibilidad con main y citas

La rama incorpora `origin/main` en `49937fc`, que agrega persistencia de leads, score, ahorros y visitas en Supabase. El dashboard consulta las tablas del equipo y distingue una solicitud de una cita confirmada. Nunca infiere una reserva únicamente desde el texto del chat. Los registros anteriores no se reconstruyen automáticamente: si la tabla de citas está vacía, la interfaz lo indica.

El último contacto entrante y saliente se calcula a partir de `messages.created_at`; los próximos contactos usan `follow_ups.scheduled_for`. No se crean fechas ficticias ni seguimientos automáticos desde el dashboard.

## Diseño y QA

Se conserva la versión verde original elegida por el usuario, con React, Recharts, Radix UI y Lucide, recuperación de su composición visual y conexión real a Supabase. Las skills `build-dashboard` y `power-bi-report-design-consultation` orientan la validación de fuentes, filtros y lectura sin sustituir el diseño elegido.

```sh
bun run typecheck:dashboard
bun run test:dashboard
bun run build:dashboard
```

Antes de una apertura comercial: rotar cualquier clave compartida fuera del gestor de secretos; sustituir la contraseña compartida por auth de usuarios/roles; rate limiting distribuido y paginación de consultas a escala. El límite de login de esta versión es por instancia, no distribuido. Esta entrega es una revisión de equipo de solo lectura.
