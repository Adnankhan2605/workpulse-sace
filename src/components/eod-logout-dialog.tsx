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
  const optional = mode === "logout" && me?.role === "super_admin";

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

  // Tasks completed today by this user
  const todaysCompletedTasks = state.tasks.filter(
    (t) =>
      t.assigneeId === targetUserId &&
      (t.status === "completed" || t.status === "approved" || t.status === "submitted") &&
      (t.dueDate === date || t.proofs.some((p) => p.submittedAt.slice(0, 10) === date)),
  );

  React.useEffect(() => {
    if (!open) return;
    if (reportToEdit) {
      setDate(reportToEdit.date);
      setWorked(reportToEdit.worked ?? "");
      setCompleted(reportToEdit.completed ?? "");
      setBlockers(reportToEdit.blockers ?? "");
      setHours(String(reportToEdit.hours ?? calculatedHours));
    } else {
      setDate(todayKey);
      setWorked(existing?.worked ?? "");
      setCompleted(existing?.completed ?? "");
      setBlockers(existing?.blockers ?? "");
      setHours(existing?.hours ? String(existing.hours) : String(calculatedHours));
    }
  }, [open, reportToEdit, existing, todayKey, calculatedHours]);

  const handleInsertCompletedTasks = () => {
    if (todaysCompletedTasks.length === 0) return;
    const taskSummary = todaysCompletedTasks.map((t) => `• ${t.title}`).join("\n");
    setCompleted((prev) => (prev ? `${prev}\n${taskSummary}` : taskSummary));
    toast.success("Imported tasks completed today into EOD report");
  };

  const submit = () => {
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
                  ? "Optional for Super Admins — you can sign out straight away or save your daily record."
                  : "Summarize your daily progress before signing out. Working hours are calculated automatically."}
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
                  <Sparkles className="h-3 w-3" /> Insert {todaysCompletedTasks.length} task
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

          <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-border">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {isWrite || isEdit ? "Cancel" : "Keep working"}
            </Button>
            {optional && !isEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (record?.punchIn && !record.punchOut) {
                    update((d) => {
                      const att = d.attendance.find(
                        (a) => a.userId === me!.id && a.date === todayKey,
                      );
                      if (att && att.punchIn && !att.punchOut) {
                        att.punchOut = isoNow();
                        att.hours = getRecordActualHours(att);
                        att.status = "present";
                      }
                    });
                  }
                  onOpenChange(false);
                  onDone();
                }}
              >
                Skip &amp; log out
              </Button>
            )}
            <Button
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
      </DialogContent>
    </Dialog>
  );
}
