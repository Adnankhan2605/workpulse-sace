import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ClipboardCheck,
  CalendarDays,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Send,
  Users,
  FileText,
  Target,
  TrendingUp,
  ShieldAlert,
  Calendar,
  Check,
  Building2,
  Info,
} from "lucide-react";
import { AppShell, EmptyState, PageHeader } from "@/components/app-shell";
import { StatCard, StatusPill } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { useApp, dateKey, newId, isoNow } from "@/lib/store";
import { fmtDate, fmtTime, hoursLabel, titleCase } from "@/lib/format";
import { getMonthlyReviewEffectiveDate, isMonthlyReviewDayToday } from "@/lib/cadence";
import { cn } from "@/lib/utils";
import type { MonthlyReview, User } from "@/lib/types";

export const Route = createFileRoute("/reviews")({
  head: () => ({
    meta: [
      { title: "Monthly Reviews & Reflection — SACE Portal" },
      {
        name: "description",
        content:
          "Monthly review and reflection portal with auto-synced daily task history and supervisor management.",
      },
      { property: "og:title", content: "Monthly Reviews & Reflection — SACE Portal" },
      {
        property: "og:description",
        content: "Monthly employee reflections, performance metrics, and leadership review hub.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <MonthlyReviewsPage />
    </AppShell>
  ),
});

function MonthlyReviewsPage() {
  const { state, me, can, visibleUsers, update, log } = useApp();
  const isAdmin = me?.role === "super_admin" || me?.role === "admin" || can("view_reports");

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

  const [selectedMonthKey, setSelectedMonthKey] = React.useState(currentMonthKey);
  const [adminTab, setAdminTab] = React.useState<"team" | "my">("team");
  const [selectedReviewUser, setSelectedReviewUser] = React.useState<string>(me?.id ?? "");

  // Review form states
  const [hits, setHits] = React.useState("");
  const [misses, setMisses] = React.useState("");
  const [futureTargets, setFutureTargets] = React.useState("");
  const [employeeRequirements, setEmployeeRequirements] = React.useState("");
  const [tasksNotes, setTasksNotes] = React.useState("");
  const [isSubmitModalOpen, setIsSubmitModalOpen] = React.useState(false);

  // Effective review date for current selected month
  const [selYear, selMo] = selectedMonthKey.split("-").map(Number);
  const effectiveReviewDate = React.useMemo(() => {
    return getMonthlyReviewEffectiveDate(selYear, selMo, state.holidays || []);
  }, [selYear, selMo, state.holidays]);

  const isReviewDay = isMonthlyReviewDayToday(state.holidays || [], now);

  // Auto-pulled tasks and EOD reports for the selected month by current user (or selected user in admin view)
  const targetUserId = isAdmin && adminTab === "team" ? selectedReviewUser : me?.id;
  const targetUser = state.users.find((u) => u.id === targetUserId) ?? me;

  const monthTasks = React.useMemo(() => {
    if (!targetUserId) return [];
    return state.tasks.filter(
      (t) =>
        t.assigneeId === targetUserId &&
        t.dueDate.startsWith(selectedMonthKey) &&
        (t.status === "completed" || t.status === "approved" || t.status === "submitted"),
    );
  }, [state.tasks, targetUserId, selectedMonthKey]);

  const monthEods = React.useMemo(() => {
    if (!targetUserId) return [];
    return state.eodReports.filter(
      (e) => e.userId === targetUserId && e.date.startsWith(selectedMonthKey),
    );
  }, [state.eodReports, targetUserId, selectedMonthKey]);

  const existingReview = React.useMemo(() => {
    if (!targetUserId) return null;
    return (state.monthlyReviews || []).find(
      (r) => r.userId === targetUserId && r.monthKey === selectedMonthKey,
    );
  }, [state.monthlyReviews, targetUserId, selectedMonthKey]);

  // Pre-fill form when modal opens or existing review changes
  React.useEffect(() => {
    if (existingReview) {
      setHits(existingReview.hits);
      setMisses(existingReview.misses);
      setFutureTargets(existingReview.futureTargets);
      setEmployeeRequirements(existingReview.employeeRequirements);
      setTasksNotes(existingReview.tasksCompletedSummary);
    } else {
      // Auto-generate default task summary
      const autoSummary =
        monthTasks.length > 0
          ? monthTasks.map((t) => `• [${titleCase(t.status)}] ${t.title}`).join("\n")
          : monthEods.length > 0
            ? monthEods.map((e) => `• ${e.date}: ${e.completed}`).join("\n")
            : "No completed tasks recorded yet for this month.";
      setTasksNotes(autoSummary);
      setHits("");
      setMisses("");
      setFutureTargets("");
      setEmployeeRequirements("");
    }
  }, [existingReview, monthTasks, monthEods]);

  const handleOpenSubmitModal = () => {
    if (!existingReview) {
      const autoSummary =
        monthTasks.length > 0
          ? monthTasks.map((t) => `• [${titleCase(t.status)}] ${t.title}`).join("\n")
          : monthEods.length > 0
            ? monthEods.map((e) => `• ${e.date}: ${e.completed}`).join("\n")
            : "No completed tasks recorded yet for this month.";
      setTasksNotes(autoSummary);
    }
    setIsSubmitModalOpen(true);
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hits.trim() || !futureTargets.trim()) {
      toast.error("Please fill in at least Hits of the Month and Future Targets.");
      return;
    }

    const reviewId = existingReview?.id ?? newId();
    const payload: MonthlyReview = {
      id: reviewId,
      userId: me!.id,
      monthKey: selectedMonthKey,
      submittedAt: isoNow(),
      tasksCompletedSummary: tasksNotes.trim(),
      hits: hits.trim(),
      misses: misses.trim(),
      futureTargets: futureTargets.trim(),
      employeeRequirements: employeeRequirements.trim(),
    };

    update((draft) => {
      if (!draft.monthlyReviews) draft.monthlyReviews = [];
      const idx = draft.monthlyReviews.findIndex(
        (r) => r.userId === me!.id && r.monthKey === selectedMonthKey,
      );
      if (idx >= 0) {
        draft.monthlyReviews[idx] = payload;
      } else {
        draft.monthlyReviews.push(payload);
      }
    });

    log("monthly_review_submitted", `Monthly review submitted for ${selectedMonthKey}`);
    toast.success("Monthly Review & Reflection submitted successfully!");
    setIsSubmitModalOpen(false);
  };

  // Team submissions in admin view
  const teamSubmissions = React.useMemo(() => {
    const visibleIds = new Set(visibleUsers().map((u) => u.id));
    return (state.monthlyReviews || []).filter(
      (r) => r.monthKey === selectedMonthKey && visibleIds.has(r.userId),
    );
  }, [state.monthlyReviews, selectedMonthKey, visibleUsers]);

  const formattedEffectiveDate = effectiveReviewDate.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <>
      <PageHeader
        title="Monthly Reviews & Reflection"
        description="Review meetings held on the 15th of every month. Automatic daily task synthesis and leadership feedback hub."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedMonthKey} onValueChange={setSelectedMonthKey}>
              <SelectTrigger className="w-48 text-xs">
                <SelectValue placeholder="Select Month" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 6 }).map((_, i) => {
                  const d = new Date(currentYear, currentMonth - 1 - i, 1);
                  const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                  const label = d.toLocaleDateString([], { month: "long", year: "numeric" });
                  return (
                    <SelectItem key={mk} value={mk}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {!isAdmin && (
              <Button
                size="sm"
                onClick={handleOpenSubmitModal}
                className={cn(
                  "gap-1.5 shadow-sm",
                  isReviewDay &&
                    !existingReview &&
                    "animate-pulse bg-amber-500 hover:bg-amber-600 text-black font-semibold",
                )}
              >
                <Sparkles className="h-4 w-4" />
                {existingReview ? "Edit Monthly Review" : "Write Review of the Month"}
              </Button>
            )}
          </div>
        }
      />

      {/* Review Trigger Date Banner & Status */}
      <div className="mb-6 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-primary/20 p-3 text-primary shrink-0">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-foreground text-base">
                  Review Meeting Target: 15th of the Month
                </p>
                {isReviewDay && (
                  <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-500 uppercase tracking-wider animate-bounce">
                    Active Review Day Today
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Scheduled review deadline for this month:{" "}
                <strong className="text-foreground">{formattedEffectiveDate}</strong> (adjusted for
                weekends &amp; company holidays). Punch-out enforcement requires review submission
                on this date.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Submission Status
              </p>
              <p className="text-xs font-bold text-foreground mt-0.5">
                {existingReview ? (
                  <span className="text-emerald-500 flex items-center gap-1 justify-end">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Submitted (
                    {fmtDate(existingReview.submittedAt)})
                  </span>
                ) : (
                  <span className="text-amber-500 flex items-center gap-1 justify-end">
                    <AlertTriangle className="h-3.5 w-3.5" /> Pending Submission
                  </span>
                )}
              </p>
            </div>
            {!isAdmin && (
              <Button size="sm" onClick={handleOpenSubmitModal} className="gap-1.5 shrink-0">
                <ClipboardCheck className="h-4 w-4" />
                {existingReview ? "View / Update Review" : "Start Review Form"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Admin Tabs */}
      {isAdmin && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <Tabs value={adminTab} onValueChange={(v) => setAdminTab(v as "team" | "my")}>
            <TabsList className="grid grid-cols-2 w-72">
              <TabsTrigger value="team" className="gap-1.5">
                <Users className="h-4 w-4" /> Team Submissions ({teamSubmissions.length})
              </TabsTrigger>
              <TabsTrigger value="my" className="gap-1.5">
                <ClipboardCheck className="h-4 w-4" /> My Review
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {adminTab === "team" && (
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-muted-foreground">Select Member:</span>
              <Select value={selectedReviewUser} onValueChange={setSelectedReviewUser}>
                <SelectTrigger className="w-56 text-xs">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {visibleUsers().map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName} ({u.department || "General"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      {isAdmin && adminTab === "team" ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Submissions Received"
              value={`${teamSubmissions.length} / ${visibleUsers().length}`}
              hint="Team member completion rate"
              icon={Users}
              accent="purple"
            />
            <StatCard
              label="Month Filter"
              value={selectedMonthKey}
              hint="Active review period"
              icon={CalendarDays}
              accent="teal"
            />
            <StatCard
              label="Effective Review Date"
              value={effectiveReviewDate.toLocaleDateString([], { month: "short", day: "numeric" })}
              hint="Adjusted for holidays"
              icon={Clock}
              accent="success"
            />
            <StatCard
              label="Meeting Date"
              value="15th of Month"
              hint="Scheduled sync"
              icon={Target}
            />
          </div>

          <Card className="rounded-2xl">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Submitted Team Reflections for {selectedMonthKey}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {teamSubmissions.length} report{teamSubmissions.length === 1 ? "" : "s"} submitted
              </span>
            </CardHeader>
            <CardContent className="p-0">
              {teamSubmissions.length === 0 ? (
                <div className="py-12">
                  <EmptyState
                    icon={ClipboardCheck}
                    title="No submissions received yet"
                    description="Team members have not submitted their monthly reviews for this period yet."
                  />
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {teamSubmissions.map((rev) => {
                    const u = state.users.find((user) => user.id === rev.userId);
                    return (
                      <div
                        key={rev.id}
                        className="p-5 transition-colors hover:bg-muted/30 space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0">
                              {u?.fullName.slice(0, 2).toUpperCase() || "TM"}
                            </div>
                            <div>
                              <p className="font-bold text-foreground text-sm">
                                {u?.fullName || "Team Member"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {u?.designation || u?.department || "Staff"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" /> Submitted on{" "}
                            {fmtDate(rev.submittedAt)} at {fmtTime(rev.submittedAt)}
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 text-xs">
                          <div className="rounded-xl border border-border bg-card p-3.5 space-y-1.5 shadow-2xs">
                            <p className="font-semibold text-emerald-500 uppercase tracking-wide text-[11px] flex items-center gap-1">
                              <TrendingUp className="h-3.5 w-3.5" /> Hits of the Month
                            </p>
                            <p className="text-foreground whitespace-pre-line leading-relaxed">
                              {rev.hits}
                            </p>
                          </div>

                          <div className="rounded-xl border border-border bg-card p-3.5 space-y-1.5 shadow-2xs">
                            <p className="font-semibold text-rose-500 uppercase tracking-wide text-[11px] flex items-center gap-1">
                              <ShieldAlert className="h-3.5 w-3.5" /> Misses &amp; Challenges
                            </p>
                            <p className="text-foreground whitespace-pre-line leading-relaxed">
                              {rev.misses || "None reported."}
                            </p>
                          </div>

                          <div className="rounded-xl border border-border bg-card p-3.5 space-y-1.5 shadow-2xs">
                            <p className="font-semibold text-primary uppercase tracking-wide text-[11px] flex items-center gap-1">
                              <Target className="h-3.5 w-3.5" /> Future Targets
                            </p>
                            <p className="text-foreground whitespace-pre-line leading-relaxed">
                              {rev.futureTargets}
                            </p>
                          </div>

                          <div className="rounded-xl border border-border bg-card p-3.5 space-y-1.5 shadow-2xs">
                            <p className="font-semibold text-amber-500 uppercase tracking-wide text-[11px] flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5" /> Employee Support Required
                            </p>
                            <p className="text-foreground whitespace-pre-line leading-relaxed">
                              {rev.employeeRequirements || "None specified."}
                            </p>
                          </div>
                        </div>

                        {rev.tasksCompletedSummary && (
                          <div className="rounded-xl border border-border bg-muted/30 p-3.5 text-xs space-y-1">
                            <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">
                              Auto-Synced Daily Tasks &amp; EOD Summary
                            </p>
                            <p className="text-foreground whitespace-pre-line font-mono text-[11px] leading-relaxed">
                              {rev.tasksCompletedSummary}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        // Personal or Admin My View
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Completed Tasks Synced"
              value={monthTasks.length}
              hint={`For ${selectedMonthKey}`}
              icon={CheckCircle2}
              accent="success"
            />
            <StatCard
              label="EOD Reports Synced"
              value={monthEods.length}
              hint="Daily logs recorded"
              icon={FileText}
              accent="purple"
            />
            <StatCard
              label="Review Status"
              value={existingReview ? "Submitted" : "Action Required"}
              hint={existingReview ? "Ready for meeting" : "Draft pending"}
              icon={ClipboardCheck}
              accent={existingReview ? "teal" : "warning"}
            />
          </div>

          <Card className="rounded-2xl">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                Your Monthly Reflection &amp; Feedback ({selectedMonthKey})
              </CardTitle>
              <Button size="sm" onClick={handleOpenSubmitModal} className="gap-1.5">
                <Sparkles className="h-4 w-4" />
                {existingReview ? "Edit Your Review" : "Write Review Now"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              {!existingReview ? (
                <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-border bg-muted/20">
                  <div className="h-12 w-12 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center mb-3">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <p className="font-bold text-foreground text-sm">
                    Monthly Review Not Submitted Yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-md">
                    Please submit your monthly reflection ahead of the 15th review meeting. Your
                    daily tasks and EOD logs are automatically synthesized for you.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleOpenSubmitModal}
                    className="mt-4 gap-1.5 shadow-sm"
                  >
                    Open Review Form
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 text-xs">
                    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                      <p className="font-bold text-emerald-500 text-sm flex items-center gap-1.5">
                        <TrendingUp className="h-4 w-4" /> Hits of the Month
                      </p>
                      <p className="text-foreground whitespace-pre-line leading-relaxed">
                        {existingReview.hits}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                      <p className="font-bold text-rose-500 text-sm flex items-center gap-1.5">
                        <ShieldAlert className="h-4 w-4" /> Misses &amp; Challenges
                      </p>
                      <p className="text-foreground whitespace-pre-line leading-relaxed">
                        {existingReview.misses || "None reported."}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                      <p className="font-bold text-primary text-sm flex items-center gap-1.5">
                        <Target className="h-4 w-4" /> Future Targets
                      </p>
                      <p className="text-foreground whitespace-pre-line leading-relaxed">
                        {existingReview.futureTargets}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                      <p className="font-bold text-amber-500 text-sm flex items-center gap-1.5">
                        <Building2 className="h-4 w-4" /> Employee Requirements
                      </p>
                      <p className="text-foreground whitespace-pre-line leading-relaxed">
                        {existingReview.employeeRequirements || "None specified."}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs space-y-2">
                    <p className="font-bold text-foreground text-sm uppercase tracking-wide">
                      Auto-Synced Daily Tasks Summary ({monthTasks.length} tasks completed)
                    </p>
                    <p className="text-muted-foreground whitespace-pre-line font-mono text-xs leading-relaxed">
                      {existingReview.tasksCompletedSummary}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Submission & Editing Modal */}
      <Dialog open={isSubmitModalOpen} onOpenChange={setIsSubmitModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              Write Your Review of the Month ({selectedMonthKey})
            </DialogTitle>
            <DialogDescription>
              Synthesizing your daily task output and EOD reports for the monthly review meeting on
              the 15th.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitReview} className="space-y-5 pt-2">
            {/* Auto-pulled Tasks Section */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="tasks-summary"
                  className="text-xs font-semibold flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Auto-Pulled Tasks &amp;
                  EOD Summary
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  {monthTasks.length} completed tasks &amp; {monthEods.length} EOD reports
                  auto-synced
                </span>
              </div>
              <Textarea
                id="tasks-summary"
                rows={4}
                value={tasksNotes}
                onChange={(e) => setTasksNotes(e.target.value)}
                placeholder="Editable auto-synced task history..."
                className="text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                You can add notes or edit the auto-pulled task history above to highlight specific
                project milestones.
              </p>
            </div>

            {/* Hits of the Month */}
            <div className="space-y-1.5">
              <Label
                htmlFor="rev-hits"
                className="text-xs font-semibold flex items-center gap-1.5 text-emerald-500"
              >
                <TrendingUp className="h-3.5 w-3.5" /> Hits of the Month (Major Successes &amp;
                Wins) *
              </Label>
              <Textarea
                id="rev-hits"
                rows={3}
                required
                value={hits}
                onChange={(e) => setHits(e.target.value)}
                placeholder="Key milestones achieved, successful client deliveries, positive metrics..."
                className="text-xs"
              />
            </div>

            {/* Misses of the Month */}
            <div className="space-y-1.5">
              <Label
                htmlFor="rev-misses"
                className="text-xs font-semibold flex items-center gap-1.5 text-rose-500"
              >
                <ShieldAlert className="h-3.5 w-3.5" /> Misses of the Month (Challenges &amp;
                Obstacles)
              </Label>
              <Textarea
                id="rev-misses"
                rows={3}
                value={misses}
                onChange={(e) => setMisses(e.target.value)}
                placeholder="Delays, roadblocks, bottlenecks encountered during the month..."
                className="text-xs"
              />
            </div>

            {/* Future Targets */}
            <div className="space-y-1.5">
              <Label
                htmlFor="rev-targets"
                className="text-xs font-semibold flex items-center gap-1.5 text-primary"
              >
                <Target className="h-3.5 w-3.5" /> Future Targets (Goals for Next Month) *
              </Label>
              <Textarea
                id="rev-targets"
                rows={3}
                required
                value={futureTargets}
                onChange={(e) => setFutureTargets(e.target.value)}
                placeholder="Objectives, key deliverables, and targets for the upcoming month..."
                className="text-xs"
              />
            </div>

            {/* Employee Requirements */}
            <div className="space-y-1.5">
              <Label
                htmlFor="rev-reqs"
                className="text-xs font-semibold flex items-center gap-1.5 text-amber-500"
              >
                <Building2 className="h-3.5 w-3.5" /> Employee Requirements (Support, Tools &amp;
                Resources Needed)
              </Label>
              <Textarea
                id="rev-reqs"
                rows={2}
                value={employeeRequirements}
                onChange={(e) => setEmployeeRequirements(e.target.value)}
                placeholder="Training, software licenses, approvals, or management assistance needed..."
                className="text-xs"
              />
            </div>

            <DialogFooter className="pt-3 border-t border-border">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsSubmitModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="gap-1.5">
                <Send className="h-4 w-4" />
                {existingReview ? "Update Monthly Review" : "Submit Monthly Review"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
