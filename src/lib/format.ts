export const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })
    : "—";

export const fmtDateTime = (iso?: string | null) =>
  iso ? `${fmtDate(iso)} · ${fmtTime(iso)}` : "—";

export interface PunchRecordLike {
  punchIn?: string | null;
  punchOut?: string | null;
  hours?: number | null;
}

export const hoursLabel = (h: number) => {
  if (!h || isNaN(h) || h <= 0) return "0h 0m";
  const totalMins = Math.round(h * 60);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${hours}h ${mins}m`;
};

/**
 * Computes exact elapsed decimal hours between punchIn and punchOut with full minute precision.
 * Prioritizes actual timestamps whenever both exist, preventing stale or rounded 8h defaults.
 */
export function getRecordActualHours(
  record?: PunchRecordLike | null,
  nowMs: number = Date.now(),
): number {
  if (!record) return 0;

  if (record.punchIn) {
    const tIn = new Date(record.punchIn).getTime();
    if (!isNaN(tIn)) {
      if (record.punchOut) {
        const tOut = new Date(record.punchOut).getTime();
        if (!isNaN(tOut) && tOut >= tIn) {
          return (tOut - tIn) / 3600000;
        }
      } else {
        // Currently working
        if (nowMs >= tIn) {
          return (nowMs - tIn) / 3600000;
        }
      }
    }
  }

  return typeof record.hours === "number" && !isNaN(record.hours) ? record.hours : 0;
}

export const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const elapsed = (fromIso: string, toMs: number) => {
  const ms = Math.max(0, toMs - new Date(fromIso).getTime());
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export const fmtRelativeTime = (iso?: string | null) => {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0 || diffMs < 45000) return "Just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso);
};
