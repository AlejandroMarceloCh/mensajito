import dashboard from "./dashboard/index.html";
import { createSnapshotReader } from "./dashboard-data";
import { createDashboardHandler } from "./dashboard-http";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const password = process.env.DASHBOARD_PASSWORD;
if (!url || !key || !password || password.length < 12) throw new Error("Configura SUPABASE_URL, SUPABASE_SECRET_KEY y DASHBOARD_PASSWORD (12+ caracteres) en .env.dashboard.local.");
const handle = createDashboardHandler(createSnapshotReader(url, key), password, crypto.randomUUID());
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.DASHBOARD_PORT ?? 3001),
  routes: { "/": dashboard, "/login":dashboard, "/contacts/:id":dashboard },
  fetch: handle,
});
console.log(`Dashboard Supabase · solo lectura · ${server.url}`);
