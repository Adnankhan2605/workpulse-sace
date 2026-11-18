import * as React from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  CalendarDays,
  CalendarHeart,
  Check,
  CheckCheck,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileBarChart,
  FileText,
  Fingerprint,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  PanelLeft,
  PanelLeftClose,
  MessageSquare,
  Plane,
  ScrollText,
  Settings,
  ShieldCheck,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useApp, type Perm, dateKey } from "@/lib/store";
import { formatDistanceMeters } from "@/lib/geofence";
import { isMonthlyReviewDayToday } from "@/lib/cadence";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SaceLogo } from "@/components/sace-logo";
import type { Role } from "@/lib/types";
import { EodLogoutDialog } from "@/components/eod-logout-dialog";
import { fmtRelativeTime, fmtTime } from "@/lib/format";
import { DualTimezoneClock } from "@/components/dual-timezone-clock";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
  perm?: Perm;
}

const NAV: NavItem[] = [
  {
    to: "/dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    roles: ["super_admin", "admin", "member"],
  },
  { to: "/tasks", label: "Tasks", icon: ClipboardList, roles: ["super_admin", "admin", "member"] },
  { to: "/eod", label: "EOD Reports", icon: FileText, roles: ["super_admin", "admin", "member"] },
  {
    to: "/attendance",
    label: "Attendance",
    icon: CalendarDays,
    roles: ["super_admin", "admin", "member"],
  },
  { to: "/leave", label: "Leave Requests", icon: Plane, roles: ["super_admin", "admin", "member"] },
  {
    to: "/holidays",
    label: "Holidays",
    icon: CalendarHeart,
    roles: ["super_admin", "admin", "member"],
  },
  {
    to: "/reviews",
    label: "Monthly Reviews",
    icon: ClipboardCheck,
    roles: ["super_admin", "admin", "member"],
  },
  { to: "/leads", label: "Leads", icon: Fingerprint, roles: ["super_admin", "admin", "member"] },
  {
    to: "/messages",
    label: "Messages",
    icon: MessageSquare,
    roles: ["super_admin", "admin", "member"],
  },
  {
    to: "/tickets",
    label: "Support Tickets",
    icon: LifeBuoy,
    roles: ["super_admin", "admin", "member"],
  },
  {
    to: "/vault",
    label: "Vault",
    icon: Lock,
    roles: ["super_admin", "admin", "member"],
  },
  {
    to: "/leaderboard",
    label: "Leaderboard",
    icon: Trophy,
    roles: ["super_admin", "admin", "member"],
  },
  {
    to: "/team",
    label: "Team & Accounts",
    icon: Users,
    roles: ["super_admin", "admin"],
    perm: "manage_users",
  },
  {
    to: "/reports",
    label: "Progress Reports",
    icon: FileBarChart,
    roles: ["super_admin", "admin"],
    perm: "view_reports",
  },
  { to: "/audit", label: "Audit Logs", icon: ScrollText, roles: ["super_admin"] },
  { to: "/roles", label: "Roles & Permissions", icon: ShieldCheck, roles: ["super_admin"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["super_admin", "admin", "member"] },
];

export function roleLabel(role: Role) {
  return role === "super_admin" ? "Super Admin" : role === "admin" ? "Admin" : "Team Member";
}

export function Initials({
  name,
  color,
  size = 36,
  src,
}: {
  name: string;
  color?: string | undefined;
  size?: number | undefined;
  src?: string | null | undefined;
}) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-primary-foreground"
      style={{
        width: size,
        height: size,
        background: color ?? "var(--brand-purple)",
        fontSize: size / 2.8,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  hint?: string | undefined;
  description?: string | undefined;
  icon?: React.ComponentType<{ className?: string }> | undefined;
  action?: React.ReactNode | undefined;
}) {
  const subtitle = hint ?? description;
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
      {Icon ? (
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <p className="font-medium text-foreground">{title}</p>
      {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function NoAccess() {
  return (
    <div className="rounded-2xl border border-border bg-card p-10 text-center">
      <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 font-semibold text-foreground">You don't have access to this page</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Ask your Super Admin if you believe this is a mistake.
      </p>
    </div>
  );
}

function getNotificationModuleIcon(href?: string) {
  if (!href) return Bell;
  if (href.startsWith("/messages")) return MessageSquare;
  if (href.startsWith("/tasks")) return ClipboardList;
  if (href.startsWith("/leave")) return Plane;
  if (href.startsWith("/tickets")) return LifeBuoy;
  if (href.startsWith("/attendance")) return CalendarDays;
  if (href.startsWith("/vault")) return Lock;
  return Bell;
}

function getNotificationModuleColor(href?: string) {
  if (!href) return "bg-purple-500/15 text-purple-600 dark:text-purple-400";
  if (href.startsWith("/messages")) return "bg-purple-500/15 text-purple-600 dark:text-purple-400";
  if (href.startsWith("/tasks")) return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  if (href.startsWith("/leave")) return "bg-blue-500/15 text-blue-600 dark:text-blue-400";
  if (href.startsWith("/tickets")) return "bg-rose-500/15 text-rose-600 dark:text-rose-400";
  if (href.startsWith("/attendance"))
    return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  if (href.startsWith("/vault")) return "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400";
  return "bg-primary/15 text-primary";
}

function NotificationBell() {
  const {
    state,
    me,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotification,
    clearAllNotifications,
  } = useApp();
  const [filter, setFilter] = React.useState<"all" | "unread">("all");
  const [open, setOpen] = React.useState(false);

  const mine = state.notifications.filter((n) => n.userId === me?.id);
  const unreadList = mine.filter((n) => !n.read);
  const unreadTotal = unreadList.length;

  const displayList = filter === "unread" ? unreadList : mine;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-xl hover:bg-muted/80 text-foreground transition-transform active:scale-95"
          aria-label="Notifications"
          title={
            unreadTotal > 0
              ? `${unreadTotal} unread notification${unreadTotal > 1 ? "s" : ""}`
              : "Notifications"
          }
        >
          <Bell className="h-5 w-5 text-foreground/80" />
          {unreadTotal > 0 && (
            <span
              className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-background animate-in zoom-in-75 duration-150 tabular-nums shadow-xs"
              aria-label={`${unreadTotal} unread notifications`}
            >
              {unreadTotal > 9 ? "9+" : unreadTotal}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 sm:w-96 p-0 rounded-2xl shadow-2xl border-border bg-card overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">Notifications</h4>
            {unreadTotal > 0 ? (
              <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                {unreadTotal} new
              </span>
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                All caught up
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadTotal > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  markAllNotificationsRead();
                  toast.success("All notifications marked as read");
                }}
                className="h-7 px-2 text-xs text-primary hover:text-primary gap-1"
                title="Mark all notifications as read"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </Button>
            )}
            {mine.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  clearAllNotifications();
                  toast.success("All notifications cleared");
                }}
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                title="Clear all notifications"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1 border-b border-border/60 bg-card px-3 py-1.5 text-xs">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              filter === "all"
                ? "bg-primary/10 text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            All ({mine.length})
          </button>
          <button
            onClick={() => setFilter("unread")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              filter === "unread"
                ? "bg-primary/10 text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Unread ({unreadTotal})
          </button>
        </div>

        {/* List of notifications */}
        <div className="max-h-[380px] overflow-y-auto divide-y divide-border/40 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {displayList.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground mb-2">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="text-sm font-semibold text-foreground">You're all caught up!</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {filter === "unread"
                  ? "No unread notifications right now."
                  : "No notifications across your portal modules."}
              </p>
            </div>
          ) : (
            displayList.map((n) => {
              const Icon = getNotificationModuleIcon(n.href);
              const colorClass = getNotificationModuleColor(n.href);
              const [hrefPath, hrefQuery] = (n.href ?? "/dashboard").split("?");
              const searchParams = hrefQuery
                ? Object.fromEntries(new URLSearchParams(hrefQuery).entries())
                : undefined;
              const isVaultNotif = hrefPath === "/vault";
              return (
                <div
                  key={n.id}
                  className={cn(
                    "group relative flex items-start gap-3 p-3 transition-colors hover:bg-muted/40",
                    !n.read && "bg-primary/5",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                      colorClass,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <Link
                    to={hrefPath || "/dashboard"}
                    {...(searchParams ? { search: searchParams as never } : {})}
                    onClick={() => {
                      markNotificationRead(n.id);
                      setOpen(false);
                    }}
                    className="min-w-0 flex-1 space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <p
                        className={cn(
                          "text-xs truncate",
                          !n.read ? "font-bold text-foreground" : "font-medium text-foreground/90",
                        )}
                      >
                        {n.title}
                      </p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {fmtRelativeTime(n.at)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {n.body}
                    </p>
                    {isVaultNotif && (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-[#8A007E] to-purple-700 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-xs">
                        Check
                      </span>
                    )}
                  </Link>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!n.read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markNotificationRead(n.id);
                        }}
                        className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                        title="Mark as read"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clearNotification(n.id);
                      }}
                      className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                      title="Remove notification"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {!n.read && (
                    <span
                      className="absolute left-1 top-4 h-1.5 w-1.5 rounded-full bg-rose-500"
                      aria-hidden
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HeaderPunchStatus({ onOpenEod }: { onOpenEod: () => void }) {
  const { state, me, punchInWithLocation } = useApp();
  const navigate = useNavigate();
  const [punchBusy, setPunchBusy] = React.useState(false);
  const todayKey = dateKey(new Date());
  const rec = state.attendance.find((a) => a.userId === me?.id && a.date === todayKey);

  const isPunchedIn = !!(rec?.punchIn && !rec?.punchOut);
  const isPunchedOut = !!(rec?.punchIn && rec?.punchOut);

  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const isReviewDay = isMonthlyReviewDayToday(state.holidays || []);
  const hasSubmittedReview = (state.monthlyReviews || []).some(
    (r) => r.userId === me?.id && r.monthKey === currentMonthKey,
  );

  const handlePunchOutClick = () => {
    if (isReviewDay && !hasSubmittedReview) {
      toast.error(
        "Monthly Review Required: You must submit your Monthly Review & Reflection for this month before punching out today!",
      );
      navigate({ to: "/reviews" });
      return;
    }
    onOpenEod();
  };

  const handleQuickPunchIn = async () => {
    if (punchBusy) return;
    setPunchBusy(true);
    const res = await punchInWithLocation("header");
    setPunchBusy(false);

    if (!res.ok) {
      const distInfo =
        typeof res.distanceMeters === "number" && typeof res.radiusMeters === "number"
          ? ` (${formatDistanceMeters(res.distanceMeters)} away · limit ${formatDistanceMeters(res.radiusMeters)})`
          : "";
      toast.error(
        `${res.error ?? "Access Denied: You are outside the office premises. Please move closer to punch in."}${distInfo}`,
      );
      return;
    }

    toast.success(
      typeof res.distanceMeters === "number"
        ? `Punched in (${res.status} · ${formatDistanceMeters(res.distanceMeters)} from office).`
        : "Punched in successfully. Have a great workday!",
    );
  };

  if (isPunchedIn) {
    return (
      <div className="flex items-center gap-2">
        <Link
          to="/attendance"
          className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>In at {fmtTime(rec!.punchIn!)}</span>
        </Link>
        <Button
          size="sm"
          variant="outline"
          onClick={handlePunchOutClick}
          className="h-8 gap-1 text-xs border-border"
          title="Punch out and submit End-of-Day report"
        >
          <LogOut className="h-3.5 w-3.5" /> Punch out
        </Button>
      </div>
    );
  }

  if (isPunchedOut) {
    return (
      <Link
        to="/attendance"
        className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span>Out at {fmtTime(rec!.punchOut!)}</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        to="/attendance"
        className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
      >
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        <span>Not punched in</span>
      </Link>
      <Button
        size="sm"
        disabled={punchBusy}
        onClick={handleQuickPunchIn}
        className="h-8 gap-1.5 text-xs shadow-xs"
      >
        {punchBusy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <LogIn className="h-3.5 w-3.5" />
        )}
        {punchBusy ? "Locating..." : "Punch in"}
      </Button>
    </div>
  );
}

const SIDEBAR_KEY = "sace-sidebar-open";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, ready, logout, can, unreadCounts, markModuleRead } = useApp();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [eodOpen, setEodOpen] = React.useState(false);

  React.useEffect(() => {
    if (localStorage.getItem(SIDEBAR_KEY) === "closed") setSidebarOpen(false);
  }, []);

  React.useEffect(() => {
    if (pathname && markModuleRead) {
      markModuleRead(pathname);
    }
  }, [pathname, markModuleRead]);

  const toggleSidebar = () => {
    setSidebarOpen((v) => {
      const next = !v;
      localStorage.setItem(SIDEBAR_KEY, next ? "open" : "closed");
      return next;
    });
  };

  React.useEffect(() => {
    if (ready && me === null) navigate({ to: "/", replace: true });
  }, [ready, me, navigate]);

  if (!ready || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          {!ready ? "Verifying session…" : "Redirecting to sign in…"}
        </p>
      </div>
    );
  }

  const items = NAV.filter((i) => i.roles.includes(me.role) && (!i.perm || can(i.perm)));

  const sidebar = (
    <div className="flex h-full w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-4 py-5 border-b border-sidebar-border">
        <div className="flex items-center space-x-3 overflow-hidden">
          {/* White Logo Container with SACE Logo Asset */}
          <div className="flex-shrink-0 bg-white px-3 py-1.5 rounded-xl shadow-md flex items-center justify-center h-9">
            <img
              src="/assets/aistudio/SACE_Group_Logo_e04b9e3b.png"
              alt="SACE Group Logo"
              className="h-full w-auto object-contain"
            />
          </div>

          {/* Brand Title */}
          <div className="min-w-0">
            <span className="text-white font-extrabold text-xs tracking-tight uppercase truncate block">
              WORKPULSE
            </span>
          </div>
        </div>

        {/* Sidebar Collapse / Toggle Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-purple-300 hover:text-white hover:bg-purple-800/50 transition-colors flex-shrink-0"
          onClick={toggleSidebar}
          aria-label="Toggle Sidebar"
          title="Toggle Sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {items.map((item) => {
          const active = pathname === item.to;
          const badgeCount = unreadCounts[item.to] ?? 0;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <item.icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform group-hover:scale-105",
                    active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/70",
                  )}
                />
                <span className="truncate">{item.label}</span>
              </div>
              {badgeCount > 0 && (
                <span
                  className={cn(
                    "ml-auto flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums shadow-xs transition-colors",
                    active
                      ? "bg-sidebar-primary-foreground text-sidebar-primary font-extrabold"
                      : "bg-rose-500 text-white shadow-rose-950/40",
                  )}
                  title={`${badgeCount} unread or pending`}
                >
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={() => setEodOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {sidebarOpen && (
        <aside className="h-full w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          {sidebar}
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            className="shrink-0"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <PanelLeft className="h-5 w-5" />
            )}
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{me.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {roleLabel(me.role)} · {me.designation}
            </p>
          </div>
          <DualTimezoneClock variant="compact" className="hidden lg:flex" />
          <HeaderPunchStatus onOpenEod={() => setEodOpen(true)} />
          <NotificationBell />
          <Link to="/settings" aria-label="Profile settings">
            <Initials name={me.fullName} color={me.avatarColor} src={me.avatarUrl} />
          </Link>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      <EodLogoutDialog
        open={eodOpen}
        onOpenChange={setEodOpen}
        onDone={() => {
          logout();
          navigate({ to: "/", replace: true });
        }}
      />
    </div>
  );
}
