import type { Task } from "./types";

const DONE_STATUSES = new Set<Task["status"]>(["submitted", "approved", "completed"]);

/**
 * Returns tasks assigned to `userId` that have either:
 * - at least one proof submitted on `dateStr` (yyyy-MM-dd), OR
 * - reached a submitted/approved/completed state for `dateStr`.
 */
export function getTodaysCompletedTasks(
  tasks: Task[],
  userId: string | undefined,
  dateStr: string,
): Task[] {
  if (!userId) return [];

  return tasks.filter((t) => {
    if (t.assigneeId !== userId) return false;
    const hasProofToday = (t.proofs ?? []).some((p) => p.submittedAt.slice(0, 10) === dateStr);
    const isDoneStatus = DONE_STATUSES.has(t.status);
    const isForDate = t.dueDate === dateStr || t.startDate === dateStr;
    return hasProofToday || (isDoneStatus && isForDate);
  });
}

/**
 * Formats completed/proof-submitted tasks into editable EOD pre-fill text
 * for "What did you work on today?" and "What did you complete?".
 */
export function buildEodPrefillFromTasks(
  tasks: Task[],
  dateStr: string,
): { workedText: string; completedText: string } {
  if (tasks.length === 0) {
    return { workedText: "", completedText: "" };
  }

  const workedLines = tasks.map((t) => {
    const desc = t.description?.trim();
    const proofToday = (t.proofs ?? [])
      .filter((p) => p.submittedAt.slice(0, 10) === dateStr)
      .at(-1);
    const note = proofToday?.note?.trim();

    if (desc && note && desc !== note) {
      return `• ${t.title}: ${desc} (${note})`;
    }
    if (desc) {
      return `• ${t.title}: ${desc}`;
    }
    if (note) {
      return `• ${t.title}: ${note}`;
    }
    return `• ${t.title}`;
  });

  const completedLines = tasks.map((t) => {
    const proofToday = (t.proofs ?? [])
      .filter((p) => p.submittedAt.slice(0, 10) === dateStr)
      .at(-1);
    const note = proofToday?.note?.trim();
    return note ? `• ${t.title} — ${note}` : `• ${t.title}`;
  });

  return {
    workedText: workedLines.join("\n"),
    completedText: completedLines.join("\n"),
  };
}
