import { createServerFn } from "@tanstack/react-start";
import { DEFAULT_SEED_USERS, createSeedState } from "./seed.ts";
import type { AppState, User } from "./types.ts";

const PORTAL_STATE_ID = "current_state";

export const getDbState = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { eq } = await import("drizzle-orm");
    const { db } = await import("../db/index.ts");
    const schema = await import("../db/schema.ts");

    const records = await db
      .select()
      .from(schema.portalState)
      .where(eq(schema.portalState.id, PORTAL_STATE_ID))
      .limit(1);

    if (records.length > 0 && records[0]?.data) {
      return {
        ok: true,
        data: records[0].data as AppState,
        source: "postgresql",
      };
    }

    // Initialize seed state in PostgreSQL
    const initial = createSeedState();
    await db
      .insert(schema.portalState)
      .values({
        id: PORTAL_STATE_ID,
        data: initial,
      })
      .onConflictDoUpdate({
        target: schema.portalState.id,
        set: {
          data: initial,
          updatedAt: new Date(),
        },
      });

    // Seed default admin in users table
    const adminUser = DEFAULT_SEED_USERS[0];
    if (adminUser) {
      await db
        .insert(schema.users)
        .values({
          id: adminUser.id,
          fullName: adminUser.fullName,
          username: adminUser.username,
          email: adminUser.email,
          password: adminUser.password,
          designation: adminUser.designation,
          department: adminUser.department,
          role: adminUser.role,
          reportingAdminId: adminUser.reportingAdminId,
          active: adminUser.active,
          dailyVision: adminUser.dailyVision,
          avatarColor: adminUser.avatarColor,
          avatarUrl: adminUser.avatarUrl,
          casualBalance: adminUser.casualBalance,
          sickBalance: adminUser.sickBalance,
        })
        .onConflictDoNothing();
    }

    return {
      ok: true,
      data: initial,
      source: "postgresql_seeded",
    };
  } catch (error) {
    console.error("[PostgreSQL] Error loading portal state:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      fallback: createSeedState(),
    };
  }
});

export const saveDbState = createServerFn({ method: "POST" })
  .inputValidator((input: { state: AppState; users: User[] }) => input)
  .handler(async ({ data }) => {
    try {
      const { db } = await import("../db/index.ts");
      const schema = await import("../db/schema.ts");

      const mergedState: AppState = {
        ...data.state,
        users: data.users && data.users.length > 0 ? data.users : data.state.users,
      };

      await db
        .insert(schema.portalState)
        .values({
          id: PORTAL_STATE_ID,
          data: mergedState,
        })
        .onConflictDoUpdate({
          target: schema.portalState.id,
          set: {
            data: mergedState,
            updatedAt: new Date(),
          },
        });

      return { ok: true, timestamp: new Date().toISOString() };
    } catch (error) {
      console.error("[PostgreSQL] Error saving portal state:", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

export const checkPostgresHealth = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { db } = await import("../db/index.ts");
    const schema = await import("../db/schema.ts");

    const userCount = await db.select().from(schema.users);
    return {
      connected: true,
      engine: "PostgreSQL (Cloud SQL)",
      usersCount: userCount.length,
    };
  } catch (error) {
    console.error("[PostgreSQL] Health check error:", error);
    return {
      connected: false,
      engine: "PostgreSQL (Cloud SQL)",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
