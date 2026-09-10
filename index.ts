import express from "express";
import { waitUntil } from "@vercel/functions";
import { verifyKapsoSignature } from "./src/kapso/verify-signature";
import { processKapsoWebhook } from "./src/webhooks/process-kapso-webhook";

const app = express();

app.get("/", (_request, response) => {
  response.json({ service: "mensajito", status: "ok" });
});

app.get("/health", (_request, response) => {
  response.json({ status: "healthy" });
});

app.post(
  "/webhooks/kapso",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    const rawBody = Buffer.isBuffer(request.body)
      ? request.body
      : Buffer.from(request.body ?? "");
    const signature = request.header("x-webhook-signature");
    const secret = process.env.KAPSO_WEBHOOK_SECRET;

    if (!secret || !verifyKapsoSignature(rawBody, signature, secret)) {
      response.status(401).send("Invalid signature");
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      response.status(400).send("Invalid JSON");
      return;
    }

    const task = processKapsoWebhook({
      payload,
      eventName: request.header("x-webhook-event") ?? "unknown",
      idempotencyKey: request.header("x-idempotency-key") ?? undefined,
    }).catch((error) => {
      console.error("Kapso webhook processing failed", error);
    });

    if (process.env.VERCEL) {
      waitUntil(task);
      response.status(200).send("OK");
      return;
    }

    await task;
    response.status(200).send("OK");
  },
);

app.use(express.json());

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`Mensajito escuchando en http://localhost:${port}`);
  });
}

export default app;
