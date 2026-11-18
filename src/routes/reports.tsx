import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Award,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileBarChart,
  FileCheck,
  FileText,
  HelpCircle,
  Printer,
  Sparkles,
  Star,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { AppShell, NoAccess, Initials, PageHeader } from "@/components/app-shell";
import { StatCard, StatusPill } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp, dateKey } from "@/lib/store";
import { hoursLabel, titleCase } from "@/lib/format";
import { sanitizeCsvCell } from "@/lib/security";
import { cn } from "@/lib/utils";
import { SaceLogo } from "@/components/sace-logo";
import type { AppState, AttendanceRecord, EodReport, Task, User } from "@/lib/types";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Progress & Performance Reports — SACE Portal" },
      {
        name: "description",
        content: "Automated end-of-month employee performance reports and workforce analytics.",
      },
      { property: "og:title", content: "Progress & Performance Reports — SACE Portal" },
      {
        property: "og:description",
        content: "Automated end-of-month employee performance reports and workforce analytics.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <ReportsPage />
    </AppShell>
  ),
});

interface MonthlyEmployeePerf {
  user: User;
  daysPresent: number;
  totalWorkingDays: number;
  attendanceRate: number;
  hoursWorked: number;
  avgDailyHours: number;
  tasksAssigned: number;
  tasksDone: number;
  taskCompletionRate: number;
  proofsSubmitted: number;
  eodsSubmitted: number;
  eodRate: number;
  score: number;
  grade: "A+" | "A" | "B" | "C" | "D";
  strengths: string[];
  recommendation: string;
}

function calculateMonthlyPerformance(
  users: User[],
  state: AppState,
  year: number,
  month: number, // 0-indexed
): {
  data: MonthlyEmployeePerf[];
  totalTeamHours: number;
  avgCompletionRate: number;
  avgAttendanceRate: number;
  topPerformer: MonthlyEmployeePerf | null;
} {
  const monthStr = String(month + 1).padStart(2, "0");
  const prefix = `${year}-${monthStr}`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let totalWorkingDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month, d).getDay();
    if (day !== 0 && day !== 6) totalWorkingDays++;
  }

  const results: MonthlyEmployeePerf[] = users.map((u) => {
    // Attendance in month
    const userAtt = state.attendance.filter(
      (a: AttendanceRecord) =>
        a.userId === u.id && a.date.startsWith(prefix) && a.status === "present",
    );
    const daysPresent = userAtt.length;
    const hoursWorked = userAtt.reduce(
      (sum: number, a: AttendanceRecord) => sum + (a.hours || 0),
      0,
    );
    const avgDailyHours = daysPresent > 0 ? Math.round((hoursWorked / daysPresent) * 10) / 10 : 0;
    const attendanceRate =
      totalWorkingDays > 0 ? Math.min(100, Math.round((daysPresent / totalWorkingDays) * 100)) : 0;

    // Tasks in month
    const userTasks = state.tasks.filter((t: Task) => {
      if (t.assigneeId !== u.id) return false;
      const startMonth = t.startDate ? t.startDate.slice(0, 7) : "";
      const dueMonth = t.dueDate ? t.dueDate.slice(0, 7) : "";
      return startMonth === prefix || dueMonth === prefix || (!t.startDate && !t.dueDate);
    });

    const tasksAssigned = userTasks.length;
    const tasksDone = userTasks.filter(
      (t: Task) => t.status === "completed" || t.status === "approved",
    ).length;
    const taskCompletionRate =
      tasksAssigned > 0 ? Math.round((tasksDone / tasksAssigned) * 100) : 100;

    // Task proofs in month
    const proofsSubmitted = userTasks.reduce(
      (acc: number, t: Task) =>
        acc +
        (t.proofs
          ? t.proofs.filter((p) => p.submittedAt && p.submittedAt.startsWith(prefix)).length
          : 0),
      0,
    );

    // EOD reports in month
    const eodsSubmitted = state.eodReports.filter(
      (e: EodReport) => e.userId === u.id && e.date.startsWith(prefix),
    ).length;
    const eodRate =
      daysPresent > 0 ? Math.min(100, Math.round((eodsSubmitted / daysPresent) * 100)) : 0;

    // Performance Score Algorithm:
    // 40% Task Completion + 30% Attendance + 20% EOD Compliance + 10% Proof Verification
    const proofBonus = Math.min(100, (proofsSubmitted / Math.max(1, tasksDone)) * 100);
    const score = Math.round(
      taskCompletionRate * 0.4 + attendanceRate * 0.3 + eodRate * 0.2 + proofBonus * 0.1,
    );

    let grade: "A+" | "A" | "B" | "C" | "D" = "C";
    if (score >= 90) grade = "A+";
    else if (score >= 80) grade = "A";
    else if (score >= 70) grade = "B";
    else if (score >= 55) grade = "C";
    else grade = "D";

    // Strengths generator
    const strengths: string[] = [];
    if (taskCompletionRate >= 90) strengths.push("Exceptional task delivery rate");
    if (attendanceRate >= 90) strengths.push("Punctual and consistent monthly attendance");
    if (eodRate >= 85) strengths.push("High discipline in daily EOD reporting");
    if (proofsSubmitted >= tasksDone && tasksDone > 0)
      strengths.push("Thorough verification proofs attached");
    if (hoursWorked >= 160) strengths.push("High productive shift dedication");
    if (strengths.length === 0) strengths.push("Steady workflow contributor");

    // Recommendations
    let recommendation = "Maintain strong momentum across all project deliverables.";
    if (taskCompletionRate < 75)
      recommendation = "Focus on closing open assigned tasks before cycle end.";
    else if (eodRate < 70)
      recommendation = "Ensure daily EOD punchout reports are submitted consistently.";
    else if (attendanceRate < 75)
      recommendation = "Improve daily roster attendance and shift regularity.";

    return {
      user: u,
      daysPresent,
      totalWorkingDays,
      attendanceRate,
      hoursWorked,
      avgDailyHours,
      tasksAssigned,
      tasksDone,
      taskCompletionRate,
      proofsSubmitted,
      eodsSubmitted,
      eodRate,
      score,
      grade,
      strengths,
      recommendation,
    };
  });

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  const totalTeamHours = results.reduce((acc, r) => acc + r.hoursWorked, 0);
  const avgCompletionRate =
    results.length > 0
      ? Math.round(results.reduce((acc, r) => acc + r.taskCompletionRate, 0) / results.length)
      : 0;
  const avgAttendanceRate =
    results.length > 0
      ? Math.round(results.reduce((acc, r) => acc + r.attendanceRate, 0) / results.length)
      : 0;

  return {
    data: results,
    totalTeamHours,
    avgCompletionRate,
    avgAttendanceRate,
    topPerformer: results[0] || null,
  };
}

function ReportsPage() {
  const { state, can, visibleUsers } = useApp();
  const [activeTab, setActiveTab] = React.useState<"monthly" | "workforce">("monthly");
  const [selectedMonthKey, setSelectedMonthKey] = React.useState<string>("2026-08");
  const [range, setRange] = React.useState("30");
  const [scorecardUser, setScorecardUser] = React.useState<MonthlyEmployeePerf | null>(null);
  const [printModalOpen, setPrintModalOpen] = React.useState(false);

  const hasAccess = can("view_reports");

  const people = React.useMemo(() => visibleUsers().filter((u) => u.active), [visibleUsers]);
  const [yearStr = "2026", mStr = "08"] = selectedMonthKey.split("-");
  const selectedYear = parseInt(yearStr, 10);
  const selectedMonth = parseInt(mStr, 10) - 1;

  const monthName = new Date(selectedYear, selectedMonth, 1).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });

  const monthlyReport = React.useMemo(() => {
    return calculateMonthlyPerformance(people, state, selectedYear, selectedMonth);
  }, [people, state, selectedYear, selectedMonth]);

  if (!hasAccess) return <NoAccess />;

  // Workforce live 7/30/90 days calculations
  const days = Number(range);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();

  const ids = new Set(people.map((u) => u.id));
  const attendance = state.attendance.filter(
    (a) => ids.has(a.userId) && new Date(a.date).getTime() >= cutoffMs,
  );
  const tasks = state.tasks.filter((t) => ids.has(t.assigneeId));
  const done = tasks.filter((t) => t.status === "completed" || t.status === "approved");
  const totalHours = attendance.reduce((sum, a) => sum + a.hours, 0);
  const leaves = state.leaves.filter((l) => ids.has(l.userId) && l.status === "approved");

  const workforceRows = people.map((u) => {
    const uAtt = attendance.filter((a) => a.userId === u.id);
    const uTasks = tasks.filter((t) => t.assigneeId === u.id);
    const uDone = uTasks.filter((t) => t.status === "completed" || t.status === "approved").length;
    const rate = uTasks.length ? Math.round((uDone / uTasks.length) * 100) : 0;
    return {
      user: u,
      present: uAtt.length,
      hours: uAtt.reduce((s, a) => s + a.hours, 0),
      tasks: uTasks.length,
      done: uDone,
      rate,
    };
  });

  const exportMonthlyCsv = () => {
    const header =
      "Employee,Designation,Department,Performance Grade,Score %,Days Present,Working Days,Attendance %,Hours Worked,Avg Daily Hours,Tasks Assigned,Tasks Completed,Task Done %,Proofs Uploaded,EOD Reports,EOD Compliance %";
    const body = monthlyReport.data
      .map((r) =>
        [
          sanitizeCsvCell(r.user.fullName),
          sanitizeCsvCell(r.user.designation),
          sanitizeCsvCell(r.user.department || "General"),
          sanitizeCsvCell(r.grade),
          sanitizeCsvCell(r.score),
          sanitizeCsvCell(r.daysPresent),
          sanitizeCsvCell(r.totalWorkingDays),
          sanitizeCsvCell(`${r.attendanceRate}%`),
          sanitizeCsvCell(r.hoursWorked.toFixed(1)),
          sanitizeCsvCell(r.avgDailyHours.toFixed(1)),
          sanitizeCsvCell(r.tasksAssigned),
          sanitizeCsvCell(r.tasksDone),
          sanitizeCsvCell(`${r.taskCompletionRate}%`),
          sanitizeCsvCell(r.proofsSubmitted),
          sanitizeCsvCell(r.eodsSubmitted),
          sanitizeCsvCell(`${r.eodRate}%`),
        ].join(","),
      )
      .join("\n");

    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sace-monthly-performance-${selectedMonthKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportWorkforceCsv = () => {
    const header = "Member,Designation,Days present,Hours,Tasks,Completed,Completion %";
    const body = workforceRows
      .map((r) =>
        [
          sanitizeCsvCell(r.user.fullName),
          sanitizeCsvCell(r.user.designation),
          sanitizeCsvCell(r.present),
          sanitizeCsvCell(r.hours.toFixed(1)),
          sanitizeCsvCell(r.tasks),
          sanitizeCsvCell(r.done),
          sanitizeCsvCell(r.rate),
        ].join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sace-progress-${range}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <PageHeader
        title="Performance & Progress Reports"
        description="Automated end-of-month employee evaluations, productivity metrics, and team performance analytics."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {activeTab === "monthly" ? (
              <>
                <Select value={selectedMonthKey} onValueChange={setSelectedMonthKey}>
                  <SelectTrigger className="w-48 text-xs font-semibold">
                    <Calendar className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2026-08">August 2026 (Current)</SelectItem>
                    <SelectItem value="2026-07">July 2026</SelectItem>
                    <SelectItem value="2026-06">June 2026</SelectItem>
                    <SelectItem value="2026-05">May 2026</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPrintModalOpen(true)}
                  className="gap-1.5 text-xs"
                >
                  <Printer className="h-3.5 w-3.5" /> Official PDF / Print
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={exportMonthlyCsv}
                  className="gap-1.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5" /> Export EOM CSV
                </Button>
              </>
            ) : (
              <>
                <Select value={range} onValueChange={setRange}>
                  <SelectTrigger className="w-36 text-xs font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportWorkforceCsv}
                  className="gap-1.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </Button>
              </>
            )}
          </div>
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "monthly" | "workforce")}
        className="space-y-6"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <TabsList className="grid grid-cols-2 w-80">
            <TabsTrigger value="monthly" className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> End of Month Report
            </TabsTrigger>
            <TabsTrigger value="workforce" className="gap-1.5 text-xs">
              <FileBarChart className="h-3.5 w-3.5" /> Live Analytics
            </TabsTrigger>
          </TabsList>

          <span className="text-xs text-muted-foreground hidden sm:inline-block">
            {activeTab === "monthly"
              ? `Automated calculation for ${monthName}`
              : `Rolling ${range}-day window`}
          </span>
        </div>

        {/* Tab 1: Automated End-of-Month Performance Report */}
        <TabsContent value="monthly" className="space-y-6 m-0">
          {/* Executive KPI Header Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="rounded-2xl border p-5 bg-gradient-to-br from-primary/10 via-card to-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Top Performer ({monthName})
                  </p>
                  <p className="text-lg font-bold text-foreground mt-1">
                    {monthlyReport.topPerformer?.user.fullName || "—"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Badge
                      variant="default"
                      className="bg-primary text-[10px] font-semibold px-2 py-0.5"
                    >
                      Grade {monthlyReport.topPerformer?.grade} ·{" "}
                      {monthlyReport.topPerformer?.score}%
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {monthlyReport.topPerformer?.user.designation}
                    </span>
                  </div>
                </div>
                <div className="h-11 w-11 rounded-2xl bg-primary/20 flex items-center justify-center text-primary shrink-0">
                  <Award className="h-6 w-6" />
                </div>
              </div>
            </Card>

            <StatCard
              label="Team Delivery Rate"
              value={`${monthlyReport.avgCompletionRate}%`}
              hint="Tasks completed & approved"
              icon={ClipboardCheck}
              accent="success"
            />
            <StatCard
              label="Attendance Compliance"
              value={`${monthlyReport.avgAttendanceRate}%`}
              hint="Average roster attendance"
              icon={CalendarCheck}
              accent="teal"
            />
            <StatCard
              label="Total Shift Hours"
              value={hoursLabel(monthlyReport.totalTeamHours)}
              hint={`Across ${monthlyReport.data.length} employees`}
              icon={TrendingUp}
              accent="purple"
            />
          </div>

          {/* Performance Matrix Table */}
          <Card className="rounded-2xl overflow-hidden border">
            <CardHeader className="p-5 pb-3 border-b bg-muted/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-primary" /> Employee Monthly Performance
                    Scorecard
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Comprehensive audit based on task delivery, shift attendance, EOD compliance,
                    and proof submissions for {monthName}.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  {monthlyReport.data.length} Members Evaluated
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3.5 font-semibold">Rank & Employee</th>
                      <th className="px-4 py-3.5 font-semibold">Grade</th>
                      <th className="px-4 py-3.5 font-semibold">Performance Score</th>
                      <th className="px-4 py-3.5 font-semibold">Attendance</th>
                      <th className="px-4 py-3.5 font-semibold">Hours</th>
                      <th className="px-4 py-3.5 font-semibold">Task Delivery</th>
                      <th className="px-4 py-3.5 font-semibold">EOD Compliance</th>
                      <th className="px-5 py-3.5 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {monthlyReport.data.map((r, idx) => {
                      const gradeColor =
                        r.grade === "A+"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                          : r.grade === "A"
                            ? "bg-success/10 text-success border-success/30"
                            : r.grade === "B"
                              ? "bg-primary/10 text-primary border-primary/30"
                              : "bg-muted text-muted-foreground border-border";

                      return (
                        <tr key={r.user.id} className="transition-colors hover:bg-muted/40 group">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <span className="w-5 text-center text-xs font-bold text-muted-foreground">
                                #{idx + 1}
                              </span>
                              <Initials
                                name={r.user.fullName}
                                color={r.user.avatarColor}
                                src={r.user.avatarUrl}
                                size={36}
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-foreground truncate">
                                  {r.user.fullName}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {r.user.designation} · {r.user.department || "General"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold",
                                gradeColor,
                              )}
                            >
                              {r.grade === "A+" && (
                                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                              )}
                              Grade {r.grade}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="w-32 space-y-1">
                              <div className="flex justify-between text-xs font-bold">
                                <span>{r.score}%</span>
                                <span className="text-[10px] text-muted-foreground font-normal">
                                  {r.score >= 85 ? "High" : r.score >= 70 ? "Good" : "Average"}
                                </span>
                              </div>
                              <Progress value={r.score} className="h-2" />
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs tabular-nums">
                            <p className="font-semibold text-foreground">
                              {r.daysPresent}/{r.totalWorkingDays} days
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {r.attendanceRate}% attendance
                            </p>
                          </td>
                          <td className="px-4 py-4 text-xs tabular-nums">
                            <p className="font-semibold text-foreground">
                              {hoursLabel(r.hoursWorked)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {r.avgDailyHours}h / day
                            </p>
                          </td>
                          <td className="px-4 py-4 text-xs">
                            <p className="font-semibold text-foreground">
                              {r.tasksDone}/{r.tasksAssigned} completed ({r.taskCompletionRate}%)
                            </p>
                            <p className="text-[11px] text-primary">
                              {r.proofsSubmitted} verified proofs
                            </p>
                          </td>
                          <td className="px-4 py-4 text-xs tabular-nums">
                            <p className="font-semibold text-foreground">
                              {r.eodsSubmitted} reports ({r.eodRate}%)
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {r.eodRate >= 80 ? "Consistent" : "Needs attention"}
                            </p>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setScorecardUser(r)}
                              className="h-8 text-xs gap-1"
                            >
                              Scorecard <ChevronRight className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Live Rolling Analytics */}
        <TabsContent value="workforce" className="space-y-6 m-0">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Attendance entries"
              value={attendance.length}
              icon={CalendarCheck}
              accent="teal"
            />
            <StatCard label="Hours logged" value={hoursLabel(totalHours)} icon={TrendingUp} />
            <StatCard
              label="Task completion"
              value={`${tasks.length ? Math.round((done.length / tasks.length) * 100) : 0}%`}
              hint={`${done.length} of ${tasks.length} tasks`}
              icon={ClipboardCheck}
              accent="success"
            />
            <StatCard label="Approved leaves" value={leaves.length} accent="purple" />
          </div>

          <Card className="rounded-2xl">
            <CardContent className="space-y-4 p-5">
              {workforceRows.map((r) => (
                <div key={r.user.id} className="flex flex-wrap items-center gap-4">
                  <Initials name={r.user.fullName} color={r.user.avatarColor} size={36} />
                  <div className="min-w-[160px]">
                    <p className="text-sm font-medium">{r.user.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.present} days · {hoursLabel(r.hours)}
                    </p>
                  </div>
                  <div className="min-w-[180px] flex-1">
                    <Progress value={r.rate} />
                  </div>
                  <p className="w-28 text-right text-sm font-semibold">
                    {r.done}/{r.tasks} · {r.rate}%
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Employee Monthly Scorecard Dialog */}
      <Dialog open={!!scorecardUser} onOpenChange={(o) => !o && setScorecardUser(null)}>
        <DialogContent className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
          {scorecardUser && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Initials
                      name={scorecardUser.user.fullName}
                      color={scorecardUser.user.avatarColor}
                      src={scorecardUser.user.avatarUrl}
                      size={44}
                    />
                    <div>
                      <DialogTitle className="text-lg font-bold">
                        {scorecardUser.user.fullName}
                      </DialogTitle>
                      <DialogDescription className="text-xs">
                        {scorecardUser.user.designation} ·{" "}
                        {scorecardUser.user.department || "General"} (Performance Audit: {monthName}
                        )
                      </DialogDescription>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="default" className="text-sm font-bold px-3 py-1 bg-primary">
                      Grade {scorecardUser.grade} ({scorecardUser.score}%)
                    </Badge>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-5 pt-2">
                {/* 4 Pillars Breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border p-3 bg-muted/30 text-center">
                    <p className="text-[11px] text-muted-foreground">Attendance</p>
                    <p className="text-lg font-bold text-foreground mt-0.5">
                      {scorecardUser.attendanceRate}%
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {scorecardUser.daysPresent} of {scorecardUser.totalWorkingDays} days
                    </p>
                  </div>
                  <div className="rounded-xl border p-3 bg-muted/30 text-center">
                    <p className="text-[11px] text-muted-foreground">Task Delivery</p>
                    <p className="text-lg font-bold text-foreground mt-0.5">
                      {scorecardUser.taskCompletionRate}%
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {scorecardUser.tasksDone} of {scorecardUser.tasksAssigned} tasks
                    </p>
                  </div>
                  <div className="rounded-xl border p-3 bg-muted/30 text-center">
                    <p className="text-[11px] text-muted-foreground">EOD Reports</p>
                    <p className="text-lg font-bold text-foreground mt-0.5">
                      {scorecardUser.eodRate}%
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {scorecardUser.eodsSubmitted} reports filed
                    </p>
                  </div>
                  <div className="rounded-xl border p-3 bg-muted/30 text-center">
                    <p className="text-[11px] text-muted-foreground">Shift Hours</p>
                    <p className="text-lg font-bold text-foreground mt-0.5">
                      {hoursLabel(scorecardUser.hoursWorked)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {scorecardUser.avgDailyHours}h avg daily
                    </p>
                  </div>
                </div>

                {/* Performance Strengths */}
                <div className="space-y-2 rounded-xl border p-4 bg-muted/10">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" /> Key Strengths Observed
                  </h4>
                  <div className="space-y-1.5">
                    {scorecardUser.strengths.map((str, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                        <span>{str}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommendation */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs space-y-1">
                  <p className="font-bold text-primary">Executive Feedback & Recommendations:</p>
                  <p className="text-muted-foreground leading-relaxed">
                    {scorecardUser.recommendation}
                  </p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Printable Official End-of-Month Report Modal */}
      <Dialog open={printModalOpen} onOpenChange={setPrintModalOpen}>
        <DialogContent className="rounded-2xl max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b pb-3">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-bold">
                  Official End of Month Performance Report
                </DialogTitle>
                <DialogDescription className="text-xs">
                  SACE Technologies Workforce Evaluation & Executive Summary · {monthName}
                </DialogDescription>
              </div>
              <Button size="sm" onClick={handlePrint} className="gap-1.5 text-xs">
                <Printer className="h-3.5 w-3.5" /> Print / Save PDF
              </Button>
            </div>
          </DialogHeader>

          {/* Document Content */}
          <div className="p-4 space-y-6 text-foreground print:p-0">
            {/* Formal Company Header */}
            <div className="flex items-center justify-between border-b-2 border-primary/20 pb-4">
              <div className="flex items-center gap-3">
                <SaceLogo size="lg" variant="badge" />
                <div>
                  <h2 className="text-xl font-extrabold tracking-tight">SACE GROUP</h2>
                  <p className="text-xs text-muted-foreground">
                    Workforce Operations & Performance Management System
                  </p>
                  <p className="text-xs font-semibold text-primary mt-1">
                    Monthly Evaluation Period: {monthName}
                  </p>
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Generated: {new Date().toLocaleDateString()}</p>
                <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                  Status: Verified Official Report
                </p>
              </div>
            </div>

            {/* High Level Executive Summary */}
            <div className="grid grid-cols-4 gap-3 border rounded-xl p-3 bg-muted/20 text-center text-xs">
              <div>
                <p className="text-muted-foreground">Total Evaluated</p>
                <p className="text-base font-bold text-foreground mt-0.5">
                  {monthlyReport.data.length} Employees
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Shift Hours</p>
                <p className="text-base font-bold text-foreground mt-0.5">
                  {hoursLabel(monthlyReport.totalTeamHours)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Avg Delivery Rate</p>
                <p className="text-base font-bold text-foreground mt-0.5">
                  {monthlyReport.avgCompletionRate}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Avg Attendance</p>
                <p className="text-base font-bold text-foreground mt-0.5">
                  {monthlyReport.avgAttendanceRate}%
                </p>
              </div>
            </div>

            {/* Matrix Table */}
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted border-b font-semibold">
                  <tr>
                    <th className="p-2.5">Rank & Employee</th>
                    <th className="p-2.5">Department</th>
                    <th className="p-2.5">Attendance</th>
                    <th className="p-2.5">Hours</th>
                    <th className="p-2.5">Tasks</th>
                    <th className="p-2.5">EOD</th>
                    <th className="p-2.5 text-right">Grade & Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {monthlyReport.data.map((r, i) => (
                    <tr key={r.user.id}>
                      <td className="p-2.5 font-medium">
                        #{i + 1} {r.user.fullName}
                      </td>
                      <td className="p-2.5 text-muted-foreground">
                        {r.user.department || "General"}
                      </td>
                      <td className="p-2.5">
                        {r.daysPresent}/{r.totalWorkingDays}d ({r.attendanceRate}%)
                      </td>
                      <td className="p-2.5">{hoursLabel(r.hoursWorked)}</td>
                      <td className="p-2.5">
                        {r.tasksDone}/{r.tasksAssigned} ({r.taskCompletionRate}%)
                      </td>
                      <td className="p-2.5">
                        {r.eodsSubmitted} reports ({r.eodRate}%)
                      </td>
                      <td className="p-2.5 text-right font-bold">
                        Grade {r.grade} · {r.score}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Official Sign-off Blocks */}
            <div className="pt-8 border-t grid grid-cols-2 gap-8 text-xs">
              <div className="space-y-10">
                <p className="font-semibold text-muted-foreground">Prepared By Operations / HR:</p>
                <div className="border-b border-muted-foreground/40 w-48" />
                <p className="text-[11px] text-muted-foreground">Signature & Date</p>
              </div>
              <div className="space-y-10 text-right flex flex-col items-end">
                <p className="font-semibold text-muted-foreground">
                  Approved By Super Admin / Management:
                </p>
                <div className="border-b border-muted-foreground/40 w-48" />
                <p className="text-[11px] text-muted-foreground">Signature & Seal</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
