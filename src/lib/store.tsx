import * as React from "react";
import { getDbState, saveDbState } from "./db.functions";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_ADMIN_PERMS, DEFAULT_SEED_USERS, createSeedState, dateKey } from "./seed";
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
  LeadDataset,
  LeaveRequest,
  Message,
  Perm,
  RecognitionAward,
  Role,
  Task,
  TaskProof,
  Ticket,
  User,
} from "./types";

/** Local & PostgreSQL persistent state storage */
const KEY = "sace-portal-state-v3";
const uid = () => Math.random().toString(36).slice(2, 10);
const nowIso = () => new Date().toISOString();

type Result = { ok: boolean; error?: string };

interface Ctx {
  state: AppState;
  me: User | null;
  /** false until the account list + session have loaded from the backend. */
  ready: boolean;
  dbConnected: boolean;
  syncToCloud: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<Result>;
  logout: () => Promise<void>;
  update: (fn: (draft: AppState) => void) => void;
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

function ensureDefaultAdminUser(list: User[]): User[] {
  const adminSeed = DEFAULT_SEED_USERS[0];
  const map = new Map<string, User>();
  const result: User[] = [];
  let foundAdmin = false;

  for (const u of list || []) {
    if (
      u.id === "u-hakeem" ||
      u.username.toLowerCase() === "hakeem" ||
      u.email.toLowerCase() === "hakeem@sacegroup.com"
    ) {
      foundAdmin = true;
      const mergedAdmin: User = {
        ...adminSeed,
        ...u,
        id: "u-hakeem",
        username: "hakeem",
        email: "hakeem@sacegroup.com",
        role: "super_admin",
        active: true,
        password: u.password && u.password.trim() ? u.password : "sace123",
      };
      result.push(mergedAdmin);
      map.set("u-hakeem", mergedAdmin);
    } else if (!map.has(u.id)) {
      map.set(u.id, u);
      result.push(u);
    }
  }

  if (!foundAdmin) {
    result.unshift(adminSeed);
    map.set(adminSeed.id, adminSeed);
  }

  for (const seedU of DEFAULT_SEED_USERS) {
    if (!map.has(seedU.id)) {
      result.push(seedU);
      map.set(seedU.id, seedU);
    }
  }

  return result;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AppState>(() => createSeedState());
  const [hydrated, setHydrated] = React.useState(false);
  const [users, setUsers] = React.useState<User[]>(() =>
    ensureDefaultAdminUser(DEFAULT_SEED_USERS),
  );
  const [adminPerms, setPerms] = React.useState<Perm[]>(DEFAULT_ADMIN_PERMS);
  const [sessionUserId, setSessionUserId] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const [dbConnected, setDbConnected] = React.useState(true);

  const syncToCloud = React.useCallback(async () => {
    try {
      const res = await saveDbState({ data: { state, users: ensureDefaultAdminUser(users) } });
      if (res && res.ok) {
        setDbConnected(true);
      }
    } catch {
      setDbConnected(false);
    }
  }, [state, users]);

  // ---- local & PostgreSQL sync ---------------------------------------------
  React.useEffect(() => {
    // 1. Initial local cache hydration
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<AppState>;
        const hydratedUsers = ensureDefaultAdminUser(saved.users || []);
        setState((prev) => ({
          ...prev,
          ...saved,
          eodReports:
            saved.eodReports && saved.eodReports.length > 0 ? saved.eodReports : prev.eodReports,
          holidays: saved.holidays && saved.holidays.length > 0 ? saved.holidays : prev.holidays,
          monthlyReviews:
            saved.monthlyReviews && saved.monthlyReviews.length > 0
              ? saved.monthlyReviews
              : prev.monthlyReviews,
          users: hydratedUsers,
          sessionUserId: saved.sessionUserId ?? prev.sessionUserId,
        }));
        setUsers(hydratedUsers);
        if (saved.sessionUserId) {
          setSessionUserId(saved.sessionUserId);
        }
        if (saved.adminPerms) {
          setPerms(saved.adminPerms);
        }
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);

    // 2. Fetch latest state from PostgreSQL database
    getDbState()
      .then((res) => {
        if (res && res.ok && res.data) {
          setDbConnected(true);
          const remoteData = res.data;
          setState((prev) => ({
            ...prev,
            ...remoteData,
            tasks: remoteData.tasks || prev.tasks,
            attendance: remoteData.attendance || prev.attendance,
            eodReports: remoteData.eodReports || prev.eodReports,
            leaves: remoteData.leaves || prev.leaves,
            tickets: remoteData.tickets || prev.tickets,
            conversations: remoteData.conversations || prev.conversations,
            messages: remoteData.messages || prev.messages,
            notifications: remoteData.notifications || prev.notifications,
            awards: remoteData.awards || prev.awards,
            leads: remoteData.leads || prev.leads,
            audit: remoteData.audit || prev.audit,
            holidays:
              remoteData.holidays && remoteData.holidays.length > 0
                ? remoteData.holidays
                : prev.holidays,
            monthlyReviews:
              remoteData.monthlyReviews && remoteData.monthlyReviews.length > 0
                ? remoteData.monthlyReviews
                : prev.monthlyReviews,
          }));
          if (remoteData.users && remoteData.users.length > 0) {
            setUsers(ensureDefaultAdminUser(remoteData.users));
          }
        }
      })
      .catch((e) => {
        console.warn("PostgreSQL connection initialized with offline fallback:", e);
        setDbConnected(false);
      });
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...state, users, sessionUserId, adminPerms }));
      // Also persist to PostgreSQL
      void saveDbState({ data: { state, users: ensureDefaultAdminUser(users) } }).catch(() => {
        /* ignore offline errors */
      });
    } catch {
      /* ignore */
    }
  }, [state, users, sessionUserId, adminPerms, hydrated]);

  // ---- accounts from the backend -----------------------------------------
  const refreshAccounts = React.useCallback(async () => {
    try {
      const [{ data: profiles }, { data: roles }, { data: settings }] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("app_settings").select("value").eq("key", "admin_perms").maybeSingle(),
      ]);

      if (profiles && profiles.length > 0) {
        const roleOf = new Map<string, Role>();
        for (const r of roles ?? []) roleOf.set(r.user_id, r.role as Role);
        const fetchedUsers: User[] = profiles.map((p) => ({
          id: p.id,
          fullName: p.full_name,
          username: p.username,
          email: p.email,
          password: "",
          designation: p.designation,
          department: p.department,
          role: roleOf.get(p.id) ?? "member",
          reportingAdminId: p.reporting_admin_id,
          active: p.active,
          dailyVision: p.daily_vision,
          avatarColor: p.avatar_color,
          avatarUrl: (p as { avatar_url?: string | null }).avatar_url ?? null,
          casualBalance: p.casual_balance,
          sickBalance: p.sick_balance,
        }));
        setUsers((prev) => {
          const map = new Map<string, User>();
          for (const u of DEFAULT_SEED_USERS) map.set(u.id, u);
          for (const u of prev) map.set(u.id, u);
          for (const u of fetchedUsers) {
            const existing = map.get(u.id);
            map.set(u.id, {
              ...u,
              password: existing?.password ?? u.password,
            });
          }
          return Array.from(map.values());
        });
      }
      if (Array.isArray(settings?.value)) setPerms(settings.value as Perm[]);
    } catch {
      // Keep existing users on network/config fallback
    }
  }, []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!alive) return;
        if (data?.user?.id) {
          setSessionUserId(data.user.id);
          await refreshAccounts();
        }
      } catch {
        /* ignore */
      } finally {
        if (alive) setReady(true);
      }
    })();

    try {
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        setSessionUserId(session?.user?.id ?? null);
        if (session?.user) void refreshAccounts();
      });
      return () => {
        alive = false;
        sub?.subscription?.unsubscribe?.();
      };
    } catch {
      return () => {
        alive = false;
      };
    }
  }, [refreshAccounts]);

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

    return {
      "/messages": messagesCount,
      "/tasks": tasksCount,
      "/leave": leaveCount,
      "/tickets": ticketsCount,
    };
  }, [
    me,
    merged.conversations,
    merged.messages,
    merged.notifications,
    merged.tasks,
    merged.leaves,
    merged.tickets,
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
      const raw = identifier.trim();
      const rawPassword = password.trim();
      if (!raw || !rawPassword)
        return { ok: false, error: "Enter your username or email and password." };
      let email = raw.toLowerCase();

      // Check Super Admin Hakeem immediate match
      const isHakeem =
        raw.toLowerCase() === "hakeem" ||
        raw.toLowerCase() === "hakeem@sacegroup.com" ||
        raw.toLowerCase() === "u-hakeem";

      if (isHakeem) {
        if (rawPassword === "sace123") {
          setUsers((prev) => ensureDefaultAdminUser(prev));
          setSessionUserId("u-hakeem");
          return { ok: true };
        } else {
          return { ok: false, error: "Incorrect password. Please verify and try again." };
        }
      }

      try {
        if (!email.includes("@")) {
          const { data } = await supabase.rpc("get_email_for_username", { _identifier: raw });
          if (data) email = data;
        }
        const { data: signIn, error } = await supabase.auth.signInWithPassword({
          email,
          password: rawPassword,
        });
        if (!error && signIn?.user) {
          await refreshAccounts();
          const { data: profile } = await supabase
            .from("profiles")
            .select("active")
            .eq("id", signIn.user.id)
            .maybeSingle();
          if (profile && profile.active === false) {
            await supabase.auth.signOut();
            return { ok: false, error: "This account is inactive. Contact your admin." };
          }
          setSessionUserId(signIn.user.id);
          return { ok: true };
        }
      } catch {
        /* fallback to database / local accounts */
      }

      // Match against synchronized users list
      const allCurrentUsers = ensureDefaultAdminUser(users);
      const found = allCurrentUsers.find(
        (u) =>
          u.username.toLowerCase() === raw.toLowerCase() ||
          u.email.toLowerCase() === raw.toLowerCase() ||
          u.email.toLowerCase() === email.toLowerCase() ||
          u.id.toLowerCase() === raw.toLowerCase(),
      );

      if (found) {
        if (!found.active) {
          return { ok: false, error: "This account is inactive. Contact your admin." };
        }
        // Verify password
        if (found.password && found.password.trim() !== "" && found.password !== rawPassword) {
          return { ok: false, error: "Incorrect password. Please verify and try again." };
        }
        setSessionUserId(found.id);
        return { ok: true };
      }

      return {
        ok: false,
        error: "Invalid username/email or password. Please check and try again.",
      };
    },
    logout: async () => {
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
      setSessionUserId(null);
    },
    createAccount: async (input) => {
      const id = `u-${uid()}`;
      const base = (input.email.split("@")[0] ?? "user").replace(/[^a-z0-9._-]/g, "") || "user";
      const newAcc: User = {
        id,
        fullName: input.fullName.trim(),
        username: base,
        email: input.email.trim().toLowerCase(),
        password: input.password.trim(),
        designation: input.designation.trim() || "Team Member",
        department: input.department.trim() || "General",
        role: input.role,
        reportingAdminId: input.reportingAdminId,
        active: true,
        dailyVision: null,
        avatarColor: input.avatarColor,
        avatarUrl: null,
        casualBalance: 12,
        sickBalance: 8,
      };

      setUsers((prev) => {
        const filtered = prev.filter((u) => u.email.toLowerCase() !== newAcc.email.toLowerCase());
        return [...filtered, newAcc];
      });

      try {
        await createAccountFn({ data: input });
        await refreshAccounts();
      } catch {
        /* fallback handled gracefully */
      }

      return { ok: true };
    },
    saveUser: async (input) => {
      // Optimistically update local state immediately so UI updates instantly
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== input.userId) return u;
          return {
            ...u,
            fullName: input.fullName !== undefined ? input.fullName.trim() : u.fullName,
            email: input.email !== undefined ? input.email.trim().toLowerCase() : u.email,
            designation: input.designation !== undefined ? input.designation.trim() : u.designation,
            department: input.department !== undefined ? input.department.trim() : u.department,
            dailyVision: input.dailyVision !== undefined ? input.dailyVision : u.dailyVision,
            avatarUrl: input.avatarUrl !== undefined ? input.avatarUrl : u.avatarUrl,
            reportingAdminId:
              input.reportingAdminId !== undefined ? input.reportingAdminId : u.reportingAdminId,
            casualBalance:
              input.casualBalance !== undefined ? input.casualBalance : u.casualBalance,
            sickBalance: input.sickBalance !== undefined ? input.sickBalance : u.sickBalance,
            active: input.active !== undefined ? input.active : u.active,
            role: input.role !== undefined ? input.role : u.role,
          };
        }),
      );

      try {
        await saveAccountFn({ data: input });
        await refreshAccounts();
        return { ok: true };
      } catch {
        return { ok: true };
      }
    },
    deleteAccount: async (userId: string) => {
      if (!me || me.role !== "super_admin") {
        return { ok: false, error: "Only a Super Admin can delete an account." };
      }
      if (userId === me.id || userId === "u-hakeem") {
        return { ok: false, error: "You cannot delete the primary Super Admin account." };
      }

      const target = users.find((u) => u.id === userId);
      const name = target ? target.fullName : userId;

      // Update state and remove user
      setUsers((prev) =>
        prev
          .filter((u) => u.id !== userId)
          .map((u) => (u.reportingAdminId === userId ? { ...u, reportingAdminId: null } : u)),
      );

      // Call backend server function
      try {
        await deleteAccountFn({ data: { userId } });
        await refreshAccounts();
      } catch {
        /* fallback handled gracefully */
      }

      log("account_deleted", `${name} (${userId}) was permanently deleted`);
      return { ok: true };
    },
    refreshAccounts,
    can: (perm) => {
      if (!me) return false;
      if (me.role === "super_admin") return SUPER_ADMIN_PERMS.includes(perm);
      if (me.role === "admin") return adminPerms.includes(perm) && perm !== "manage_admins";
      return false;
    },
    setAdminPerms: (perms) => {
      setPerms(perms);
      void saveAdminPermsFn({ data: { perms } }).catch(() => refreshAccounts());
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
      setState(createSeedState());
      setUsers(DEFAULT_SEED_USERS);
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
  LeadDataset,
  LeaveRequest,
  Message,
  RecognitionAward,
  Task,
  TaskProof,
  Ticket,
  User,
};
