import crypto from "node:crypto";

export function createIdempotencyKey(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createVpnEmail(telegramId: bigint, telegramUsername?: string | null): string {
  const normalizedUsername = (telegramUsername ?? "")
    .trim()
    .replace(/^@/, "")
    .replace(/[^a-zA-Z0-9_.-]/g, "_");

  if (normalizedUsername.length > 0) {
    return `${normalizedUsername}_${telegramId.toString()}`;
  }

  return `tg_${telegramId}`;
}

export function createSubscriptionToken(): string {
  return crypto.randomBytes(8).toString("hex");
}
