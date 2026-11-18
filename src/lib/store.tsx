import * as React from "react";
import {
  getScopedPortalState,
  punchInWithGeofence,
  saveOfficeGeofenceConfig,
  saveScopedPortalState,
} from "./db.functions";
import { getCurrentSession, loginPortal, logoutPortal } from "./auth.functions";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_ADMIN_PERMS, dateKey } from "./seed";
import { DEFAULT_OFFICE_GEOFENCE, evaluateGeofence, requestCurrentPosition } from "./geofence";
import { clearPortalClientStorage } from "./security";
import { setClientSessionToken } from "./portal-session-client";
import {
  createAccount as createAccountFn,
  saveAccount as saveAccountFn,
  deleteAccount as deleteAccountFn,
  saveAdminPerms as saveAdminPermsFn,
  type CreateAccountInput,
  type SaveAccountInput,
} from "./accounts.functions";
import { askAddy } from "./addy.functions";
import type {
  AppNotification,
  AppState,
  AttendanceRecord,
  AttendanceStatus,
  GeofenceStatus,
  LeadDataset,
  LeaveRequest,
  Message,
  OfficeGeofenceConfig,
  Perm,
  RecognitionAward,
  Task,
  TaskProof,
  Ticket,
  User,
  VaultItem,
} from "./types";

function createEmptyState(): AppState {
  return {
    users: [],
    attendance: [],
    tasks: [],
    leaves: [],
    leads: [],
    conversations: [],
    messages: [],
    tickets: [],
    awards: [],
    notifications: [],
    audit: [],
    eodReports: [],
    holidays: [],
    monthlyReviews: [],
    vaultItems: [],
    officeGeofence: { ...DEFAULT_OFFICE_GEOFENCE },
    ticketSeq: 1000,
    sessionUserId: null,
    adminPerms: DEFAULT_ADMIN_PERMS,
  };
}

const uid = () => {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().slice(0, 12);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
};
const nowIso = () => new Date().toISOString();

type Result = { ok: boolean; error?: string };

export interface PunchInLocationResult {
  ok: boolean;
  error?: string;
  status?: GeofenceStatus;
  distanceMeters?: number;
  radiusMeters?: number;
  officeName?: string;
  latitude?: number;
  longitude?: number;
}

interface Ctx {
  state: AppState;
  me: User | null;
  ready: boolean;
  dbConnected: boolean;
  syncToCloud: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<Result>;
  logout: () => Promise<void>;
  update: (fn: (draft: AppState) => void) => void;
  punchInWithLocation: (
    source?: "dashboard" | "header" | "attendance",
  ) => Promise<PunchInLocationResult>;
  saveOfficeGeofence: (config: OfficeGeofenceConfig) => Promise<Result>;
  createAccount: (input: CreateAccountInput) => Promise<Result>;
  saveUser: (input: SaveAccountInput) => Promise<Result>;
  deleteAccount: (userId: string) => Promise<Result>;
  refreshAccounts: () => Promise<void>;
  can: (perm: Perm) => boolean;
  adminPerms: Perm[];
  setAdminPerms: (perms: Perm[]) => void;
  visibleUsers: () => User[];
  attendanceStatus: (userId: string, date: Date) => AttendanceStatus;
  notify: (userId: string, title: string, body: string, href?: string) => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  clearNotification: (notificationId: string) => void;
  clearAllNotifications: () => void;
  markModuleRead: (pathOrModule: string) => void;
  unreadCounts: Record<string, number>;
  log: (action: string, detail: string) => void;
  reset: () => void;
}

export type { Perm };

const SUPER_ADMIN_PERMS: Perm[] = [
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
];

const AppCtx = React.createContext<Ctx | null>(null);

function errMessage(e: unknown, fallback: string) {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const cleaned = raw.replace(/^Error:\s*/i, "").trim();
  return cleaned || fallback;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AppState>(() => createEmptyState());
  const [users, setUsers] = React.useState<User[]>([]);
  const [adminPerms, setPerms] = React.useState<Perm[]>(DEFAULT_ADMIN_PERMS);
  const [sessionUserId, setSessionUserId] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const [dbConnected, setDbConnected] = React.useState(true);
  const loadedFromServerRef = React.useRef(false);
  const pendingSaveRef = React.useRef<Promise<unknown>>(Promise.resolve());

  const loadScopedState = React.useCallback(async (): Promise<Result> => {
    try {
      const res = await getScopedPortalState();
      if (res && res.ok && res.data) {
        setDbConnected(true);
        const remote = res.data;
        setState(remote);
        setUsers(remote.users ?? []);
        setPerms(remote.adminPerms ?? DEFAULT_ADMIN_PERMS);
        loadedFromServerRef.current = true;
        return { ok: true };
      }
      return { ok: false, error: "Unable to load workspace state." };
    } catch (err) {
      setDbConnected(false);
      return { ok: false, error: errMessage(err, "Unable to load workspace state.") };
    }
  }, []);

  const syncToCloud = React.useCallback(async () => {
    if (!sessionUserId) return;
    try {
      const res = await saveScopedPortalState({
        data: {
          state: {
            attendance: state.attendance,
            tasks: state.tasks,
            leaves: state.leaves,
            leads: state.leads,
            conversations: state.conversations,
            messages: state.messages,
            tickets: state.tickets,
            awards: state.awards,
            notifications: state.notifications,
            audit: state.audit,
            eodReports: state.eodReports,
            holidays: state.holidays,
            monthlyReviews: state.monthlyReviews,
            vaultItems: state.vaultItems,
            ticketSeq: state.ticketSeq,
          },
        },
      });
      if (res && res.ok) {
        setDbConnected(true);
      }
    } catch {
      setDbConnected(false);
    }
  }, [sessionUserId, state]);

  // Verify active server session on boot (never trust client localStorage for identity/state)
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const session = await getCurrentSession();
        if (!alive) return;
        if (session.authenticated && session.user) {
          const authUser = session.user;
          setUsers((prev) =>
            prev.some((u) => u.id === authUser.id)
              ? prev.map((u) => (u.id === authUser.id ? authUser : u))
              : [...prev, authUser],
          );
          setSessionUserId(authUser.id);
          await loadScopedState();
        } else {
          // Ensure any stale legacy cache is wiped if unauthenticated
          setClientSessionToken(null);
          clearPortalClientStorage();
        }
      } catch {
        setDbConnected(false);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadScopedState]);

  // Persist scoped updates back to server whenever authenticated state changes
  React.useEffect(() => {
    if (!sessionUserId || !loadedFromServerRef.current) return;
    pendingSaveRef.current = saveScopedPortalState({
      data: {
        state: {
          attendance: state.attendance,
          tasks: state.tasks,
          leaves: state.leaves,
          leads: state.leads,
          conversations: state.conversations,
          messages: state.messages,
          tickets: state.tickets,
          awards: state.awards,
          notifications: state.notifications,
          audit: state.audit,
          eodReports: state.eodReports,
          holidays: state.holidays,
          monthlyReviews: state.monthlyReviews,
          vaultItems: state.vaultItems,
          ticketSeq: state.ticketSeq,
        },
      },
    })
      .then(() => setDbConnected(true))
      .catch(() => setDbConnected(false));
  }, [state, sessionUserId]);

  const refreshAccounts = React.useCallback(async () => {
    if (!sessionUserId) return;
    await loadScopedState();
  }, [sessionUserId, loadScopedState]);

  const update = React.useCallback((fn: (draft: AppState) => void) => {
    setState((prev) => {
      const draft = JSON.parse(JSON.stringify(prev)) as AppState;
      fn(draft);
      return draft;
    });
  }, []);

  const log = React.useCallback(
    (action: string, detail: string) => {
      update((d) => {
        if (!sessionUserId) return;
        d.audit.unshift({ id: uid(), actorId: sessionUserId, action, detail, at: nowIso() });
      });
    },
    [sessionUserId, update],
  );

  const notify = React.useCallback(
    (userId: string, title: string, body: string, href?: string) => {
      update((d) => {
        const n: AppNotification = {
          id: uid(),
          userId,
          title,
          body,
          at: nowIso(),
          read: false,
          href,
        };
        d.notifications.unshift(n);
      });
    },
    [update],
  );

  const merged: AppState = { ...state, users, adminPerms, sessionUserId };
  const me = users.find((u) => u.id === sessionUserId) ?? null;

  const markNotificationRead = React.useCallback(
    (notificationId: string) => {
      update((d) => {
        const item = d.notifications.find((n) => n.id === notificationId);
        if (item) item.read = true;
      });
    },
    [update],
  );

  const markAllNotificationsRead = React.useCallback(() => {
    if (!sessionUserId) return;
    update((d) => {
      d.notifications.forEach((n) => {
        if (n.userId === sessionUserId) n.read = true;
      });
    });
  }, [sessionUserId, update]);

  const clearNotification = React.useCallback(
    (notificationId: string) => {
      update((d) => {
        d.notifications = d.notifications.filter((n) => n.id !== notificationId);
      });
    },
    [update],
  );

  const clearAllNotifications = React.useCallback(() => {
    if (!sessionUserId) return;
    update((d) => {
      d.notifications = d.notifications.filter((n) => n.userId !== sessionUserId);
    });
  }, [sessionUserId, update]);

  const markModuleRead = React.useCallback(
    (route: string) => {
      if (!sessionUserId) return;
      update((d) => {
        d.notifications.forEach((n) => {
          if (n.userId === sessionUserId && n.href?.startsWith(route)) {
            n.read = true;
          }
        });

        if (route.startsWith("/messages")) {
          const userConvIds = new Set(
            d.conversations
              .filter((c) => c.kind === "announcement" || c.participantIds?.includes(sessionUserId))
              .map((c) => c.id),
          );
          d.messages.forEach((m) => {
            if (userConvIds.has(m.conversationId) && m.senderId !== sessionUserId) {
              if (!m.readBy) m.readBy = [];
              if (!m.readBy.includes(sessionUserId)) {
                m.readBy.push(sessionUserId);
              }
            }
          });
        }
      });
    },
    [sessionUserId, update],
  );

  const unreadCounts = React.useMemo(() => {
    if (!me) return {};

    const userConvIds = new Set(
      merged.conversations
        .filter((c) => c.kind === "announcement" || c.participantIds?.includes(me.id))
        .map((c) => c.id),
    );

    const unreadMessages = merged.messages.filter(
      (m) =>
        userConvIds.has(m.conversationId) &&
        m.senderId !== me.id &&
        (!m.readBy || !m.readBy.includes(me.id)),
    ).length;

    const unreadMsgNotifs = merged.notifications.filter(
      (n) => n.userId === me.id && !n.read && n.href?.startsWith("/messages"),
    ).length;

    const messagesCount = Math.max(unreadMessages, unreadMsgNotifs);

    const isAdmin = me.role !== "member";

    const actionableTasks = merged.tasks.filter((t) => {
      if (isAdmin && t.status === "submitted") return true;
      if (
        t.assigneeId === me.id &&
        (t.status === "assigned" || t.status === "revision_requested")
      ) {
        return true;
      }
      return false;
    }).length;

    const unreadTaskNotifs = merged.notifications.filter(
      (n) => n.userId === me.id && !n.read && n.href?.startsWith("/tasks"),
    ).length;

    const tasksCount = Math.max(actionableTasks, unreadTaskNotifs);

    const pendingLeaves = isAdmin
      ? merged.leaves.filter((l) => l.status === "pending").length
      : merged.leaves.filter((l) => l.userId === me.id && l.status === "pending").length;

    const unreadLeaveNotifs = merged.notifications.filter(
      (n) => n.userId === me.id && !n.read && n.href?.startsWith("/leave"),
    ).length;

    const leaveCount = Math.max(pendingLeaves, unreadLeaveNotifs);

    const isAgent = me.role === "super_admin" || me.role === "admin";
    const actionableTickets = merged.tickets.filter((t) => {
      if (isAgent) {
        return t.status === "created" || t.status === "open";
      }
      return t.createdById === me.id && (t.status === "waiting_employee" || t.status === "open");
    }).length;

    const unreadTicketNotifs = merged.notifications.filter(
      (n) => n.userId === me.id && !n.read && n.href?.startsWith("/tickets"),
    ).length;

    const ticketsCount = Math.max(actionableTickets, unreadTicketNotifs);

    const uncheckedVaults = (merged.vaultItems ?? []).filter(
      (v) => v.recipientId === me.id && !v.checkedByRecipient,
    ).length;
    const unreadVaultNotifs = merged.notifications.filter(
      (n) => n.userId === me.id && !n.read && n.href?.startsWith("/vault"),
    ).length;
    const vaultCount = Math.max(uncheckedVaults, unreadVaultNotifs);

    return {
      "/messages": messagesCount,
      "/tasks": tasksCount,
      "/leave": leaveCount,
      "/tickets": ticketsCount,
      "/vault": vaultCount,
    };
  }, [
    me,
    merged.conversations,
    merged.messages,
    merged.notifications,
    merged.tasks,
    merged.leaves,
    merged.tickets,
    merged.vaultItems,
  ]);

  const value: Ctx = {
    state: merged,
    adminPerms,
    me,
    ready,
    dbConnected,
    syncToCloud,
    update,

    login: async (identifier, password) => {
      const cleanId = identifier.trim();
      if (!cleanId || !password) {
        return { ok: false, error: "Enter your username or email and password." };
      }

      try {
        const res = await loginPortal({ data: { identifier: cleanId, password } });
        if (!res.ok || !res.user) {
          return { ok: false, error: res.error ?? "Invalid username/email or password." };
        }

        const authUser = res.user;
        // Persist signed session token for header auth fallback (iframe-safe) & seed user synchronously
        setClientSessionToken(res.sessionToken ?? null);
        setUsers((prev) =>
          prev.some((u) => u.id === authUser.id)
            ? prev.map((u) => (u.id === authUser.id ? authUser : u))
            : [...prev, authUser],
        );
        setSessionUserId(authUser.id);
        setReady(true);

        const loaded = await loadScopedState();
        if (!loaded.ok && loaded.error?.toLowerCase().includes("unauthorized")) {
          setClientSessionToken(null);
          setSessionUserId(null);
          setUsers([]);
          return {
            ok: false,
            error: "Session could not be verified. Please refresh and sign in again.",
          };
        }

        return { ok: true };
      } catch (err) {
        return { ok: false, error: errMessage(err, "Unable to sign in.") };
      }
    },

    logout: async () => {
      const activeId = sessionUserId;
      try {
        await pendingSaveRef.current;
      } catch {
        /* ignore */
      }
      loadedFromServerRef.current = false;
      setClientSessionToken(null);
      try {
        await logoutPortal();
      } catch {
        /* ignore */
      }
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
      clearPortalClientStorage(activeId);
      setSessionUserId(null);
      setUsers([]);
      setState(createEmptyState());
    },

    punchInWithLocation: async (source = "dashboard") => {
      const activeConfig = state.officeGeofence ?? DEFAULT_OFFICE_GEOFENCE;
      try {
        const coords = await requestCurrentPosition();
        const clientEval = evaluateGeofence(coords.latitude, coords.longitude, activeConfig);

        const serverRes = await punchInWithGeofence({
          data: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracyMeters: coords.accuracyMeters,
            source,
          },
        });

        await loadScopedState();

        if (!serverRes.ok || !serverRes.allowed) {
          return {
            ok: false,
            status: serverRes.status ?? clientEval.status,
            distanceMeters: serverRes.distanceMeters ?? clientEval.distanceMeters,
            radiusMeters: serverRes.radiusMeters ?? activeConfig.radiusMeters,
            officeName: serverRes.officeName ?? activeConfig.officeName,
            latitude: coords.latitude,
            longitude: coords.longitude,
            error:
              serverRes.error ??
              "Access Denied: You are outside the office premises. Please move closer to punch in.",
          };
        }

        return {
          ok: true,
          status: serverRes.status,
          distanceMeters: serverRes.distanceMeters,
          radiusMeters: serverRes.radiusMeters,
          officeName: serverRes.officeName,
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
      } catch (err) {
        return {
          ok: false,
          error: errMessage(
            err,
            "Unable to verify your GPS location. Please enable location permissions.",
          ),
        };
      }
    },

    saveOfficeGeofence: async (config) => {
      try {
        const res = await saveOfficeGeofenceConfig({ data: config });
        if (res.ok) {
          await loadScopedState();
          return { ok: true };
        }
        return { ok: false, error: "Could not save office location settings." };
      } catch (err) {
        return { ok: false, error: errMessage(err, "Could not save office location settings.") };
      }
    },

    createAccount: async (input) => {
      try {
        await createAccountFn({ data: input });
        await loadScopedState();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: errMessage(err, "Could not create account.") };
      }
    },

    saveUser: async (input) => {
      try {
        await saveAccountFn({ data: input });
        await loadScopedState();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: errMessage(err, "Could not save profile changes.") };
      }
    },

    deleteAccount: async (userId: string) => {
      if (!me || me.role !== "super_admin") {
        return { ok: false, error: "Only a Super Admin can delete an account." };
      }
      if (userId === me.id || userId === "u-hakeem") {
        return {
          ok: false,
          error: "You cannot delete your own or the primary Super Admin account.",
        };
      }

      const target = users.find((u) => u.id === userId);
      const name = target ? target.fullName : userId;

      try {
        await deleteAccountFn({ data: { userId } });
        await loadScopedState();
        log("account_deleted", `${name} (${userId}) was permanently deleted`);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: errMessage(err, "Could not delete account.") };
      }
    },

    refreshAccounts,

    can: (perm) => {
      if (!me) return false;
      if (me.role === "super_admin") return SUPER_ADMIN_PERMS.includes(perm);
      if (me.role === "admin") return adminPerms.includes(perm) && perm !== "manage_admins";
      return false;
    },

    setAdminPerms: (perms) => {
      void saveAdminPermsFn({ data: { perms } })
        .then(() => setPerms(perms))
        .catch(() => void loadScopedState());
    },

    visibleUsers: () => {
      if (!me) return [];
      if (me.role === "super_admin") return users;
      if (me.role === "admin")
        return users.filter((u) => u.reportingAdminId === me.id || u.id === me.id);
      return [me];
    },

    attendanceStatus: (userId, date) => {
      const key = dateKey(date);
      const wd = date.getDay();
      if (wd === 0 || wd === 6) return "week_off";
      const rec = merged.attendance.find((a) => a.userId === userId && a.date === key);
      if (rec) {
        if (rec.status === "week_off") return "week_off";
        if (rec.status === "absent") return "absent";
        if (rec.status === "casual_leave" || rec.status === "sick_leave") return rec.status;
        if (rec.punchIn || (rec.hours ?? 0) > 0 || rec.status === "present") return "present";
      }
      const isHoliday = (merged.holidays || []).some((h) => h.date === key);
      if (isHoliday) return "holiday";
      const leave = merged.leaves.find(
        (l) =>
          l.userId === userId && l.status === "approved" && key >= l.startDate && key <= l.endDate,
      );
      if (leave) return leave.type === "casual" ? "casual_leave" : "sick_leave";
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const d0 = new Date(date);
      d0.setHours(0, 0, 0, 0);
      if (d0.getTime() > today.getTime()) return "week_off";
      return "absent";
    },

    notify,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotification,
    clearAllNotifications,
    markModuleRead,
    unreadCounts,
    log,
    reset: () => {
      setClientSessionToken(null);
      clearPortalClientStorage(sessionUserId);
      loadedFromServerRef.current = false;
      setState(createEmptyState());
      setUsers([]);
      setSessionUserId(null);
    },
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = React.useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export const newId = uid;
export const isoNow = nowIso;
export { dateKey };
export async function askAddyAssistant(
  messages: { role: "user" | "assistant"; content: string }[],
  context?: string,
) {
  return askAddy({ data: { messages, context } });
}
export type {
  AppState,
  AttendanceRecord,
  GeofenceStatus,
  LeadDataset,
  LeaveRequest,
  Message,
  OfficeGeofenceConfig,
  RecognitionAward,
  Task,
  TaskProof,
  Ticket,
  User,
  VaultItem,
};
