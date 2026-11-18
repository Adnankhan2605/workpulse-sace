import { getRequest, getRequestIP } from "@tanstack/react-start/server";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastPrune = Date.now();

function pruneExpired(now: number) {
  if (now - lastPrune < 60_000 && buckets.size < 5000) return;
  lastPrune = now;
  for (const [key, entry] of buckets.entries()) {
    if (entry.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function getClientIp(): string {
  try {
    const ip = getRequestIP({ xForwardedFor: true });
    if (ip) return ip;
    const req = getRequest();
    const fwd = req?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
    return fwd || "unknown";
  } catch {
    return "unknown";
  }
}

export function assertRateLimit(
  key: string,
  options: { limit: number; windowMs: number; message?: string },
): void {
  const now = Date.now();
  pruneExpired(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  if (existing.count >= options.limit) {
    const retrySec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    throw new Error(
      options.message ??
        `Too many requests. Please wait ${retrySec} second${retrySec === 1 ? "" : "s"} before trying again.`,
    );
  }

  existing.count += 1;
}
