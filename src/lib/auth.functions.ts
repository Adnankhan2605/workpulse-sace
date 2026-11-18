import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq, or } from "drizzle-orm";

const LoginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your username or email.").max(160),
  password: z.string().min(1, "Enter your password.").max(128),
});

export const loginPortal = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => LoginSchema.parse(raw))
  .handler(async ({ data }) => {
    const { assertRateLimit, getClientIp } = await import("./rate-limit.server.ts");
    const {
      createSignedToken,
      ensurePortalInitialized,
      hashPassword,
      setSessionCookie,
      toPublicUser,
      verifyPasswordHash,
    } = await import("./auth.server.ts");
    const { db } = await import("../db/index.ts");
    const schema = await import("../db/schema.ts");

    const cleanIdentifier = data.identifier.trim().toLowerCase();
    const clientIp = getClientIp();
    assertRateLimit(`login:${clientIp}:${cleanIdentifier}`, {
      limit: 8,
      windowMs: 5 * 60 * 1000,
      message: "Too many failed sign-in attempts. Please wait 5 minutes before retrying.",
    });

    await ensurePortalInitialized();

    const rows = await db
      .select()
      .from(schema.users)
      .where(
        or(
          eq(schema.users.email, cleanIdentifier),
          eq(schema.users.username, cleanIdentifier),
          eq(schema.users.id, data.identifier.trim()),
        ),
      )
      .limit(1);

    const userRow = rows[0];
    if (!userRow) {
      return { ok: false as const, error: "Invalid username/email or password." };
    }

    if (!userRow.active) {
      return { ok: false as const, error: "This account is inactive. Contact your admin." };
    }

    const { valid, needsRehash } = verifyPasswordHash(data.password, userRow.password);
    if (!valid) {
      return { ok: false as const, error: "Invalid username/email or password." };
    }

    // Automatically upgrade any legacy plaintext password to scrypt hash
    if (needsRehash) {
      await db
        .update(schema.users)
        .set({ password: hashPassword(data.password) })
        .where(eq(schema.users.id, userRow.id));
    }

    const sessionToken = createSignedToken(userRow.id);
    setSessionCookie(userRow.id, sessionToken);
    return {
      ok: true as const,
      user: toPublicUser(userRow),
      sessionToken,
    };
  });

export const logoutPortal = createServerFn({ method: "POST" }).handler(async () => {
  const { clearSessionCookie } = await import("./auth.server.ts");
  clearSessionCookie();
  return { ok: true as const };
});

export const getCurrentSession = createServerFn({ method: "GET" }).handler(async () => {
  const { resolveAuthenticatedUser } = await import("./auth.server.ts");
  const auth = await resolveAuthenticatedUser();
  if (!auth) {
    return { authenticated: false as const, user: null };
  }
  return { authenticated: true as const, user: auth.user };
});
