import * as React from "react";
import { toast } from "sonner";
import { Check, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApp, dateKey, newId, isoNow } from "@/lib/store";
import { fmtTime, getRecordActualHours, hoursLabel } from "@/lib/format";
import { isMonthlyReviewDayToday } from "@/lib/cadence";
import { buildEodPrefillFromTasks, getTodaysCompletedTasks } from "@/lib/eod-helpers";
import type { EodReport } from "@/lib/types";

export function EodLogoutDialog({
  open,
  onOpenChange,
  onDone,
  mode = "logout",
  reportToEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  /** "logout" submits then signs out, "write" saves report, "edit" updates an existing report */
  mode?: "logout" | "write" | "edit";
  reportToEdit?: EodReport | null;
}) {
  const { state, me, update, log } = useApp();
  const todayKey = dateKey(new Date());
  const [date, setDate] = React.useState(reportToEdit?.date ?? todayKey);
  const [worked, setWorked] = React.useState("");
  const [completed, setCompleted] = React.useState("");
  const [blockers, setBlockers] = React.useState("");
  const [hours, setHours] = React.useState("");
  const [showManualHours, setShowManualHours] = React.useState(false);

  const isEdit = mode === "edit";
  const isWrite = mode === "write";
  const isAdminOrSuperAdmin = me?.role === "admin" || me?.role === "super_admin";
  const optional = mode === "logout" && isAdminOrSuperAdmin;
  const showSkipAndLogout = mode === "logout" && !isEdit;

  const targetUserId = reportToEdit?.userId ?? me?.id;
  const record = state.attendance.find((a) => a.userId === targetUserId && a.date === date);
  const existing =
    reportToEdit ?? state.eodReports.find((r) => r.userId === targetUserId && r.date === date);

  // Auto calculate hours from attendance record with minute precision
  const calculatedHours = React.useMemo(() => {
    if (existing?.hours && isEdit) return existing.hours;
    if (record) {
      const act = getRecordActualHours(record);
      if (act > 0) return Math.round(act * 100) / 100;
    }
    if (record?.punchIn && !record?.punchOut) {
      const diffMs = Math.max(0, Date.now() - new Date(record.punchIn).getTime());
      return Math.round((diffMs / 3600000) * 100) / 100;
    }
    if (typeof record?.hours === "number" && record.hours > 0) return record.hours;
    return 8.0;
  }, [record, existing, isEdit]);

  // Tasks completed or with proof submitted for the selected date
  const todaysCompletedTasks = React.useMemo(
    () => getTodaysCompletedTasks(state.tasks, targetUserId, date),
    [state.tasks, targetUserId, date],
  );

  const prefill = React.useMemo(
    () => buildEodPrefillFromTasks(todaysCompletedTasks, date),
    [todaysCompletedTasks, date],
  );

  const [autoFilledCount, setAutoFilledCount] = React.useState(0);
  const wasOpenRef = React.useRef(false);
  const lastReportIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const reportId = reportToEdit?.id ?? null;
    const justOpened = open && !wasOpenRef.current;
    const reportChanged = open && reportId !== lastReportIdRef.current;
    wasOpenRef.current = open;
    lastReportIdRef.current = reportId;

    if (!open || (!justOpened && !reportChanged)) return;

    if (reportToEdit) {
      setDate(reportToEdit.date);
      setWorked(reportToEdit.worked ?? "");
      setCompleted(reportToEdit.completed ?? "");
      setBlockers(reportToEdit.blockers ?? "");
      setHours(String(reportToEdit.hours ?? calculatedHours));
      setAutoFilledCount(0);
      return;
    }

    const activeDate = todayKey;
    const activeExisting = state.eodReports.find(
      (r) => r.userId === targetUserId && r.date === activeDate,
    );
    const activeTasks = getTodaysCompletedTasks(state.tasks, targetUserId, activeDate);
    const activePrefill = buildEodPrefillFromTasks(activeTasks, activeDate);

    setDate(activeDate);
    if (activeExisting) {
      setWorked(activeExisting.worked ?? "");
      setCompleted(activeExisting.completed ?? "");
      setBlockers(activeExisting.blockers ?? "");
      setHours(activeExisting.hours ? String(activeExisting.hours) : String(calculatedHours));
      setAutoFilledCount(0);
    } else {
      setWorked(activePrefill.workedText);
      setCompleted(activePrefill.completedText);
      setBlockers("");
      setHours(String(calculatedHours));
      setAutoFilledCount(activeTasks.length);
    }
  }, [open, reportToEdit, state.eodReports, state.tasks, targetUserId, todayKey, calculatedHours]);

  const handleInsertCompletedTasks = () => {
    if (todaysCompletedTasks.length === 0) return;
    setWorked((prev) => {
      if (!prev.trim()) return prefill.workedText;
      return prev.includes(prefill.workedText) ? prev : `${prev}\n${prefill.workedText}`;
    });
    setCompleted((prev) => {
      if (!prev.trim()) return prefill.completedText;
      return prev.includes(prefill.completedText) ? prev : `${prev}\n${prefill.completedText}`;
    });
    setAutoFilledCount(todaysCompletedTasks.length);
    toast.success("Synced today's completed tasks into your EOD report");
  };

  const submit = () => {
    const isPunchingOutNow = !isWrite && !isEdit && !!record?.punchIn && !record?.punchOut;
    if (isPunchingOutNow && !isAdminOrSuperAdmin && todaysCompletedTasks.length === 0) {
      toast.error("You must submit proof for at least one completed task before punching out.");
      onOpenChange(false);
      return;
    }

    const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const isReviewDay = isMonthlyReviewDayToday(state.holidays || []);
    const hasSubmittedReview = (state.monthlyReviews || []).some(
      (r) => r.userId === targetUserId && r.monthKey === currentMonthKey,
    );
    if (!isWrite && !isEdit && isReviewDay && !hasSubmittedReview) {
      toast.error(
        "Monthly Review Required: You must submit your Monthly Review & Reflection for this month before logging out today!",
      );
      onOpenChange(false);
      return;
    }

    const rawVal = Number(hours);
    const finalHours = !isNaN(rawVal) && hours.trim() !== "" ? rawVal : (calculatedHours ?? 0);
    const taskIds = todaysCompletedTasks.map((t) => t.id);

    update((d) => {
      if (!isWrite && !isEdit && date === todayKey) {
        const att = d.attendance.find((a) => a.userId === me!.id && a.date === todayKey);
        if (att && att.punchIn && !att.punchOut) {
          att.punchOut = isoNow();
          att.hours = getRecordActualHours(att);
          att.status = "present";
        }
      }

      if (isEdit && reportToEdit) {
        const report = d.eodReports.find((r) => r.id === reportToEdit.id);
        if (report) {
          report.worked = worked.trim();
          report.completed = completed.trim();
          report.blockers = blockers.trim();
          report.hours = finalHours;
          report.date = date;
          report.submittedAt = isoNow();
        }
      } else {
        const prev = d.eodReports.find(
          (r) => r.userId === (targetUserId ?? me!.id) && r.date === date,
        );
        if (prev) {
          prev.worked = worked.trim();
          prev.completed = completed.trim();
          prev.blockers = blockers.trim();
          prev.hours = finalHours;
          prev.submittedAt = isoNow();
        } else {
          d.eodReports.unshift({
            id: newId(),
            userId: targetUserId ?? me!.id,
            date,
            worked: worked.trim(),
            completed: completed.trim(),
            blockers: blockers.trim(),
            hours: finalHours,
            taskIds,
            submittedAt: isoNow(),
          });
        }
      }
    });

    log(isEdit ? "EOD report updated" : "EOD report submitted", `${date} · ${finalHours}h`);
    toast.success(
      isEdit
        ? "EOD report updated successfully."
        : isWrite
          ? "EOD report saved successfully."
          : "EOD report submitted. Attendance logged!",
    );
    onOpenChange(false);
    onDone();
  };

  const handleSkipAndLogout = () => {
    const hasActiveShift = !!(record?.punchIn && !record.punchOut);
    if (hasActiveShift && !isAdminOrSuperAdmin && todaysCompletedTasks.length === 0) {
      toast.error("You must submit proof for at least one completed task before punching out.");
      onOpenChange(false);
      return;
    }

    if (hasActiveShift) {
      update((d) => {
        const att = d.attendance.find((a) => a.userId === me!.id && a.date === todayKey);
        if (att && att.punchIn && !att.punchOut) {
          att.punchOut = isoNow();
          att.hours = getRecordActualHours(att);
          att.status = "present";
        }
      });
      log("Skipped EOD & punched out", `${todayKey} · Immediate punch-out`);
      toast.success("Punched out successfully.");
    } else {
      toast.success("Signed out.");
    }

    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? "Edit EOD report"
              : isWrite
                ? "Write an EOD report"
                : "Submit your EOD report & log out"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Make updates to your submitted end-of-day report."
              : isWrite
                ? "Record your shift achievements. Visible to you, your Admin and the Super Admin."
                : optional
                  ? "Optional for Admins & Super Admins — submit your EOD notes or skip & log out immediately."
                  : "Summarize your daily progress before signing out, or click Skip & log out to punch out immediately."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="eod-date" className="text-xs">
                Report Date
              </Label>
              <Input
                id="eod-date"
                type="date"
                value={date || ""}
                max={todayKey}
                onChange={(e) => setDate(e.target.value)}
                className="text-xs"
              />
            </div>

            {/* Automated Working Hours Banner */}
            <div className="flex flex-col justify-end space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Working Hours</Label>
                <button
                  type="button"
                  onClick={() => setShowManualHours(!showManualHours)}
                  className="text-[11px] text-primary hover:underline"
                >
                  {showManualHours ? "Use auto-calculated" : "Adjust manually"}
                </button>
              </div>

              {showManualHours ? (
                <Input
                  id="eod-hours"
                  type="number"
                  min="0"
                  step="0.5"
                  value={hours || ""}
                  onChange={(e) => setHours(e.target.value)}
                  className="text-xs h-9"
                  placeholder="e.g. 8.0"
                />
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-medium text-foreground">
                  <Clock className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-primary">
                      {hoursLabel(calculatedHours)}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">
                      {record?.punchIn
                        ? `(${fmtTime(record.punchIn)} → ${record.punchOut ? fmtTime(record.punchOut) : "Now"})`
                        : "(Standard 8.0h shift)"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {!isEdit && !existing && autoFilledCount > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/10 px-3.5 py-2.5 text-xs text-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">
                  Auto-filled from {autoFilledCount} completed task
                  {autoFilledCount === 1 ? "" : "s"} today
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Review, edit, or add additional shift notes below before submitting.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="eod-worked" className="text-xs">
              What did you work on today?
            </Label>
            <Textarea
              id="eod-worked"
              rows={3}
              value={worked || ""}
              onChange={(e) => setWorked(e.target.value)}
              placeholder="Key activities, meetings, student inquiries, development…"
              className="text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="eod-completed" className="text-xs">
                What did you complete?
              </Label>
              {todaysCompletedTasks.length > 0 && (
                <button
                  type="button"
                  onClick={handleInsertCompletedTasks}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  <Sparkles className="h-3 w-3" /> Sync {todaysCompletedTasks.length} task
                  {todaysCompletedTasks.length === 1 ? "" : "s"} done today
                </button>
              )}
            </div>
            <Textarea
              id="eod-completed"
              rows={3}
              value={completed || ""}
              onChange={(e) => setCompleted(e.target.value)}
              placeholder="Milestones finished, documents verified, tickets resolved…"
              className="text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="eod-blockers" className="text-xs">
              Any blockers or pending dependencies? (optional)
            </Label>
            <Textarea
              id="eod-blockers"
              rows={2}
              value={blockers || ""}
              onChange={(e) => setBlockers(e.target.value)}
              placeholder="Anything you need assistance or escalation with…"
              className="text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              {isWrite || isEdit ? "Cancel" : "Keep working"}
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {showSkipAndLogout && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSkipAndLogout}
                  className="border-border bg-secondary/40 text-foreground hover:bg-secondary/70"
                >
                  Skip &amp; log out
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                disabled={
                  optional
                    ? worked.trim().length < 2
                    : worked.trim().length < 2 || completed.trim().length < 2
                }
                onClick={submit}
                className="gap-1.5"
              >
                <Check className="h-4 w-4" />
                {isEdit ? "Update report" : isWrite ? "Save report" : "Submit & log out"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
