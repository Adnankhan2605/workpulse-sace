import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Building2, FileBarChart, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp, dateKey } from "@/lib/store";
import { getRecordActualHours, monthKey } from "@/lib/format";

const PRESET_DEPARTMENTS = [
  "Academics & Admissions",
  "DevOps & Engineering",
  "Administration",
  "Transport",
];

interface MemberPerformanceDatum {
  userId: string;
  name: string;
  shortName: string;
  department: string;
  designation: string;
  attendancePct: number;
  hoursWorked: number;
  completedTasks: number;
  totalTasks: number;
  taskConversionRate: number;
}

export default function DepartmentPerformanceWidget() {
  const { state, me, visibleUsers } = useApp();
  const [selectedDepartment, setSelectedDepartment] = React.useState<string>("all");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isAdminRole = me?.role === "admin" || me?.role === "super_admin";

  const teamMembers = React.useMemo(() => {
    if (!me || !isAdminRole) return [];
    return visibleUsers().filter((u) => u.active !== false && u.id !== me.id);
  }, [me, isAdminRole, visibleUsers]);

  const departments = React.useMemo(() => {
    const fromUsers = teamMembers.map((u) => u.department?.trim()).filter(Boolean) as string[];
    return Array.from(new Set([...fromUsers, ...PRESET_DEPARTMENTS]));
  }, [teamMembers]);

  const memberMetrics = React.useMemo<MemberPerformanceDatum[]>(() => {
    const today = new Date();
    const todayStr = dateKey(today);
    const mk = monthKey(today);
    const nowMs = Date.now();

    let workingDays = 0;
    for (let d = 1; d <= today.getDate(); d++) {
      const dd = new Date(today.getFullYear(), today.getMonth(), d);
      const isWk = dd.getDay() !== 0 && dd.getDay() !== 6;
      const dKey = dateKey(dd);
      const isHol = (state.holidays || []).some((h) => h.date === dKey);
      if (isWk && !isHol) workingDays++;
    }
    const expectedMonthHours = Math.max(1, workingDays * 8);

    return teamMembers.map((u) => {
      const monthRecords = state.attendance.filter(
        (a) => a.userId === u.id && a.date.startsWith(mk),
      );
      const monthHours = monthRecords.reduce((sum, r) => {
        if (r.date === todayStr && r.punchIn && !r.punchOut) {
          return sum + Math.max(0, (nowMs - new Date(r.punchIn).getTime()) / 3600000);
        }
        return sum + getRecordActualHours(r, nowMs);
      }, 0);

      const attendancePct = Math.min(100, Math.round((monthHours / expectedMonthHours) * 100));

      const userTasks = state.tasks.filter((t) => t.assigneeId === u.id);
      const completedTasks = userTasks.filter((t) =>
        ["approved", "completed"].includes(t.status),
      ).length;
      const totalTasks = userTasks.length;
      const taskConversionRate =
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      const firstName = u.fullName.split(" ")[0] || u.fullName;

      return {
        userId: u.id,
        name: u.fullName,
        shortName: firstName,
        department: u.department?.trim() || "General",
        designation: u.designation || "Team Member",
        attendancePct,
        hoursWorked: Math.round(monthHours * 10) / 10,
        completedTasks,
        totalTasks,
        taskConversionRate,
      };
    });
  }, [teamMembers, state.attendance, state.tasks, state.holidays]);

  const filteredMetrics = React.useMemo(() => {
    if (selectedDepartment === "all") return memberMetrics;
    return memberMetrics.filter(
      (m) => m.department.toLowerCase() === selectedDepartment.toLowerCase(),
    );
  }, [memberMetrics, selectedDepartment]);

  const summary = React.useMemo(() => {
    if (filteredMetrics.length === 0) {
      return { avgAttendance: 0, totalCompleted: 0, avgConversion: 0 };
    }
    const avgAttendance = Math.round(
      filteredMetrics.reduce((sum, m) => sum + m.attendancePct, 0) / filteredMetrics.length,
    );
    const totalCompleted = filteredMetrics.reduce((sum, m) => sum + m.completedTasks, 0);
    const avgConversion = Math.round(
      filteredMetrics.reduce((sum, m) => sum + m.taskConversionRate, 0) / filteredMetrics.length,
    );
    return { avgAttendance, totalCompleted, avgConversion };
  }, [filteredMetrics]);

  // Strict RBAC guard: hidden from regular team members
  if (!isAdminRole) {
    return null;
  }

  return (
    <Card className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      <div className="h-1 w-full bg-gradient-to-r from-[#8A007E] via-purple-600 to-amber-500" />
      <CardHeader className="flex flex-col gap-4 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#8A007E] dark:text-purple-400" />
            <CardTitle className="text-base font-bold sm:text-lg">
              Department Performance Analytics
            </CardTitle>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Attendance percentage, completed tasks, and task conversion rate by team member.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
            <SelectTrigger className="w-56 text-xs" aria-label="Filter performance by department">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept} value={dept}>
                  {dept}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-2">
        {/* Department KPI Summary Strip */}
        <div className="grid grid-cols-1 gap-4 border-y border-border/60 py-3 sm:grid-cols-3">
          <div className="flex items-center justify-between sm:block">
            <p className="text-xs text-muted-foreground">Avg. Attendance</p>
            <p className="text-xl font-bold tabular-nums text-foreground">
              {summary.avgAttendance}%
            </p>
          </div>
          <div className="flex items-center justify-between sm:block">
            <p className="text-xs text-muted-foreground">Completed Tasks</p>
            <p className="text-xl font-bold tabular-nums text-foreground">
              {summary.totalCompleted}
            </p>
          </div>
          <div className="flex items-center justify-between sm:block">
            <p className="text-xs text-muted-foreground">Avg. Conversion Rate</p>
            <p className="text-xl font-bold tabular-nums text-foreground">
              {summary.avgConversion}%
            </p>
          </div>
        </div>

        {filteredMetrics.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Users className="h-8 w-8 text-muted-foreground/60 mb-2" />
            <p className="text-sm font-medium text-foreground">
              {selectedDepartment === "all"
                ? "No active team members found"
                : `No active team members in ${selectedDepartment}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground max-w-md">
              Select another department or view all departments to inspect workforce performance.
            </p>
            {selectedDepartment !== "all" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setSelectedDepartment("all")}
              >
                Show All Departments
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Legend Row */}
            <div className="flex flex-wrap items-center gap-5 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#8A007E]" />
                <span>Attendance %</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                <span>Completed Tasks</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-purple-400" />
                <span>Task Conversion Rate %</span>
              </div>
            </div>

            {/* Interactive Bar Chart */}
            <div className="h-[280px] w-full">
              {!mounted ? (
                <div className="h-full w-full animate-pulse rounded-xl bg-muted/40" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={filteredMetrics}
                    margin={{ top: 10, right: 8, left: -16, bottom: 0 }}
                    barGap={6}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      className="stroke-border/50"
                    />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: "currentColor" }}
                      className="text-muted-foreground"
                    />
                    <YAxis
                      yAxisId="pct"
                      domain={[0, 100]}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `${val}%`}
                      tick={{ fontSize: 11, fill: "currentColor" }}
                      className="text-muted-foreground"
                    />
                    <YAxis
                      yAxisId="count"
                      orientation="right"
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "currentColor" }}
                      className="text-muted-foreground"
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                      content={<CustomPerformanceTooltip />}
                    />
                    <Bar
                      yAxisId="pct"
                      dataKey="attendancePct"
                      name="Attendance %"
                      fill="#8A007E"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={28}
                    />
                    <Bar
                      yAxisId="count"
                      dataKey="completedTasks"
                      name="Completed Tasks"
                      fill="#F59E0B"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={28}
                    />
                    <Bar
                      yAxisId="pct"
                      dataKey="taskConversionRate"
                      name="Task Conversion Rate %"
                      fill="#C084FC"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Clean Member Breakdown Table */}
            <div className="overflow-x-auto border-t border-border/60 pt-3">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/60">
                    <th className="py-2 pr-4 font-medium">Team Member</th>
                    <th className="py-2 px-3 font-medium">Department</th>
                    <th className="py-2 px-3 font-medium text-right">Attendance</th>
                    <th className="py-2 px-3 font-medium text-right">Completed Tasks</th>
                    <th className="py-2 pl-3 font-medium text-right">Conversion Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredMetrics.map((m) => (
                    <tr key={m.userId} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-4 font-medium text-foreground">
                        {m.name}
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          {m.designation}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{m.department}</td>
                      <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-foreground">
                        {m.attendancePct}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-foreground">
                        {m.completedTasks}
                        <span className="text-muted-foreground font-normal">/{m.totalTasks}</span>
                      </td>
                      <td className="py-2.5 pl-3 text-right font-semibold tabular-nums text-purple-600 dark:text-purple-400">
                        {m.taskConversionRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Detailed Reports Navigation Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <p className="text-xs text-muted-foreground">
            Showing {filteredMetrics.length}{" "}
            {filteredMetrics.length === 1 ? "team member" : "team members"}
            {selectedDepartment !== "all" ? ` in ${selectedDepartment}` : " across all departments"}
          </p>
          <Button
            asChild
            className="bg-gradient-to-r from-[#8A007E] to-purple-700 text-white shadow-sm hover:from-[#730068] hover:to-purple-600 whitespace-nowrap shrink-0"
          >
            <Link to="/reports">
              <FileBarChart className="h-4 w-4" />
              View Detailed Reports
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomPerformanceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: MemberPerformanceDatum }>;
}) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  return (
    <div className="rounded-xl border border-border bg-popover/95 p-3 text-popover-foreground shadow-lg backdrop-blur-md">
      <div className="border-b border-border/60 pb-1.5 mb-2">
        <p className="text-xs font-semibold text-foreground">{d.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {d.department} · {d.designation}
        </p>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">Attendance %:</span>
          <span className="font-bold tabular-nums text-foreground">{d.attendancePct}%</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">Completed Tasks:</span>
          <span className="font-bold tabular-nums text-amber-500">
            {d.completedTasks} / {d.totalTasks}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">Task Conversion Rate:</span>
          <span className="font-bold tabular-nums text-purple-400">{d.taskConversionRate}%</span>
        </div>
      </div>
    </div>
  );
}
