import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");

  return a.length === b.length && timingSafeEqual(a, b);
}

/** Alias del verificador que ya estaba en GitHub. */
export function verifyKapsoSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  return verifyWebhookSignature(rawBody, signature, secret);
}
