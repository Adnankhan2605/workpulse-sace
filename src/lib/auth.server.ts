import crypto from "node:crypto";
import { deleteCookie, getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import * as schema from "../db/schema.ts";
import { DEFAULT_ADMIN_PERMS, createSeedState } from "./seed.ts";
import type { AppState, Perm, Role, User } from "./types.ts";

export const SESSION_COOKIE_NAME = "sace_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const PORTAL_STATE_ID = "current_state";

declare global {
  var _ephemeralSessionSecret: string | undefined;
}

function getSessionSecret(): string {
  const configured = process.env["AUTH_SESSION_SECRET"];
  if (configured && configured.length >= 32) {
    return configured;
  }
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "Server misconfiguration: AUTH_SESSION_SECRET must be set (>= 32 chars) in production.",
    );
  }
  if (!global._ephemeralSessionSecret) {
    global._ephemeralSessionSecret = crypto.randomBytes(32).toString("hex");
  }
  return global._ephemeralSessionSecret;
}

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(plain, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPasswordHash(
  plain: string,
  stored: string,
): {
  valid: boolean;
  needsRehash: boolean;
} {
  if (!plain || !stored) return { valid: false, needsRehash: false };

  if (stored.startsWith("scrypt$")) {
    const parts = stored.split("$");
    if (parts.length !== 3) return { valid: false, needsRehash: false };
    const [, salt, expectedHex] = parts;
    if (!salt || !expectedHex) return { valid: false, needsRehash: false };
    const actualBuf = crypto.scryptSync(plain, salt, 64);
    const expectedBuf = Buffer.from(expectedHex, "hex");
    if (actualBuf.length !== expectedBuf.length) {
      return { valid: false, needsRehash: false };
    }
    return {
      valid: crypto.timingSafeEqual(actualBuf, expectedBuf),
      needsRehash: false,
    };
  }

  // Legacy plaintext migration support (rejects empty stored passwords)
  if (stored.trim().length === 0) return { valid: false, needsRehash: false };
  const a = Buffer.from(plain, "utf8");
  const b = Buffer.from(stored, "utf8");
  if (a.length !== b.length) return { valid: false, needsRehash: false };
  return {
    valid: crypto.timingSafeEqual(a, b),
    needsRehash: true,
  };
}

export function createSignedToken(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const nonce = crypto.randomBytes(12).toString("hex");
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp, nonce })).toString("base64url");
  const sig = crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifySignedToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, providedSig] = parts;
  if (!payload || !providedSig) return null;

  const expectedSig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");

  const a = Buffer.from(providedSig, "utf8");
  const b = Buffer.from(expectedSig, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: unknown;
      exp?: unknown;
    };
    if (typeof decoded.sub !== "string" || typeof decoded.exp !== "number") return null;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded.sub;
  } catch {
    return null;
  }
}

function isHttpsRequest(): boolean {
  const req = getRequest();
  const proto = req?.headers?.get("x-forwarded-proto") ?? "";
  const origin = req?.headers?.get("origin") ?? "";
  return Boolean(
    proto.includes("https") || req?.url?.startsWith("https://") || origin.startsWith("https://"),
  );
}

export function setSessionCookie(userId: string, existingToken?: string): void {
  const token = existingToken ?? createSignedToken(userId);
  const isHttps = isHttpsRequest();
  setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? "none" : "lax",
    secure: isHttps,
    ...(isHttps ? { partitioned: true } : {}),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(): void {
  const isHttps = isHttpsRequest();
  deleteCookie(SESSION_COOKIE_NAME, {
    path: "/",
    sameSite: isHttps ? "none" : "lax",
    secure: isHttps,
  });
}

export function toPublicUser(row: typeof schema.users.$inferSelect): User {
  return {
    id: row.id,
    fullName: row.fullName,
    username: row.username,
    email: row.email,
    password: "", // Never expose credentials or password hashes to client code
    designation: row.designation,
    department: row.department,
    role: (row.role as Role) || "member",
    reportingAdminId: row.reportingAdminId,
    active: row.active,
    dailyVision: row.dailyVision,
    avatarColor: row.avatarColor,
    avatarUrl: row.avatarUrl,
    casualBalance: row.casualBalance,
    sickBalance: row.sickBalance,
  };
}

export function stripCredentialsFromUsers(list: User[]): User[] {
  return list.map((u) => ({ ...u, password: "" }));
}

export async function ensurePortalInitialized(): Promise<void> {
  const existingUsers = await db.select().from(schema.users).limit(1);
  if (existingUsers.length === 0) {
    const seedPassword = process.env["SEED_DEFAULT_PASSWORD"];
    if (seedPassword && seedPassword.length >= 8) {
      const hashed = hashPassword(seedPassword);
      const seedState = createSeedState();
      for (const u of seedState.users) {
        await db
          .insert(schema.users)
          .values({
            id: u.id,
            fullName: u.fullName,
            username: u.username,
            email: u.email,
            password: hashed,
            designation: u.designation,
            department: u.department,
            role: u.role,
            reportingAdminId: u.reportingAdminId,
            active: u.active,
            dailyVision: u.dailyVision,
            avatarColor: u.avatarColor,
            avatarUrl: u.avatarUrl ?? null,
            casualBalance: u.casualBalance,
            sickBalance: u.sickBalance,
          })
          .onConflictDoNothing();
      }
    }
  }

  const existingState = await db
    .select({ id: schema.portalState.id })
    .from(schema.portalState)
    .where(eq(schema.portalState.id, PORTAL_STATE_ID))
    .limit(1);

  if (existingState.length === 0) {
    const initial = createSeedState();
    initial.users = stripCredentialsFromUsers(initial.users);
    await db
      .insert(schema.portalState)
      .values({ id: PORTAL_STATE_ID, data: initial })
      .onConflictDoNothing();
  }
}

export async function getAdminPermsFromState(): Promise<Perm[]> {
  const rows = await db
    .select({ data: schema.portalState.data })
    .from(schema.portalState)
    .where(eq(schema.portalState.id, PORTAL_STATE_ID))
    .limit(1);
  const state = rows[0]?.data as Partial<AppState> | undefined;
  return Array.isArray(state?.adminPerms) ? state.adminPerms : DEFAULT_ADMIN_PERMS;
}

export async function resolveAuthenticatedUser(): Promise<{
  userId: string;
  role: Role;
  user: User;
} | null> {
  const req = getRequest();
  const sessionHeader = req?.headers?.get("x-sace-session")?.trim() ?? "";

  // 1. Check signed HttpOnly portal session cookie OR x-sace-session signed header
  const candidateToken = getCookie(SESSION_COOKIE_NAME) || sessionHeader;
  if (candidateToken) {
    const sub = verifySignedToken(candidateToken);
    if (sub) {
      const rows = await db.select().from(schema.users).where(eq(schema.users.id, sub)).limit(1);
      const userRow = rows[0];
      if (userRow && userRow.active) {
        return {
          userId: userRow.id,
          role: (userRow.role as Role) || "member",
          user: toPublicUser(userRow),
        };
      }
    }
  }

  // 2. Optionally verify Bearer JWT via Supabase if configured
  const supaUrl = process.env["SUPABASE_URL"];
  const supaKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (supaUrl && supaKey) {
    const req = getRequest();
    const authHeader = req?.headers?.get("authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length).trim();
      if (token && token.split(".").length === 3) {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supaUrl, supaKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data, error } = await supabase.auth.getUser(token);
        if (!error && data?.user?.id) {
          const rows = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.id, data.user.id))
            .limit(1);
          const userRow = rows[0];
          if (userRow && userRow.active) {
            return {
              userId: userRow.id,
              role: (userRow.role as Role) || "member",
              user: toPublicUser(userRow),
            };
          }
        }
      }
    }
  }

  return null;
}
