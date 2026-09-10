import { createSnapshotReader } from "../src/dashboard-data.js";
import { createDashboardHandler } from "../src/dashboard-http.js";

let handler: ReturnType<typeof createDashboardHandler> | undefined;
export default {
  async fetch(request: Request): Promise<Response> {
    if (!handler) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SECRET_KEY;
      const password = process.env.DASHBOARD_PASSWORD;
      const secret = process.env.DASHBOARD_SECRET;
      if (!url || !key || !password || password.length < 12 || !secret || secret.length < 32) {
        return Response.json({ error:"Falta configurar la conexión segura del dashboard." }, { status:503, headers:{ "Cache-Control":"no-store" } });
      }
      handler = createDashboardHandler(createSnapshotReader(url, key), password, secret);
    }
    return handler(request);
  },
};
