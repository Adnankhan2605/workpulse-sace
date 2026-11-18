import * as React from "react";
import { Clock, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface DualTimezoneClockProps {
  /** Optional shared epoch timestamp (ms). If omitted, manages its own 1s interval. */
  now?: number;
  /** Visual density: "card" for dashboard headers, "compact" for sticky top app bar. */
  variant?: "card" | "compact";
  className?: string;
}

const indiaTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

const indiaDateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const adelaideTimeFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Adelaide",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

const adelaideDateFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Adelaide",
  weekday: "short",
  day: "numeric",
  month: "short",
});

const adelaideOffsetFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Adelaide",
  timeZoneName: "shortOffset",
});

const adelaideShortNameFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Adelaide",
  timeZoneName: "short",
});

function getAdelaideZoneAbbr(date: Date): "ACDT" | "ACST" {
  const shortParts = adelaideShortNameFormatter.formatToParts(date);
  const shortName = shortParts.find((p) => p.type === "timeZoneName")?.value;
  if (shortName === "ACDT" || shortName === "ACST") {
    return shortName;
  }

  const offsetParts = adelaideOffsetFormatter.formatToParts(date);
  const offset = offsetParts.find((p) => p.type === "timeZoneName")?.value ?? "";
  return offset.includes("+10:30") ? "ACDT" : "ACST";
}

export function DualTimezoneClock({
  now: externalNow,
  variant = "card",
  className,
}: DualTimezoneClockProps) {
  const [internalNow, setInternalNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (externalNow !== undefined) return;
    const id = setInterval(() => setInternalNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [externalNow]);

  const currentDate = new Date(externalNow ?? internalNow);
  const indiaTime = indiaTimeFormatter.format(currentDate);
  const indiaDate = indiaDateFormatter.format(currentDate);
  const adelaideTime = adelaideTimeFormatter.format(currentDate);
  const adelaideDate = adelaideDateFormatter.format(currentDate);
  const adelaideZone = getAdelaideZoneAbbr(currentDate);

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex flex-col justify-center rounded-xl border border-border bg-card/80 px-3 py-1.5 shadow-xs",
          className,
        )}
        aria-label="Current time in India and Adelaide"
      >
        <div className="flex items-center justify-between gap-3 text-xs leading-tight">
          <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
            <Clock className="h-3 w-3 text-[#8A007E] dark:text-purple-400" />
            IST • India
          </span>
          <span suppressHydrationWarning className="font-semibold tabular-nums text-foreground">
            {indiaTime}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-3 text-[11px] leading-tight text-slate-500 dark:text-purple-300/70">
          <span className="inline-flex items-center gap-1">
            <Globe className="h-2.5 w-2.5 opacity-80" />
            {adelaideZone} • Adelaide
          </span>
          <span suppressHydrationWarning className="tabular-nums">
            {adelaideTime} · {adelaideDate}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-xs",
        className,
      )}
      aria-label="Dual time zone clock for India and Adelaide, Australia"
    >
      {/* Primary Clock: Indian Standard Time (IST) */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-[#8A007E] dark:text-purple-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            IST • India
          </span>
        </div>
        <div className="text-right">
          <span suppressHydrationWarning className="text-sm font-bold tabular-nums text-foreground">
            {indiaTime}
          </span>
          <span
            suppressHydrationWarning
            className="ml-2 hidden text-xs text-muted-foreground sm:inline"
          >
            {indiaDate}
          </span>
        </div>
      </div>

      {/* Secondary Clock: Adelaide, Australia (ACDT / ACST) */}
      <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-border/60 pt-1.5 text-xs text-slate-500 dark:text-purple-300/70">
        <div className="flex items-center gap-1.5">
          <Globe className="h-3 w-3 shrink-0 opacity-80" />
          <span className="font-medium tracking-wide">{adelaideZone} • Adelaide</span>
        </div>
        <div className="text-right tabular-nums">
          <span suppressHydrationWarning className="font-medium">
            {adelaideTime}
          </span>
          <span suppressHydrationWarning className="ml-1.5 opacity-85">
            · {adelaideDate}
          </span>
        </div>
      </div>
    </div>
  );
}
