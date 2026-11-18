import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePortalAuth } from "./portal-auth.middleware.ts";
import { PASSWORD_POLICY_ERROR, isSafeImageSrc, isStrongPassword } from "./security.ts";
import type { AppState, Perm } from "./types.ts";

const PORTAL_STATE_ID = "current_state";

const ALL_VALID_PERMS = [
  "manage_users",
  "manage_admins",
  "approve_leave",
  "upload_leads",
  "view_all_tickets",
  "view_reports",
  "view_all_eod",
  "manage_recognition",
  "manage_holidays",
  "system_settings",
] as const satisfies readonly Perm[];

const CreateAccountSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(160),
  password: z
    .string()
    .min(12, PASSWORD_POLICY_ERROR)
    .max(128)
    .refine(isStrongPassword, { message: PASSWORD_POLICY_ERROR }),
  designation: z.string().trim().min(1).max(100),
  department: z.string().trim().min(1).max(100),
  role: z.enum(["super_admin", "admin", "member"]),
  reportingAdminId: z.string().max(64).nullable(),
  avatarColor: z.string().trim().min(1).max(48),
});

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;

const SaveAccountSchema = z.object({
  userId: z.string().trim().min(1).max(64),
  fullName: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().max(160).optional(),
  designation: z.string().trim().min(1).max(100).optional(),
  department: z.string().trim().min(1).max(100).optional(),
  dailyVision: z.string().max(400).nullable().optional(),
  avatarUrl: z
    .string()
    .max(600_000)
    .refine((val) => isSafeImageSrc(val), { message: "Invalid avatar image URL." })
    .nullable()
    .optional(),
  reportingAdminId: z.string().max(64).nullable().optional(),
  casualBalance: z.number().int().min(0).max(365).optional(),
  sickBalance: z.number().int().min(0).max(365).optional(),
  active: z.boolean().optional(),
  role: z.enum(["super_admin", "admin", "member"]).optional(),
  password: z
    .string()
    .min(12, PASSWORD_POLICY_ERROR)
    .max(128)
    .refine(isStrongPassword, { message: PASSWORD_POLICY_ERROR })
    .optional(),
});

export type SaveAccountInput = z.infer<typeof SaveAccountSchema>;

const DeleteAccountSchema = z.object({
  userId: z.string().trim().min(1).max(64),
});

const SaveAdminPermsSchema = z.object({
  perms: z.array(z.enum(ALL_VALID_PERMS)).max(ALL_VALID_PERMS.length),
});

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requirePortalAuth])
  .inputValidator((raw: unknown) => CreateAccountSchema.parse(raw))
  .handler(async ({ data, context }) => {
    if (context.role !== "super_admin") {
      throw new Error("Forbidden: Only a Super Admin can create accounts.");
    }

    const { assertRateLimit } = await import("./rate-limit.server.ts");
    assertRateLimit(`accounts:${context.userId}`, { limit: 30, windowMs: 60_000 });

    const { eq } = await import("drizzle-orm");
    const crypto = await import("node:crypto");
    const { db } = await import("../db/index.ts");
    const schema = await import("../db/schema.ts");
    const { hashPassword } = await import("./auth.server.ts");
    const { hasSupabaseAdminConfig } = await import("@/integrations/supabase/client.server");

    const email = data.email.trim().toLowerCase();
    const existingEmail = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (existingEmail.length > 0) {
      throw new Error("An account with this email already exists.");
    }

    const base = (email.split("@")[0] ?? "user").replace(/[^a-z0-9._-]/g, "") || "user";
    let username = base;
    for (let i = 1; i < 50; i += 1) {
      const taken = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.username, username))
        .limit(1);
      if (taken.length === 0) break;
      username = `${base}${i}`;
    }

    let id = `u-${crypto.randomUUID().slice(0, 12)}`;

    if (hasSupabaseAdminConfig()) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        throw new Error(created.error?.message ?? "Could not create the sign-in account.");
      }
      id = created.data.user.id;

      await supabaseAdmin.from("profiles").insert({
        id,
        email,
        username,
        full_name: data.fullName.trim(),
        designation: data.designation.trim() || "Team Member",
        department: data.department.trim() || "General",
        reporting_admin_id: data.reportingAdminId,
        avatar_color: data.avatarColor,
        active: true,
      } as never);
      await supabaseAdmin.from("user_roles").insert({ user_id: id, role: data.role });
    }

    await db.insert(schema.users).values({
      id,
      fullName: data.fullName.trim(),
      username,
      email,
      password: hashPassword(data.password),
      designation: data.designation.trim() || "Team Member",
      department: data.department.trim() || "General",
      role: data.role,
      reportingAdminId: data.reportingAdminId,
      active: true,
      dailyVision: null,
      avatarColor: data.avatarColor,
      avatarUrl: null,
      casualBalance: 12,
      sickBalance: 8,
    });

    return { id, username, email };
  });

export const saveAccount = createServerFn({ method: "POST" })
  .middleware([requirePortalAuth])
  .inputValidator((raw: unknown) => SaveAccountSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { assertRateLimit } = await import("./rate-limit.server.ts");
    assertRateLimit(`accounts:${context.userId}`, { limit: 60, windowMs: 60_000 });

    const isSuperAdmin = context.role === "super_admin";
    const isAdmin = context.role === "admin";
    const isSelf = data.userId === context.userId;

    if (!isSuperAdmin && !isSelf && !isAdmin) {
      throw new Error("Forbidden: You can only edit your own profile.");
    }

    // Privilege escalation guard: non-super-admins cannot modify roles, active status,
    // reporting lines, leave balances, or another user's password/profile (except admins approving leave balances for reports).
    if (!isSuperAdmin) {
      if (
        data.role !== undefined ||
        data.active !== undefined ||
        data.reportingAdminId !== undefined
      ) {
        throw new Error(
          "Forbidden: Only a Super Admin can change roles, status, or reporting lines.",
        );
      }
      if (!isSelf) {
        // Admins may only update casualBalance/sickBalance on leave approval, nothing else on another account
        const onlyBalanceChange =
          data.fullName === undefined &&
          data.email === undefined &&
          data.designation === undefined &&
          data.department === undefined &&
          data.dailyVision === undefined &&
          data.avatarUrl === undefined &&
          data.password === undefined;
        if (!isAdmin || !onlyBalanceChange) {
          throw new Error("Forbidden: Insufficient permissions to modify another user's account.");
        }
      } else if (data.casualBalance !== undefined || data.sickBalance !== undefined) {
        throw new Error("Forbidden: You cannot modify your own leave balances.");
      }
    }

    const { eq } = await import("drizzle-orm");
    const { db } = await import("../db/index.ts");
    const schema = await import("../db/schema.ts");
    const { hashPassword } = await import("./auth.server.ts");
    const { hasSupabaseAdminConfig } = await import("@/integrations/supabase/client.server");

    const dbPatch: Partial<typeof schema.users.$inferInsert> = {};
    if (data.fullName !== undefined) dbPatch.fullName = data.fullName.trim();
    if (data.email !== undefined) dbPatch.email = data.email.trim().toLowerCase();
    if (data.designation !== undefined) dbPatch.designation = data.designation.trim();
    if (data.department !== undefined) dbPatch.department = data.department.trim();
    if (data.dailyVision !== undefined) dbPatch.dailyVision = data.dailyVision;
    if (data.avatarUrl !== undefined) dbPatch.avatarUrl = data.avatarUrl;
    if (data.reportingAdminId !== undefined) dbPatch.reportingAdminId = data.reportingAdminId;
    if (data.casualBalance !== undefined) dbPatch.casualBalance = data.casualBalance;
    if (data.sickBalance !== undefined) dbPatch.sickBalance = data.sickBalance;
    if (data.active !== undefined) dbPatch.active = data.active;
    if (data.role !== undefined) dbPatch.role = data.role;
    if (data.password !== undefined) dbPatch.password = hashPassword(data.password);

    if (Object.keys(dbPatch).length > 0) {
      await db.update(schema.users).set(dbPatch).where(eq(schema.users.id, data.userId));
    }

    if (hasSupabaseAdminConfig()) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const patch: Record<string, unknown> = {};
      if (data.fullName !== undefined) patch["full_name"] = data.fullName.trim();
      if (data.email !== undefined) patch["email"] = data.email.trim().toLowerCase();
      if (data.designation !== undefined) patch["designation"] = data.designation.trim();
      if (data.department !== undefined) patch["department"] = data.department.trim();
      if (data.dailyVision !== undefined) patch["daily_vision"] = data.dailyVision;
      if (data.avatarUrl !== undefined) patch["avatar_url"] = data.avatarUrl;
      if (data.reportingAdminId !== undefined) patch["reporting_admin_id"] = data.reportingAdminId;
      if (data.casualBalance !== undefined) patch["casual_balance"] = data.casualBalance;
      if (data.sickBalance !== undefined) patch["sick_balance"] = data.sickBalance;
      if (data.active !== undefined) patch["active"] = data.active;

      if (Object.keys(patch).length > 0) {
        patch["updated_at"] = new Date().toISOString();
        await supabaseAdmin
          .from("profiles")
          .update(patch as never)
          .eq("id", data.userId);
      }
      if (data.role) {
        await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
        await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
      }
      if (data.password) {
        await supabaseAdmin.auth.admin.updateUserById(data.userId, {
          password: data.password,
          ...(data.email !== undefined ? { email: data.email.trim().toLowerCase() } : {}),
        });
      }
    }

    return { ok: true as const };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requirePortalAuth])
  .inputValidator((raw: unknown) => DeleteAccountSchema.parse(raw))
  .handler(async ({ data, context }) => {
    if (context.role !== "super_admin") {
      throw new Error("Forbidden: Only a Super Admin can delete an account.");
    }
    if (data.userId === context.userId || data.userId === "u-hakeem") {
      throw new Error("You cannot delete your own or the primary Super Admin account.");
    }

    const { eq } = await import("drizzle-orm");
    const { db } = await import("../db/index.ts");
    const schema = await import("../db/schema.ts");
    const { hasSupabaseAdminConfig } = await import("@/integrations/supabase/client.server");

    await db.delete(schema.users).where(eq(schema.users.id, data.userId));
    await db
      .update(schema.users)
      .set({ reportingAdminId: null })
      .where(eq(schema.users.reportingAdminId, data.userId));

    if (hasSupabaseAdminConfig()) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
      await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
      try {
        await supabaseAdmin.auth.admin.deleteUser(data.userId);
      } catch {
        /* ignore if missing in Supabase Auth */
      }
    }

    return { ok: true as const };
  });

export const saveAdminPerms = createServerFn({ method: "POST" })
  .middleware([requirePortalAuth])
  .inputValidator((raw: unknown) => SaveAdminPermsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    if (context.role !== "super_admin") {
      throw new Error("Forbidden: Only a Super Admin can change admin permissions.");
    }

    const sanitizedPerms = data.perms.filter((p) => p !== "manage_admins");

    const { eq } = await import("drizzle-orm");
    const { db } = await import("../db/index.ts");
    const schema = await import("../db/schema.ts");
    const { hasSupabaseAdminConfig } = await import("@/integrations/supabase/client.server");

    const rows = await db
      .select()
      .from(schema.portalState)
      .where(eq(schema.portalState.id, PORTAL_STATE_ID))
      .limit(1);

    if (rows[0]?.data) {
      const current = rows[0].data as AppState;
      await db
        .update(schema.portalState)
        .set({
          data: { ...current, adminPerms: sanitizedPerms },
          updatedAt: new Date(),
        })
        .where(eq(schema.portalState.id, PORTAL_STATE_ID));
    }

    if (hasSupabaseAdminConfig()) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("app_settings")
        .upsert({ key: "admin_perms", value: sanitizedPerms }, { onConflict: "key" });
    }

    return { ok: true as const };
  });
