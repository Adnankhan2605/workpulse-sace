import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePortalAuth } from "./portal-auth.middleware.ts";
import { isSafeImageSrc, sanitizeExternalUrl } from "./security.ts";
import { DEFAULT_OFFICE_GEOFENCE, evaluateGeofence } from "./geofence.ts";
import type {
  AppNotification,
  AppState,
  AttendanceRecord,
  AuditLog,
  CompanyHoliday,
  Conversation,
  EodReport,
  LeadDataset,
  LeaveRequest,
  Message,
  MonthlyReview,
  OfficeGeofenceConfig,
  Perm,
  RecognitionAward,
  Task,
  Ticket,
  User,
  VaultItem,
} from "./types.ts";

const PORTAL_STATE_ID = "current_state";

const TaskProofSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(["image", "file", "link", "text"]),
  value: z
    .string()
    .min(1)
    .max(750_000)
    .refine(
      (val) => {
        if (val.startsWith("data:")) return isSafeImageSrc(val);
        return true;
      },
      { message: "Invalid proof image encoding or unsupported data URI." },
    ),
  note: z.string().max(1000),
  submittedAt: z.string().max(64),
});

const SaveStateSchema = z.object({
  state: z.object({
    attendance: z.array(z.custom<AttendanceRecord>()).max(10_000),
    tasks: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          title: z.string().min(1).max(240),
          description: z.string().max(4000),
          assigneeId: z.string().min(1).max(64),
          assignedById: z.string().min(1).max(64),
          priority: z.enum(["low", "medium", "high", "urgent"]),
          status: z.enum([
            "assigned",
            "in_progress",
            "submitted",
            "revision_requested",
            "rejected",
            "approved",
            "completed",
          ]),
          cadence: z.enum(["today", "weekly", "monthly", "quarterly"]),
          startDate: z.string().max(32),
          dueDate: z.string().max(32),
          requiredProof: z.enum(["image", "file", "link", "any"]),
          proofs: z
            .array(TaskProofSchema)
            .max(20)
            .superRefine((proofs, ctx) => {
              for (const p of proofs) {
                if (p.type === "link" && !sanitizeExternalUrl(p.value)) {
                  ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Link proofs must use a valid http:// or https:// URL.",
                  });
                }
              }
            }),
          comments: z.array(z.any()).max(200),
        }),
      )
      .max(5000),
    leaves: z.array(z.custom<LeaveRequest>()).max(5000),
    leads: z.array(z.custom<LeadDataset>()).max(2000),
    conversations: z.array(z.custom<Conversation>()).max(1000),
    messages: z.array(z.custom<Message>()).max(20_000),
    tickets: z.array(z.custom<Ticket>()).max(5000),
    awards: z.array(z.custom<RecognitionAward>()).max(2000),
    notifications: z.array(z.custom<AppNotification>()).max(10_000),
    audit: z.array(z.custom<AuditLog>()).max(10_000),
    eodReports: z.array(z.custom<EodReport>()).max(10_000),
    holidays: z.array(z.custom<CompanyHoliday>()).max(500),
    monthlyReviews: z.array(z.custom<MonthlyReview>()).max(5000),
    vaultItems: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          title: z.string().min(1).max(160),
          category: z.enum(["Passwords", "Secrets", "Credentials", "Small Text"]),
          creatorId: z.string().min(1).max(64),
          recipientId: z.string().max(64).nullable(),
          visibility: z.enum(["close", "open"]),
          passwordProtected: z.boolean(),
          encryptedPayload: z.string().min(1).max(64_000),
          iv: z.string().min(8).max(256),
          salt: z.string().min(8).max(256),
          checkedByRecipient: z.boolean(),
          createdAt: z.string().max(64),
          unlockedAt: z.string().max(64).nullable().optional(),
        }),
      )
      .max(2000),
    ticketSeq: z.number().int().min(1).max(1_000_000),
  }),
});

function scopeStateForCaller(
  fullState: AppState,
  allUsers: User[],
  callerId: string,
  callerRole: User["role"],
): AppState {
  const isSuperAdmin = callerRole === "super_admin";
  const isAdmin = callerRole === "admin";
  const isPrivileged = isSuperAdmin || isAdmin;

  const teamIds = new Set<string>([callerId]);
  if (isSuperAdmin) {
    for (const u of allUsers) teamIds.add(u.id);
  } else if (isAdmin) {
    for (const u of allUsers) {
      if (u.reportingAdminId === callerId || u.id === callerId) {
        teamIds.add(u.id);
      }
    }
  }

  // Strip sensitive personal fields on non-team / peer user records for regular members
  const scopedUsers: User[] = allUsers.map((u) => {
    if (isSuperAdmin || u.id === callerId || (isAdmin && teamIds.has(u.id))) {
      return { ...u, dailyVision: u.id === callerId || isSuperAdmin ? u.dailyVision : null };
    }
    return {
      ...u,
      dailyVision: null,
      casualBalance: 0,
      sickBalance: 0,
    };
  });

  const allowedConvIds = new Set<string>();
  const scopedConversations = (fullState.conversations ?? []).filter((c) => {
    const allowed = c.kind === "announcement" || c.participantIds?.includes(callerId);
    if (allowed) allowedConvIds.add(c.id);
    return allowed;
  });

  const scopedMessages = (fullState.messages ?? []).filter((m) =>
    allowedConvIds.has(m.conversationId),
  );

  const scopedVaults: VaultItem[] = (fullState.vaultItems ?? [])
    .filter((v) => v.creatorId === callerId || v.recipientId === callerId)
    .map((v) => ({
      id: v.id,
      title: v.title,
      category: v.category,
      creatorId: v.creatorId,
      recipientId: v.recipientId,
      visibility: v.visibility,
      passwordProtected: v.passwordProtected,
      encryptedPayload: v.encryptedPayload,
      iv: v.iv,
      salt: v.salt,
      checkedByRecipient: v.checkedByRecipient,
      createdAt: v.createdAt,
      unlockedAt: v.unlockedAt ?? null,
    }));

  const scopedTickets: Ticket[] = (fullState.tickets ?? [])
    .filter((t) => isPrivileged || t.createdById === callerId)
    .map((t) => ({
      ...t,
      comments: isPrivileged ? t.comments : (t.comments ?? []).filter((c) => !c.internal),
    }));

  return {
    users: scopedUsers,
    attendance: (fullState.attendance ?? []).filter((a) => teamIds.has(a.userId)),
    tasks: (fullState.tasks ?? []).filter(
      (t) => isSuperAdmin || teamIds.has(t.assigneeId) || t.assignedById === callerId,
    ),
    leaves: (fullState.leaves ?? []).filter((l) => teamIds.has(l.userId)),
    leads: (fullState.leads ?? []).filter((l) => isPrivileged || l.visibility === "public"),
    conversations: scopedConversations,
    messages: scopedMessages,
    tickets: scopedTickets,
    awards: fullState.awards ?? [],
    notifications: (fullState.notifications ?? []).filter((n) => n.userId === callerId),
    audit: isSuperAdmin
      ? (fullState.audit ?? [])
      : isAdmin
        ? (fullState.audit ?? []).filter((a) => teamIds.has(a.actorId))
        : [],
    eodReports: (fullState.eodReports ?? []).filter((r) => teamIds.has(r.userId)),
    holidays: fullState.holidays ?? [],
    monthlyReviews: (fullState.monthlyReviews ?? []).filter((r) => teamIds.has(r.userId)),
    vaultItems: scopedVaults,
    officeGeofence: fullState.officeGeofence ?? { ...DEFAULT_OFFICE_GEOFENCE },
    ticketSeq: fullState.ticketSeq ?? 1000,
    sessionUserId: callerId,
    adminPerms: fullState.adminPerms ?? [],
  };
}

export const getScopedPortalState = createServerFn({ method: "GET" })
  .middleware([requirePortalAuth])
  .handler(async ({ context }) => {
    const { eq } = await import("drizzle-orm");
    const { db } = await import("../db/index.ts");
    const schema = await import("../db/schema.ts");
    const { ensurePortalInitialized, toPublicUser } = await import("./auth.server.ts");
    const { createSeedState } = await import("./seed.ts");

    await ensurePortalInitialized();

    const [stateRows, userRows] = await Promise.all([
      db
        .select()
        .from(schema.portalState)
        .where(eq(schema.portalState.id, PORTAL_STATE_ID))
        .limit(1),
      db.select().from(schema.users),
    ]);

    const rawState = (stateRows[0]?.data as AppState | undefined) ?? createSeedState();
    const publicUsers = userRows.map(toPublicUser);

    return {
      ok: true as const,
      data: scopeStateForCaller(rawState, publicUsers, context.userId, context.role),
      source: "postgresql",
    };
  });

export const saveScopedPortalState = createServerFn({ method: "POST" })
  .middleware([requirePortalAuth])
  .inputValidator((input: unknown) => SaveStateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertRateLimit } = await import("./rate-limit.server.ts");
    assertRateLimit(`save-state:${context.userId}`, { limit: 90, windowMs: 60_000 });

    const { eq } = await import("drizzle-orm");
    const { db } = await import("../db/index.ts");
    const schema = await import("../db/schema.ts");
    const { ensurePortalInitialized, stripCredentialsFromUsers, toPublicUser } =
      await import("./auth.server.ts");
    const { createSeedState } = await import("./seed.ts");

    await ensurePortalInitialized();

    const [stateRows, userRows] = await Promise.all([
      db
        .select()
        .from(schema.portalState)
        .where(eq(schema.portalState.id, PORTAL_STATE_ID))
        .limit(1),
      db.select().from(schema.users),
    ]);

    const existing = (stateRows[0]?.data as AppState | undefined) ?? createSeedState();
    const publicUsers = userRows.map(toPublicUser);
    const isSuperAdmin = context.role === "super_admin";
    const isAdmin = context.role === "admin";
    const isPrivileged = isSuperAdmin || isAdmin;
    const callerId = context.userId;

    const incoming = data.state;

    // 1. Vault items: caller may only insert/update/delete items they created or mark received items checked
    const incomingVaultMap = new Map(incoming.vaultItems.map((v) => [v.id, v]));
    const mergedVaults: VaultItem[] = [];
    const handledVaultIds = new Set<string>();

    for (const prevV of existing.vaultItems ?? []) {
      const nextV = incomingVaultMap.get(prevV.id);
      if (prevV.creatorId === callerId) {
        // Creator controls existence/updates of their own items
        if (nextV) {
          handledVaultIds.add(prevV.id);
          mergedVaults.push({ ...nextV, creatorId: callerId });
        }
      } else if (prevV.recipientId === callerId) {
        // Recipient may only update checkedByRecipient / unlockedAt (not ciphertext)
        handledVaultIds.add(prevV.id);
        mergedVaults.push({
          ...prevV,
          checkedByRecipient: nextV?.checkedByRecipient ?? prevV.checkedByRecipient,
          unlockedAt: nextV?.unlockedAt ?? prevV.unlockedAt ?? null,
        });
      } else {
        // Unrelated user's vault stays untouched on server
        handledVaultIds.add(prevV.id);
        mergedVaults.push(prevV);
      }
    }
    for (const nextV of incoming.vaultItems) {
      if (!handledVaultIds.has(nextV.id) && nextV.creatorId === callerId) {
        mergedVaults.push({ ...nextV, creatorId: callerId });
      }
    }

    // 2. Tasks: members cannot self-approve or modify other users' tasks
    const incomingTaskMap = new Map(incoming.tasks.map((t) => [t.id, t]));
    const mergedTasks: Task[] = [];
    const handledTaskIds = new Set<string>();

    for (const prevT of existing.tasks ?? []) {
      const nextT = incomingTaskMap.get(prevT.id);
      if (isPrivileged) {
        if (nextT) {
          handledTaskIds.add(prevT.id);
          mergedTasks.push(nextT as Task);
        }
      } else if (prevT.assigneeId === callerId || prevT.assignedById === callerId) {
        handledTaskIds.add(prevT.id);
        if (nextT) {
          const forbiddenSelfReview =
            (nextT.status === "approved" || nextT.status === "rejected") &&
            prevT.status !== nextT.status;
          mergedTasks.push({
            ...(nextT as Task),
            assigneeId: prevT.assigneeId,
            assignedById: prevT.assignedById,
            status: forbiddenSelfReview ? prevT.status : nextT.status,
          });
        }
      } else {
        handledTaskIds.add(prevT.id);
        mergedTasks.push(prevT);
      }
    }
    for (const nextT of incoming.tasks) {
      if (!handledTaskIds.has(nextT.id)) {
        if (isPrivileged || nextT.assigneeId === callerId) {
          mergedTasks.push({
            ...(nextT as Task),
            assignedById: isPrivileged ? nextT.assignedById : callerId,
            status:
              !isPrivileged && (nextT.status === "approved" || nextT.status === "rejected")
                ? "assigned"
                : nextT.status,
          });
        }
      }
    }

    // 3. Leaves: members cannot self-approve/reject
    const incomingLeaveMap = new Map(incoming.leaves.map((l) => [l.id, l]));
    const mergedLeaves: LeaveRequest[] = [];
    const handledLeaveIds = new Set<string>();
    for (const prevL of existing.leaves ?? []) {
      const nextL = incomingLeaveMap.get(prevL.id);
      if (isPrivileged) {
        if (nextL) {
          handledLeaveIds.add(prevL.id);
          mergedLeaves.push(nextL);
        }
      } else if (prevL.userId === callerId) {
        handledLeaveIds.add(prevL.id);
        mergedLeaves.push(nextL ? { ...nextL, userId: callerId, status: prevL.status } : prevL);
      } else {
        handledLeaveIds.add(prevL.id);
        mergedLeaves.push(prevL);
      }
    }
    for (const nextL of incoming.leaves) {
      if (!handledLeaveIds.has(nextL.id) && (isPrivileged || nextL.userId === callerId)) {
        mergedLeaves.push({
          ...nextL,
          userId: isPrivileged ? nextL.userId : callerId,
          status: isPrivileged ? nextL.status : "pending",
        });
      }
    }

    // 4. Attendance / EOD / Reviews: members only mutate their own records
    const mergeUserOwned = <T extends { id: string; userId: string }>(
      prevList: T[],
      nextList: T[],
    ): T[] => {
      if (isPrivileged) return nextList;
      const nextMap = new Map(nextList.map((x) => [x.id, x]));
      const out: T[] = [];
      const seen = new Set<string>();
      for (const prev of prevList) {
        if (prev.userId === callerId) {
          const updated = nextMap.get(prev.id);
          if (updated) {
            seen.add(prev.id);
            out.push({ ...updated, userId: callerId });
          }
        } else {
          seen.add(prev.id);
          out.push(prev);
        }
      }
      for (const item of nextList) {
        if (!seen.has(item.id) && item.userId === callerId) {
          out.push({ ...item, userId: callerId });
        }
      }
      return out;
    };

    // 5. Conversations & Messages: enforce membership
    const allowedConvIds = new Set<string>();
    const mergedConvs: Conversation[] = isPrivileged
      ? incoming.conversations
      : [
          ...(existing.conversations ?? []).filter(
            (c) => c.kind !== "announcement" && !c.participantIds?.includes(callerId),
          ),
          ...incoming.conversations.filter(
            (c) => c.kind === "announcement" || c.participantIds?.includes(callerId),
          ),
        ];
    for (const c of mergedConvs) {
      if (c.kind === "announcement" || c.participantIds?.includes(callerId)) {
        allowedConvIds.add(c.id);
      }
    }

    const existingMsgMap = new Map((existing.messages ?? []).map((m) => [m.id, m]));
    const mergedMessages: Message[] = [
      ...(existing.messages ?? []).filter((m) => !allowedConvIds.has(m.conversationId)),
      ...incoming.messages.filter((m) => {
        if (!allowedConvIds.has(m.conversationId)) return false;
        const prev = existingMsgMap.get(m.id);
        return prev ? true : m.senderId === callerId;
      }),
    ];

    // 6. Tickets: preserve hidden internal comments & other users' tickets for members
    const mergedTickets: Ticket[] = isPrivileged
      ? incoming.tickets
      : [
          ...(existing.tickets ?? []).filter((t) => t.createdById !== callerId),
          ...incoming.tickets
            .filter((t) => t.createdById === callerId)
            .map((t) => {
              const prev = (existing.tickets ?? []).find((x) => x.id === t.id);
              const existingInternals = (prev?.comments ?? []).filter((c) => c.internal);
              const publicComments = (t.comments ?? []).filter((c) => !c.internal);
              return {
                ...t,
                createdById: callerId,
                comments: [...publicComments, ...existingInternals],
              };
            }),
        ];

    // 7. Notifications: caller can modify their own notifications and append new outgoing ones
    const existingNotifIds = new Set((existing.notifications ?? []).map((n) => n.id));
    const incomingNotifMap = new Map(incoming.notifications.map((n) => [n.id, n]));
    const mergedNotifications: AppNotification[] = [];
    for (const prevN of existing.notifications ?? []) {
      if (prevN.userId === callerId) {
        const updated = incomingNotifMap.get(prevN.id);
        if (updated) mergedNotifications.push(updated);
      } else {
        mergedNotifications.push(prevN);
      }
    }
    for (const nextN of incoming.notifications) {
      if (!existingNotifIds.has(nextN.id)) {
        mergedNotifications.push(nextN);
      }
    }

    // 8. Audit: append-only for non-super-admins
    const existingAuditIds = new Set((existing.audit ?? []).map((a) => a.id));
    const newAuditEntries = incoming.audit.filter(
      (a) => !existingAuditIds.has(a.id) && a.actorId === callerId,
    );
    const mergedAudit: AuditLog[] = isSuperAdmin
      ? incoming.audit
      : [...newAuditEntries, ...(existing.audit ?? [])].slice(0, 5000);

    const adminPerms: Perm[] = existing.adminPerms ?? [];
    const activeGeofence: OfficeGeofenceConfig = existing.officeGeofence ?? {
      ...DEFAULT_OFFICE_GEOFENCE,
    };

    // Protect attendance punchIn and geofence audit metadata from client-side tampering
    const mergedAttendance: AttendanceRecord[] = (() => {
      if (isPrivileged) return incoming.attendance;
      const prevMap = new Map((existing.attendance ?? []).map((a) => [a.id, a]));
      const nextMap = new Map(incoming.attendance.map((a) => [a.id, a]));
      const out: AttendanceRecord[] = [];
      const seen = new Set<string>();

      for (const prev of existing.attendance ?? []) {
        seen.add(prev.id);
        if (prev.userId !== callerId) {
          out.push(prev);
          continue;
        }
        const updated = nextMap.get(prev.id);
        if (!updated) continue;
        out.push({
          ...updated,
          userId: callerId,
          // Preserve server-verified punchIn and geofence fields once recorded
          punchIn: prev.punchIn ?? (activeGeofence.enabled ? null : updated.punchIn),
          punchInLatitude: prev.punchInLatitude ?? null,
          punchInLongitude: prev.punchInLongitude ?? null,
          punchInDistanceMeters: prev.punchInDistanceMeters ?? null,
          ...(prev.geofenceStatus ? { geofenceStatus: prev.geofenceStatus } : {}),
        });
      }

      for (const item of incoming.attendance) {
        if (seen.has(item.id) || item.userId !== callerId) continue;
        // When geofencing is enabled, new punchIn records must go through punchInWithGeofence
        if (activeGeofence.enabled && item.punchIn) continue;
        const prevSame = prevMap.get(item.id);
        if (!prevSame) {
          out.push({ ...item, userId: callerId });
        }
      }
      return out;
    })();

    const nextState: AppState = {
      users: stripCredentialsFromUsers(publicUsers),
      attendance: mergedAttendance,
      tasks: mergedTasks,
      leaves: mergedLeaves,
      leads: isPrivileged ? incoming.leads : (existing.leads ?? []),
      conversations: mergedConvs,
      messages: mergedMessages,
      tickets: mergedTickets,
      awards: isPrivileged ? incoming.awards : (existing.awards ?? []),
      notifications: mergedNotifications,
      audit: mergedAudit,
      eodReports: mergeUserOwned(existing.eodReports ?? [], incoming.eodReports),
      holidays: isPrivileged ? incoming.holidays : (existing.holidays ?? []),
      monthlyReviews: mergeUserOwned(existing.monthlyReviews ?? [], incoming.monthlyReviews),
      vaultItems: mergedVaults,
      officeGeofence: activeGeofence,
      ticketSeq: Math.max(existing.ticketSeq ?? 1000, incoming.ticketSeq),
      sessionUserId: null, // Never persist active session ID in shared DB blob
      adminPerms,
    };

    await db
      .insert(schema.portalState)
      .values({
        id: PORTAL_STATE_ID,
        data: nextState,
      })
      .onConflictDoUpdate({
        target: schema.portalState.id,
        set: {
          data: nextState,
          updatedAt: new Date(),
        },
      });

    return { ok: true as const, timestamp: new Date().toISOString() };
  });

const OfficeGeofenceSchema = z.object({
  enabled: z.boolean(),
  officeName: z.string().trim().min(1).max(120),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  radiusMeters: z.number().finite().min(10).max(50_000),
});

export const saveOfficeGeofenceConfig = createServerFn({ method: "POST" })
  .middleware([requirePortalAuth])
  .inputValidator((input: unknown) => OfficeGeofenceSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertRateLimit } = await import("./rate-limit.server.ts");
    assertRateLimit(`geofence-config:${context.userId}`, { limit: 30, windowMs: 60_000 });

    const { eq } = await import("drizzle-orm");
    const { db } = await import("../db/index.ts");
    const schema = await import("../db/schema.ts");
    const { ensurePortalInitialized, stripCredentialsFromUsers, toPublicUser } =
      await import("./auth.server.ts");
    const { createSeedState } = await import("./seed.ts");

    await ensurePortalInitialized();

    const [stateRows, userRows] = await Promise.all([
      db
        .select()
        .from(schema.portalState)
        .where(eq(schema.portalState.id, PORTAL_STATE_ID))
        .limit(1),
      db.select().from(schema.users),
    ]);

    const existing = (stateRows[0]?.data as AppState | undefined) ?? createSeedState();
    const canConfigure =
      context.role === "super_admin" ||
      context.role === "admin" ||
      (existing.adminPerms ?? []).includes("system_settings");

    if (!canConfigure) {
      throw new Error("Forbidden: Admin access required to modify office geofence settings.");
    }

    const now = new Date().toISOString();
    const updatedConfig: OfficeGeofenceConfig = {
      enabled: data.enabled,
      officeName: data.officeName,
      latitude: Number(data.latitude.toFixed(6)),
      longitude: Number(data.longitude.toFixed(6)),
      radiusMeters: Math.round(data.radiusMeters),
      updatedAt: now,
      updatedBy: context.userId,
    };

    const auditEntry: AuditLog = {
      id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      actorId: context.userId,
      action: "office_geofence_updated",
      detail: `Office geofence "${updatedConfig.officeName}" set to (${updatedConfig.latitude}, ${updatedConfig.longitude}) · radius ${updatedConfig.radiusMeters}m · ${updatedConfig.enabled ? "Enabled" : "Disabled"}.`,
      at: now,
    };

    const nextState: AppState = {
      ...existing,
      users: stripCredentialsFromUsers(userRows.map(toPublicUser)),
      officeGeofence: updatedConfig,
      audit: [auditEntry, ...(existing.audit ?? [])].slice(0, 5000),
      sessionUserId: null,
    };

    await db
      .insert(schema.portalState)
      .values({ id: PORTAL_STATE_ID, data: nextState })
      .onConflictDoUpdate({
        target: schema.portalState.id,
        set: { data: nextState, updatedAt: new Date() },
      });

    return { ok: true as const, config: updatedConfig };
  });

const PunchInGeofenceSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().min(0).max(100_000).optional(),
  source: z.enum(["dashboard", "header", "attendance"]).optional(),
});

export const punchInWithGeofence = createServerFn({ method: "POST" })
  .middleware([requirePortalAuth])
  .inputValidator((input: unknown) => PunchInGeofenceSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertRateLimit } = await import("./rate-limit.server.ts");
    assertRateLimit(`punch-in:${context.userId}`, { limit: 20, windowMs: 60_000 });

    const cryptoMod = await import("node:crypto");
    const { eq } = await import("drizzle-orm");
    const { db } = await import("../db/index.ts");
    const schema = await import("../db/schema.ts");
    const { ensurePortalInitialized, stripCredentialsFromUsers, toPublicUser } =
      await import("./auth.server.ts");
    const { createSeedState, dateKey } = await import("./seed.ts");

    await ensurePortalInitialized();

    const [stateRows, userRows] = await Promise.all([
      db
        .select()
        .from(schema.portalState)
        .where(eq(schema.portalState.id, PORTAL_STATE_ID))
        .limit(1),
      db.select().from(schema.users),
    ]);

    const existing = (stateRows[0]?.data as AppState | undefined) ?? createSeedState();
    const config: OfficeGeofenceConfig = existing.officeGeofence ?? { ...DEFAULT_OFFICE_GEOFENCE };

    const nowDate = new Date();
    const nowIso = nowDate.toISOString();
    const todayKey = dateKey(nowDate);
    const lat = Number(data.latitude.toFixed(6));
    const lon = Number(data.longitude.toFixed(6));

    const evaluation = evaluateGeofence(lat, lon, config);

    const existingAttendance = [...(existing.attendance ?? [])];
    const existingIdx = existingAttendance.findIndex(
      (a) => a.userId === context.userId && a.date === todayKey,
    );
    if (existingIdx >= 0 && existingAttendance[existingIdx]?.punchIn) {
      return {
        ok: true as const,
        alreadyPunchedIn: true,
        allowed: true,
        status: existingAttendance[existingIdx]?.geofenceStatus ?? evaluation.status,
        distanceMeters:
          existingAttendance[existingIdx]?.punchInDistanceMeters ?? evaluation.distanceMeters,
        radiusMeters: config.radiusMeters,
        officeName: config.officeName,
        record: existingAttendance[existingIdx]!,
      };
    }

    const auditLog: AuditLog = {
      id: cryptoMod.randomUUID().slice(0, 12),
      actorId: context.userId,
      action: evaluation.allowed ? "punch_in_geofence_verified" : "punch_in_geofence_blocked",
      detail: `Punch-in ${evaluation.allowed ? "approved" : "blocked"} (${evaluation.status}) at (${lat}, ${lon}) · ${evaluation.distanceMeters}m from ${config.officeName} (limit ${config.radiusMeters}m, source: ${data.source ?? "dashboard"})`,
      at: nowIso,
    };

    if (!evaluation.allowed) {
      // Persist out-of-bounds audit attempt without recording punch-in
      const blockedState: AppState = {
        ...existing,
        users: stripCredentialsFromUsers(userRows.map(toPublicUser)),
        audit: [auditLog, ...(existing.audit ?? [])].slice(0, 5000),
        sessionUserId: null,
      };
      await db
        .insert(schema.portalState)
        .values({ id: PORTAL_STATE_ID, data: blockedState })
        .onConflictDoUpdate({
          target: schema.portalState.id,
          set: { data: blockedState, updatedAt: new Date() },
        });

      return {
        ok: false as const,
        allowed: false,
        status: evaluation.status,
        distanceMeters: evaluation.distanceMeters,
        radiusMeters: config.radiusMeters,
        officeName: config.officeName,
        error:
          "Access Denied: You are outside the office premises. Please move closer to punch in.",
      };
    }

    let savedRecord: AttendanceRecord;
    if (existingIdx >= 0) {
      const prev = existingAttendance[existingIdx]!;
      savedRecord = {
        ...prev,
        punchIn: nowIso,
        punchOut: null,
        hours: 0,
        status: "present",
        punchInLatitude: lat,
        punchInLongitude: lon,
        punchInDistanceMeters: evaluation.distanceMeters,
        geofenceStatus: evaluation.status,
      };
      existingAttendance[existingIdx] = savedRecord;
    } else {
      savedRecord = {
        id: cryptoMod.randomUUID().slice(0, 12),
        userId: context.userId,
        date: todayKey,
        punchIn: nowIso,
        punchOut: null,
        hours: 0,
        status: "present",
        punchInLatitude: lat,
        punchInLongitude: lon,
        punchInDistanceMeters: evaluation.distanceMeters,
        geofenceStatus: evaluation.status,
      };
      existingAttendance.push(savedRecord);
    }

    const nextState: AppState = {
      ...existing,
      users: stripCredentialsFromUsers(userRows.map(toPublicUser)),
      attendance: existingAttendance,
      audit: [auditLog, ...(existing.audit ?? [])].slice(0, 5000),
      sessionUserId: null,
    };

    await db
      .insert(schema.portalState)
      .values({ id: PORTAL_STATE_ID, data: nextState })
      .onConflictDoUpdate({
        target: schema.portalState.id,
        set: { data: nextState, updatedAt: new Date() },
      });

    return {
      ok: true as const,
      alreadyPunchedIn: false,
      allowed: true,
      status: evaluation.status,
      distanceMeters: evaluation.distanceMeters,
      radiusMeters: config.radiusMeters,
      officeName: config.officeName,
      record: savedRecord,
    };
  });

export const checkPostgresHealth = createServerFn({ method: "GET" })
  .middleware([requirePortalAuth])
  .handler(async ({ context }) => {
    if (context.role !== "super_admin" && context.role !== "admin") {
      throw new Error("Forbidden: Admin access required.");
    }
    try {
      const { sql } = await import("drizzle-orm");
      const { db } = await import("../db/index.ts");
      await db.execute(sql`SELECT 1`);
      return {
        connected: true,
        engine: "PostgreSQL",
      };
    } catch {
      return {
        connected: false,
        engine: "PostgreSQL",
      };
    }
  });
