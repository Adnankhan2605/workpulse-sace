import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useApp, dateKey } from "@/lib/store";
import { isMonthlyReviewDayToday } from "@/lib/cadence";
import { getTodaysCompletedTasks } from "@/lib/eod-helpers";

export const PUNCH_OUT_TASK_PROOF_ERROR =
  "You must submit proof for at least one completed task before punching out.";

/**
 * Unified punch-out validation hook used across Header, Sidebar Logout,
 * Member Dashboard, and Attendance Hub so every trigger enforces identical
 * task-completion/proof and monthly-review gates before opening the EOD modal.
 */
export function usePunchOutGuard(onOpenEod: () => void) {
  const { state, me } = useApp();
  const navigate = useNavigate();
  const todayKey = dateKey(new Date());

  const record = state.attendance.find((a) => a.userId === me?.id && a.date === todayKey);
  const isPunchedIn = !!(record?.punchIn && !record?.punchOut);
  const isPunchedOut = !!(record?.punchIn && record?.punchOut);

  const completedToday = React.useMemo(
    () => getTodaysCompletedTasks(state.tasks, me?.id, todayKey),
    [state.tasks, me?.id, todayKey],
  );

  const isAdminOrSuperAdmin = me?.role === "admin" || me?.role === "super_admin";
  const canPunchOut = isAdminOrSuperAdmin || completedToday.length > 0;

  const handlePunchOutClick = React.useCallback(() => {
    if (!me) return false;

    if (!isAdminOrSuperAdmin && completedToday.length === 0) {
      toast.error(PUNCH_OUT_TASK_PROOF_ERROR, {
        action: {
          label: "Go to tasks",
          onClick: () => {
            void navigate({ to: "/tasks" });
          },
        },
      });
      return false;
    }

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const isReviewDay = isMonthlyReviewDayToday(state.holidays || []);
    const hasSubmittedReview = (state.monthlyReviews || []).some(
      (r) => r.userId === me.id && r.monthKey === currentMonthKey,
    );

    if (isReviewDay && !hasSubmittedReview) {
      toast.error(
        "Monthly Review Required: You must submit your Monthly Review & Reflection for this month before punching out today!",
      );
      void navigate({ to: "/reviews" });
      return false;
    }

    onOpenEod();
    return true;
  }, [
    me,
    isAdminOrSuperAdmin,
    completedToday.length,
    state.holidays,
    state.monthlyReviews,
    navigate,
    onOpenEod,
  ]);

  return {
    isPunchedIn,
    isPunchedOut,
    isAdminOrSuperAdmin,
    canPunchOut,
    completedToday,
    completedTodayCount: completedToday.length,
    handlePunchOutClick,
  };
}
