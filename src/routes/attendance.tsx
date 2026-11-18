import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  FileCheck2,
  ListChecks,
  Loader2,
  MapPin,
  Plane,
  Search,
  Send,
  Square,
  UserCheck,
  Users,
} from "lucide-react";
import { AppShell, EmptyState, Initials, PageHeader } from "@/components/app-shell";
import { StatCard, StatusPill } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp, dateKey, newId, isoNow } from "@/lib/store";
import { formatDistanceMeters } from "@/lib/geofence";
import { fmtTime, getRecordActualHours, hoursLabel, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  AttendanceRecord,
  AttendanceStatus,
  CompanyHoliday,
  Task,
  TaskProof,
  User,
} from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/attendance")({
  head: () => ({
    meta: [
      { title: "Attendance — SACE Portal" },
      {
        name: "description",
        content:
          "Attendance calendar with punch times, working hours, leave, holidays and week offs.",
      },
      { property: "og:title", content: "Attendance — SACE Portal" },
      {
        property: "og:description",
        content: "Attendance calendar with punch times, working hours, holidays and leave.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <AttendancePage />
    </AppShell>
  ),
});

const DOT: Record<AttendanceStatus, string> = {
  present: "bg-success/12 border-success/30",
  casual_leave: "bg-brand-purple/12 border-brand-purple/30",
  sick_leave: "bg-info/12 border-info/30",
  absent: "bg-destructive/10 border-destructive/25",
  week_off: "bg-muted border-border",
  holiday: "bg-amber-500/15 border-amber-500/40 text-amber-500",
};

function AttendancePage() {
  const { state, me, visibleUsers, attendanceStatus, punchInWithLocation, update, notify } =
    useApp();
  const isAdmin = me?.role !== "member";
  const [activeTab, setActiveTab] = React.useState<"daily" | "calendar">(
    isAdmin ? "daily" : "calendar",
  );
  const [selectedUserId, setSelectedUserId] = React.useState<string>(me?.id ?? "");
  const [dailyDate, setDailyDate] = React.useState(() => dateKey(new Date()));
  const [cursor, setCursor] = React.useState(() => new Date());
  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null);
  const [dailySearch, setDailySearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [deptFilter, setDeptFilter] = React.useState("all");
  const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>([]);
  const [punchBusy, setPunchBusy] = React.useState(false);
  const [geofenceError, setGeofenceError] = React.useState<{
    message: string;
    distanceMeters?: number;
    radiusMeters?: number;
  } | null>(null);

  React.useEffect(() => {
    if (me && !selectedUserId) {
      setSelectedUserId(me.id);
    }
  }, [me, selectedUserId]);

  if (!me) return null;

  const todayKey = dateKey(new Date());
  const myRecordToday = state.attendance.find((a) => a.userId === me.id && a.date === todayKey);
  const isPunchedIn = !!myRecordToday?.punchIn && !myRecordToday?.punchOut;

  // Punch actions for active user (enforces geofence + backend audit trail)
  const punchIn = async () => {
    if (myRecordToday?.punchIn || punchBusy) return;
    setPunchBusy(true);
    setGeofenceError(null);

    const res = await punchInWithLocation("attendance");
    setPunchBusy(false);

    if (!res.ok) {
      const msg =
        res.error ??
        "Access Denied: You are outside the office premises. Please move closer to punch in.";
      setGeofenceError({
        message: msg,
        ...(res.distanceMeters !== undefined ? { distanceMeters: res.distanceMeters } : {}),
        ...(res.radiusMeters !== undefined ? { radiusMeters: res.radiusMeters } : {}),
      });
      toast.error(msg);
      return;
    }

    setGeofenceError(null);
    toast.success(
      typeof res.distanceMeters === "number"
        ? `Punched in (${res.status} · ${formatDistanceMeters(res.distanceMeters)} from ${res.officeName ?? "office"}).`
        : "Punched in. Your daily attendance is now active.",
    );
  };

  const punchOut = () => {
    update((d) => {
      const r = d.attendance.find((a) => a.userId === me!.id && a.date === todayKey);
      if (r && r.punchIn) {
        r.punchOut = isoNow();
        r.hours = getRecordActualHours(r);
        r.status = "present";
      }
    });
    notify(me!.id, "Day completed", "Your working hours have been logged.", "/attendance");
    toast.success("Punched out. Attendance record updated.");
  };

  // Team scope
  const teamMembers = visibleUsers();
  const departments = Array.from(new Set(teamMembers.map((u) => u.department).filter(Boolean)));

  // Selected daily date calculations
  const parsedDaily = new Date(`${dailyDate}T00:00:00`);
  const isDailyToday = dailyDate === todayKey;
  const isDailyWeekend = parsedDaily.getDay() === 0 || parsedDaily.getDay() === 6;

  const roster = teamMembers.map((u) => {
    const rec = state.attendance.find((a) => a.userId === u.id && a.date === dailyDate);
    const status = attendanceStatus(u.id, parsedDaily);
    const proofsCount = state.tasks.filter(
      (t) =>
        t.assigneeId === u.id && t.proofs.some((p) => p.submittedAt.slice(0, 10) === dailyDate),
    ).length;
    const leave = state.leaves.find(
      (l) =>
        l.userId === u.id &&
        l.status === "approved" &&
        dailyDate >= l.startDate &&
        dailyDate <= l.endDate,
    );
    const isCurrentlyWorking = !!rec?.punchIn && !rec?.punchOut;

    return {
      user: u,
      record: rec,
      status,
      leave,
      proofsCount,
      isCurrentlyWorking,
    };
  });

  const filteredRoster = roster.filter((item) => {
    if (
      dailySearch &&
      !item.user.fullName.toLowerCase().includes(dailySearch.toLowerCase()) &&
      !item.user.designation.toLowerCase().includes(dailySearch.toLowerCase()) &&
      !item.user.email.toLowerCase().includes(dailySearch.toLowerCase())
    ) {
      return false;
    }
    if (deptFilter !== "all" && item.user.department !== deptFilter) return false;
    if (statusFilter !== "all") {
      if (statusFilter === "working" && !item.isCurrentlyWorking) return false;
      if (statusFilter === "completed" && (!item.record?.punchOut || item.isCurrentlyWorking))
        return false;
      if (
        statusFilter === "leave" &&
        item.status !== "casual_leave" &&
        item.status !== "sick_leave"
      )
        return false;
      if (statusFilter === "absent" && item.status !== "absent") return false;
      if (statusFilter === "present" && item.status !== "present") return false;
    }
    return true;
  });

  const totalMembers = teamMembers.length;
  const workingNow = roster.filter((r) => r.isCurrentlyWorking).length;
  const completedToday = roster.filter((r) => r.record?.punchOut && !r.isCurrentlyWorking).length;
  const onLeaveCount = roster.filter(
    (r) => r.status === "casual_leave" || r.status === "sick_leave",
  ).length;
  const absentCount = roster.filter((r) => r.status === "absent").length;

  // Bulk Selection Handlers
  const filteredIds = filteredRoster.map((r) => r.user.id);
  const isAllFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedUserIds.includes(id));

  const toggleSelectUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSelectAll = (mode: "all_filtered" | "all_team" | "working" | "absent" | "none") => {
    switch (mode) {
      case "all_filtered":
        setSelectedUserIds(filteredIds);
        toast.info(`Selected ${filteredIds.length} members`);
        break;
      case "all_team":
        setSelectedUserIds(teamMembers.map((u) => u.id));
        toast.info(`Selected all ${teamMembers.length} team members`);
        break;
      case "working": {
        const workingIds = roster.filter((r) => r.isCurrentlyWorking).map((r) => r.user.id);
        setSelectedUserIds(workingIds);
        toast.info(`Selected ${workingIds.length} currently working members`);
        break;
      }
      case "absent": {
        const absentIds = roster.filter((r) => r.status === "absent").map((r) => r.user.id);
        setSelectedUserIds(absentIds);
        toast.info(`Selected ${absentIds.length} absent members`);
        break;
      }
      case "none":
        setSelectedUserIds([]);
        break;
    }
  };

  // Bulk Actions
  const handleBulkMarkPresent = () => {
    if (!isAdmin) {
      toast.error("Admin access required.");
      return;
    }
    if (selectedUserIds.length === 0) return;
    update((d) => {
      selectedUserIds.forEach((uid) => {
        const existing = d.attendance.find((a) => a.userId === uid && a.date === dailyDate);
        if (existing) {
          existing.status = "present";
          if (!existing.punchIn) existing.punchIn = `${dailyDate}T09:00:00`;
          if (!existing.punchOut) existing.punchOut = `${dailyDate}T18:00:00`;
          existing.hours = 8.5;
        } else {
          d.attendance.push({
            id: newId(),
            userId: uid,
            date: dailyDate,
            punchIn: `${dailyDate}T09:00:00`,
            punchOut: `${dailyDate}T18:00:00`,
            hours: 8.5,
            status: "present",
          });
        }
      });
    });
    toast.success(`Marked ${selectedUserIds.length} members as Present (Full Day)`);
    setSelectedUserIds([]);
  };

  const handleBulkMarkWeekOff = () => {
    if (!isAdmin) {
      toast.error("Admin access required.");
      return;
    }
    if (selectedUserIds.length === 0) return;
    update((d) => {
      selectedUserIds.forEach((uid) => {
        const existing = d.attendance.find((a) => a.userId === uid && a.date === dailyDate);
        if (existing) {
          existing.status = "week_off";
          existing.hours = 0;
          existing.punchIn = null;
          existing.punchOut = null;
        } else {
          d.attendance.push({
            id: newId(),
            userId: uid,
            date: dailyDate,
            punchIn: null,
            punchOut: null,
            hours: 0,
            status: "week_off",
          });
        }
      });
    });
    toast.success(`Marked ${selectedUserIds.length} members for Week Off`);
    setSelectedUserIds([]);
  };

  const handleBulkSendReminder = () => {
    if (!isAdmin) {
      toast.error("Admin access required.");
      return;
    }
    if (selectedUserIds.length === 0) return;
    selectedUserIds.forEach((uid) => {
      notify(
        uid,
        "Attendance Punch Reminder",
        `Please ensure your punch in / punch out for ${dailyDate} is up to date.`,
        "/attendance",
      );
    });
    toast.success(`Sent attendance reminder notification to ${selectedUserIds.length} members`);
    setSelectedUserIds([]);
  };

  // Calendar Target User
  const target = state.users.find((u) => u.id === selectedUserId) ?? me!;
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = first.getDay();

  const recordFor = (d: Date) =>
    state.attendance.find((a) => a.userId === target.id && a.date === dateKey(d));

  const monthRecords = state.attendance.filter(
    (a) =>
      a.userId === target.id && a.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`),
  );
  const totalHours = monthRecords.reduce((s, r) => s + getRecordActualHours(r), 0);

  let workingDays = 0;
  let holidayWeekdays = 0;
  let presentDays = 0;
  let absents = 0;
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    const dayOfWeek = d.getDay();
    const isWk = dayOfWeek !== 0 && dayOfWeek !== 6;
    const dKey = dateKey(d);
    const isHoliday = (state.holidays || []).some((h: CompanyHoliday) => h.date === dKey);
    if (isWk) {
      if (isHoliday) {
        holidayWeekdays++;
      } else {
        workingDays++;
      }
    }
    const st = attendanceStatus(target.id, d);
    if (st === "present") presentDays++;
    if (st === "absent") absents++;
  }

  // Deduct 8h per holiday falling on a scheduled workday from monthly target expected hours
  const holidayDeductedHours = holidayWeekdays * 8;
  const standardExpectedHours = (workingDays + holidayWeekdays) * 8;
  const expectedHours = Math.max(0, workingDays * 8);
  const attendanceRate =
    expectedHours > 0 ? Math.min(100, Math.round((totalHours / expectedHours) * 100)) : 0;

  const selectedRecord = selectedDay ? recordFor(selectedDay) : null;
  const selectedHoliday = selectedDay
    ? (state.holidays || []).find((h: CompanyHoliday) => h.date === dateKey(selectedDay))
    : null;
  const selectedTasks = selectedDay
    ? state.tasks.filter(
        (t) =>
          t.assigneeId === target.id &&
          t.proofs.some((p) => p.submittedAt.slice(0, 10) === dateKey(selectedDay)),
      )
    : [];
  const selectedLeave = selectedDay
    ? state.leaves.find(
        (l) =>
          l.userId === target.id &&
          l.status === "approved" &&
          dateKey(selectedDay) >= l.startDate &&
          dateKey(selectedDay) <= l.endDate,
      )
    : null;

  return (
    <>
      <PageHeader
        title="Attendance Hub"
        description={
          isAdmin
            ? "Monitor real-time daily team attendance, punch times, working hours, and individual employee records."
            : "Track your daily punch status, working hours, leave calendar, and submitted task proofs."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!myRecordToday?.punchIn ? (
              <Button size="sm" disabled={punchBusy} onClick={punchIn} className="gap-2 shadow-sm">
                {punchBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MapPin className="h-4 w-4" />
                )}
                {punchBusy ? "Verifying GPS..." : "Punch in today"}
              </Button>
            ) : isPunchedIn ? (
              <Button size="sm" variant="destructive" onClick={punchOut} className="gap-2">
                <Clock className="h-4 w-4" /> Punch out
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                <CalendarCheck className="h-3.5 w-3.5 text-success" /> Today complete (
                {hoursLabel(getRecordActualHours(myRecordToday))})
              </span>
            )}
          </div>
        }
      />

      {geofenceError && !myRecordToday?.punchIn && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-xs text-destructive"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">{geofenceError.message}</p>
            {typeof geofenceError.distanceMeters === "number" &&
              typeof geofenceError.radiusMeters === "number" && (
                <p className="text-[11px] opacity-90 tabular-nums">
                  Current distance: {formatDistanceMeters(geofenceError.distanceMeters)} · Allowed
                  office radius: {formatDistanceMeters(geofenceError.radiusMeters)}
                </p>
              )}
          </div>
        </div>
      )}

      {isAdmin ? (
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "daily" | "calendar")}
          className="space-y-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <TabsList className="grid grid-cols-2 w-72">
              <TabsTrigger value="daily" className="gap-1.5">
                <UserCheck className="h-4 w-4" /> Daily Roster
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-1.5">
                <CalendarDays className="h-4 w-4" /> Monthly View
              </TabsTrigger>
            </TabsList>

            {activeTab === "daily" && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Previous day"
                  onClick={() => {
                    const prev = new Date(parsedDaily);
                    prev.setDate(prev.getDate() - 1);
                    setDailyDate(dateKey(prev));
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Input
                  type="date"
                  value={dailyDate}
                  onChange={(e) => e.target.value && setDailyDate(e.target.value)}
                  className="w-40 text-xs font-medium"
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Next day"
                  onClick={() => {
                    const next = new Date(parsedDaily);
                    next.setDate(next.getDate() + 1);
                    setDailyDate(dateKey(next));
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                {dailyDate !== todayKey && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDailyDate(todayKey)}
                    className="text-xs"
                  >
                    Today
                  </Button>
                )}
              </div>
            )}
          </div>

          <TabsContent value="daily" className="space-y-6 m-0">
            {/* Daily Stat Cards */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                label="Total Team"
                value={totalMembers}
                icon={Users}
                hint={`${parsedDaily.toLocaleDateString([], { month: "short", day: "numeric", weekday: "short" })}`}
              />
              <StatCard
                label="Working Now"
                value={workingNow}
                icon={UserCheck}
                accent="teal"
                hint={isDailyToday ? "Active punch-in" : "Punched in on date"}
              />
              <StatCard
                label="Completed Day"
                value={completedToday}
                icon={CalendarCheck}
                accent="success"
              />
              <StatCard
                label="On Leave"
                value={onLeaveCount}
                icon={Plane}
                accent="purple"
                hint="Approved leave"
              />
              <StatCard
                label={isDailyWeekend ? "Week Off" : "Absent / Not in"}
                value={isDailyWeekend ? totalMembers : absentCount}
                icon={Clock}
                {...(isDailyWeekend ? { accent: "teal" as const } : {})}
              />
            </div>

            {/* Daily Controls & Select All Dropdown */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                {/* Select All Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-medium">
                      <ListChecks className="h-4 w-4 text-primary" />
                      <span>
                        {selectedUserIds.length > 0
                          ? `Selected (${selectedUserIds.length})`
                          : "Select All / Filtered"}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-0.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel className="text-xs">
                      Batch Selection Options
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleSelectAll("all_filtered")}
                      className="text-xs cursor-pointer"
                    >
                      <CheckSquare className="h-3.5 w-3.5 mr-2 text-primary" />
                      Select All Filtered ({filteredRoster.length})
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleSelectAll("all_team")}
                      className="text-xs cursor-pointer"
                    >
                      <Users className="h-3.5 w-3.5 mr-2" />
                      Select All Team ({teamMembers.length})
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleSelectAll("working")}
                      className="text-xs cursor-pointer"
                    >
                      <UserCheck className="h-3.5 w-3.5 mr-2 text-teal-600" />
                      Select Currently Working ({workingNow})
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleSelectAll("absent")}
                      className="text-xs cursor-pointer"
                    >
                      <Clock className="h-3.5 w-3.5 mr-2 text-destructive" />
                      Select Absent ({absentCount})
                    </DropdownMenuItem>
                    {selectedUserIds.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleSelectAll("none")}
                          className="text-xs text-muted-foreground cursor-pointer"
                        >
                          <Square className="h-3.5 w-3.5 mr-2" />
                          Deselect All
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="relative min-w-[180px] max-w-xs flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search employee or role…"
                    value={dailySearch}
                    onChange={(e) => setDailySearch(e.target.value)}
                    className="pl-9 text-xs h-9"
                  />
                </div>
                <Select value={deptFilter} onValueChange={setDeptFilter}>
                  <SelectTrigger className="w-36 text-xs h-9">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36 text-xs h-9">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="working">Currently Working</SelectItem>
                    <SelectItem value="completed">Completed Day</SelectItem>
                    <SelectItem value="present">Present (Any)</SelectItem>
                    <SelectItem value="leave">On Leave</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Showing {filteredRoster.length} of {totalMembers} members
              </p>
            </div>

            {/* Bulk Action Toolbar when items are selected */}
            {selectedUserIds.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="default"
                    className="bg-primary text-primary-foreground font-semibold"
                  >
                    {selectedUserIds.length} selected
                  </Badge>
                  <span className="text-muted-foreground">Batch actions for chosen employees:</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBulkMarkPresent}
                    className="h-8 text-xs gap-1"
                  >
                    <Check className="h-3.5 w-3.5 text-success" /> Mark Full Day Present
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBulkMarkWeekOff}
                    className="h-8 text-xs gap-1"
                  >
                    <Clock className="h-3.5 w-3.5" /> Mark Week Off
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBulkSendReminder}
                    className="h-8 text-xs gap-1"
                  >
                    <Send className="h-3.5 w-3.5 text-primary" /> Send Punch Reminder
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedUserIds([])}
                    className="h-8 text-xs text-muted-foreground"
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            )}

            {/* Daily Roster Table */}
            <Card className="rounded-2xl overflow-hidden border">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="w-10 px-4 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isAllFilteredSelected}
                            onChange={(e) =>
                              handleSelectAll(e.target.checked ? "all_filtered" : "none")
                            }
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                            title="Select / Deselect all filtered rows"
                          />
                        </th>
                        <th className="px-4 py-3.5 font-semibold">Employee</th>
                        <th className="px-4 py-3.5 font-semibold">Department</th>
                        <th className="px-4 py-3.5 font-semibold">Punch In</th>
                        <th className="px-4 py-3.5 font-semibold">Punch Out</th>
                        <th className="px-4 py-3.5 font-semibold">Hours</th>
                        <th className="px-4 py-3.5 font-semibold">Status</th>
                        <th className="px-4 py-3.5 font-semibold">Proofs</th>
                        <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredRoster.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-10 text-center text-muted-foreground">
                            No team members match the search and filter criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredRoster.map(
                          ({ user, record, status, leave, proofsCount, isCurrentlyWorking }) => {
                            const isSelected = selectedUserIds.includes(user.id);
                            return (
                              <tr
                                key={user.id}
                                className={cn(
                                  "transition-colors hover:bg-muted/40 group",
                                  isSelected && "bg-primary/5 hover:bg-primary/10",
                                )}
                              >
                                <td className="w-10 px-4 py-4 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelectUser(user.id)}
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                                  />
                                </td>
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-3">
                                    <Initials
                                      name={user.fullName}
                                      color={user.avatarColor}
                                      src={user.avatarUrl}
                                      size={36}
                                    />
                                    <div className="min-w-0">
                                      <p className="font-semibold text-foreground truncate">
                                        {user.fullName}
                                        {user.id === me!.id && (
                                          <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                                            (You)
                                          </span>
                                        )}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {user.designation}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-xs font-medium text-muted-foreground">
                                  {user.department || "General"}
                                </td>
                                <td className="px-4 py-4 text-xs tabular-nums">
                                  {record?.punchIn ? (
                                    <div className="space-y-0.5">
                                      <span className="font-semibold text-foreground block">
                                        {fmtTime(record.punchIn)}
                                      </span>
                                      {record.geofenceStatus && (
                                        <span className="text-[11px] text-muted-foreground">
                                          {record.geofenceStatus}
                                          {typeof record.punchInDistanceMeters === "number"
                                            ? ` · ${formatDistanceMeters(record.punchInDistanceMeters)}`
                                            : ""}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-4 text-xs tabular-nums">
                                  {record?.punchOut ? (
                                    <span className="font-semibold text-foreground">
                                      {fmtTime(record.punchOut)}
                                    </span>
                                  ) : isCurrentlyWorking ? (
                                    <span className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 font-medium animate-pulse">
                                      <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                                      Active
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-4 text-xs tabular-nums font-medium">
                                  {record?.punchIn
                                    ? record?.punchOut
                                      ? hoursLabel(getRecordActualHours(record))
                                      : "In progress"
                                    : "0h 0m"}
                                </td>
                                <td className="px-4 py-4">
                                  {isCurrentlyWorking ? (
                                    <StatusPill value="present" label="Working" />
                                  ) : record?.punchOut ? (
                                    <StatusPill value="completed" label="Day Complete" />
                                  ) : leave ? (
                                    <StatusPill
                                      value={
                                        leave.type === "casual" ? "casual_leave" : "sick_leave"
                                      }
                                      label={`${titleCase(leave.type)} Leave`}
                                    />
                                  ) : (
                                    <StatusPill value={status} />
                                  )}
                                </td>
                                <td className="px-4 py-4 text-xs">
                                  {proofsCount > 0 ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                                      <FileCheck2 className="h-3 w-3" />
                                      {proofsCount} {proofsCount === 1 ? "proof" : "proofs"}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">0</span>
                                  )}
                                </td>
                                <td className="px-5 py-4 text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 gap-1.5 text-xs"
                                    onClick={() => {
                                      setSelectedUserId(user.id);
                                      setActiveTab("calendar");
                                    }}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    Calendar
                                  </Button>
                                </td>
                              </tr>
                            );
                          },
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calendar" className="space-y-6 m-0">
            {/* Calendar View Component */}
            <AttendanceCalendarView
              target={target}
              selectedUserId={selectedUserId}
              setSelectedUserId={setSelectedUserId}
              visibleUsers={teamMembers}
              cursor={cursor}
              setCursor={setCursor}
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
              canSeeOthers={isAdmin}
              year={year}
              month={month}
              first={first}
              daysInMonth={daysInMonth}
              lead={lead}
              monthRecords={monthRecords}
              totalHours={totalHours}
              expectedHours={expectedHours}
              attendanceRate={attendanceRate}
              presentDays={presentDays}
              workingDays={workingDays}
              holidayWeekdays={holidayWeekdays}
              holidayDeductedHours={holidayDeductedHours}
              absents={absents}
              recordFor={recordFor}
              attendanceStatus={attendanceStatus}
              state={state}
              selectedRecord={selectedRecord}
              selectedHoliday={selectedHoliday}
              selectedTasks={selectedTasks}
              selectedLeave={selectedLeave}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <AttendanceCalendarView
          target={target}
          selectedUserId={selectedUserId}
          setSelectedUserId={setSelectedUserId}
          visibleUsers={teamMembers}
          cursor={cursor}
          setCursor={setCursor}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          canSeeOthers={false}
          year={year}
          month={month}
          first={first}
          daysInMonth={daysInMonth}
          lead={lead}
          monthRecords={monthRecords}
          totalHours={totalHours}
          expectedHours={expectedHours}
          attendanceRate={attendanceRate}
          presentDays={presentDays}
          workingDays={workingDays}
          holidayWeekdays={holidayWeekdays}
          holidayDeductedHours={holidayDeductedHours}
          absents={absents}
          recordFor={recordFor}
          attendanceStatus={attendanceStatus}
          state={state}
          selectedRecord={selectedRecord}
          selectedHoliday={selectedHoliday}
          selectedTasks={selectedTasks}
          selectedLeave={selectedLeave}
        />
      )}
    </>
  );
}

interface CalendarViewProps {
  target: User;
  selectedUserId: string;
  setSelectedUserId: (id: string) => void;
  visibleUsers: User[];
  cursor: Date;
  setCursor: (d: Date) => void;
  selectedDay: Date | null;
  setSelectedDay: (d: Date | null) => void;
  canSeeOthers: boolean;
  year: number;
  month: number;
  first: Date;
  daysInMonth: number;
  lead: number;
  monthRecords: AttendanceRecord[];
  totalHours: number;
  expectedHours: number;
  attendanceRate: number;
  presentDays: number;
  workingDays: number;
  holidayWeekdays: number;
  holidayDeductedHours: number;
  absents: number;
  recordFor: (d: Date) => AttendanceRecord | undefined;
  attendanceStatus: (id: string, d: Date) => AttendanceStatus;
  state: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  selectedRecord: AttendanceRecord | null | undefined;
  selectedHoliday: CompanyHoliday | null | undefined;
  selectedTasks: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  selectedLeave: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function AttendanceCalendarView(props: CalendarViewProps) {
  const {
    target,
    selectedUserId,
    setSelectedUserId,
    visibleUsers,
    cursor,
    setCursor,
    selectedDay,
    setSelectedDay,
    canSeeOthers,
    year,
    month,
    first,
    daysInMonth,
    lead,
    monthRecords,
    totalHours,
    expectedHours,
    attendanceRate,
    presentDays,
    workingDays,
    holidayWeekdays,
    holidayDeductedHours,
    absents,
    recordFor,
    attendanceStatus,
    state,
    selectedRecord,
    selectedHoliday,
    selectedTasks,
    selectedLeave,
  } = props;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {canSeeOthers && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Viewing:
            </span>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {visibleUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName} ({u.department || "General"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Present days"
          value={presentDays}
          hint={`${presentDays} of ${workingDays} working days`}
        />
        <StatCard
          label="Total hours"
          value={hoursLabel(totalHours)}
          {...(expectedHours > 0
            ? {
                hint: `${expectedHours}h target${holidayDeductedHours > 0 ? ` (-${holidayDeductedHours}h holidays)` : ""}`,
              }
            : {})}
          accent="purple"
        />
        <StatCard
          label="Attendance rate"
          value={`${attendanceRate}%`}
          {...(expectedHours > 0
            ? { hint: `${hoursLabel(totalHours)} of ${expectedHours}h target` }
            : {})}
          accent="teal"
        />
        <StatCard label="Absent days" value={absents} accent="success" />
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">
            {first.toLocaleDateString([], { month: "long", year: "numeric" })} — {target.fullName}
          </CardTitle>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous month"
              onClick={() => setCursor(new Date(year, month - 1, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next month"
              onClick={() => setCursor(new Date(year, month + 1, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground sm:gap-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-2">
            {Array.from({ length: lead }).map((_, i) => (
              <div key={`lead-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = new Date(year, month, i + 1);
              const status = attendanceStatus(target.id, d);
              const rec = recordFor(d);
              const isToday = dateKey(d) === dateKey(new Date());
              const holiday = (state.holidays || []).find(
                (h: CompanyHoliday) => h.date === dateKey(d),
              );
              const proofCount = state.tasks.filter(
                (t: Task) =>
                  t.assigneeId === target.id &&
                  t.proofs.some((p: TaskProof) => p.submittedAt.slice(0, 10) === dateKey(d)),
              ).length;
              return (
                <button
                  key={dateKey(d)}
                  onClick={() => setSelectedDay(d)}
                  className={cn(
                    "min-h-16 rounded-xl border p-1.5 text-left transition-colors hover:brightness-95 sm:min-h-24 sm:p-2",
                    DOT[status],
                    isToday && "ring-2 ring-primary",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{i + 1}</span>
                    {holiday && (
                      <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-500 uppercase tracking-tight">
                        Holiday
                      </span>
                    )}
                  </div>
                  <span className="mt-1 block text-[10px] leading-tight text-muted-foreground sm:text-xs">
                    {status === "holiday" ? (
                      <span className="font-semibold text-amber-500 truncate block">
                        {holiday?.name || "Company Holiday"}
                      </span>
                    ) : status === "present" ? (
                      `${fmtTime(rec?.punchIn)}–${fmtTime(rec?.punchOut)}`
                    ) : status === "week_off" ? (
                      holiday ? (
                        <span className="text-amber-500 font-medium">Holiday ({holiday.name})</span>
                      ) : (
                        "Week off"
                      )
                    ) : (
                      titleCase(status)
                    )}
                  </span>
                  {status === "present" && (
                    <span className="mt-0.5 hidden text-[10px] text-muted-foreground sm:block">
                      {holiday ? (
                        <span className="text-amber-500 font-medium">
                          Holiday Worked · {hoursLabel(getRecordActualHours(rec))}
                        </span>
                      ) : (
                        `${hoursLabel(getRecordActualHours(rec))} · ${proofCount} proof${proofCount === 1 ? "" : "s"}`
                      )}
                    </span>
                  )}
                  {status === "holiday" && (
                    <span className="mt-0.5 hidden text-[10px] text-amber-500/80 sm:block font-medium">
                      8h credited to target
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {(
              [
                "present",
                "casual_leave",
                "sick_leave",
                "absent",
                "week_off",
                "holiday",
              ] as AttendanceStatus[]
            ).map((s) => (
              <StatusPill key={s} value={s} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedDay} onOpenChange={(o) => !o && setSelectedDay(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedDay?.toLocaleDateString([], {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </DialogTitle>
          </DialogHeader>
          {selectedDay ? (
            <div className="space-y-3 text-sm">
              {selectedHoliday && (
                <div className="rounded-xl border border-purple-500/30 bg-purple-900/90 p-3 text-xs text-white">
                  <div className="flex items-center justify-between mb-1 font-semibold text-white">
                    <span>🎉 {selectedHoliday.name}</span>
                    <span className="rounded-full bg-purple-800 px-2 py-0.5 text-[10px] text-purple-200">
                      Official Company Holiday
                    </span>
                  </div>
                  {selectedHoliday.description && (
                    <p className="text-purple-100 mt-1">{selectedHoliday.description}</p>
                  )}
                  <p className="mt-1.5 text-[11px] text-purple-200 font-medium">
                    ✨ 8 hours automatically deducted from your monthly target expected hours.
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusPill value={attendanceStatus(target.id, selectedDay)} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Punch in</span>
                <span>{fmtTime(selectedRecord?.punchIn)}</span>
              </div>
              {selectedRecord?.geofenceStatus && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Location audit</span>
                  <span className="tabular-nums text-xs font-medium text-foreground">
                    {selectedRecord.geofenceStatus}
                    {typeof selectedRecord.punchInDistanceMeters === "number"
                      ? ` · ${formatDistanceMeters(selectedRecord.punchInDistanceMeters)}`
                      : ""}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Punch out</span>
                <span>{fmtTime(selectedRecord?.punchOut)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total hours</span>
                <span className="font-semibold text-foreground">
                  {hoursLabel(getRecordActualHours(selectedRecord))}
                </span>
              </div>
              {selectedLeave ? (
                <p className="rounded-xl bg-muted p-3 text-xs">
                  {titleCase(selectedLeave.type)} leave approved · {selectedLeave.reason}
                </p>
              ) : null}
              <div>
                <p className="mb-1 text-muted-foreground">Submitted tasks</p>
                {selectedTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No proof submitted on this date.</p>
                ) : (
                  selectedTasks.map((t: Task) => (
                    <div key={t.id} className="rounded-lg border border-border p-2 text-xs mb-2">
                      <p className="font-medium">{t.title}</p>
                      {t.proofs.map((p: TaskProof) => (
                        <p key={p.id} className="text-muted-foreground">
                          {titleCase(p.type)}: {p.value}
                        </p>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
