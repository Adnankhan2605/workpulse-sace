import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, Download, Edit3, FilePenLine, Filter, Plus, UserCheck } from "lucide-react";
import { AppShell, EmptyState, Initials, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/lib/store";
import { fmtDateTime } from "@/lib/format";
import {
  EOD_PERIODS,
  downloadEodPdf,
  eodPeriodLabel,
  filterEodByPeriod,
  periodRangeLabel,
  type EodPeriod,
} from "@/lib/eod";
import { EodLogoutDialog } from "@/components/eod-logout-dialog";
import type { EodReport } from "@/lib/types";

export const Route = createFileRoute("/eod")({
  head: () => ({
    meta: [
      { title: "EOD Reports — SACE Portal" },
      {
        name: "description",
        content:
          "Daily, weekly, monthly and quarterly end-of-day reports with PDF download for an individual or the whole team.",
      },
      { property: "og:title", content: "EOD Reports — SACE Portal" },
      {
        property: "og:description",
        content: "End-of-day work reports across the SACE team, downloadable as PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <EodPage />
    </AppShell>
  ),
});

function EodPage() {
  const { state, me, visibleUsers, can } = useApp();
  const isAdmin = can("view_all_eod");
  const [period, setPeriod] = React.useState<EodPeriod>("all");
  const [personId, setPersonId] = React.useState<string>(isAdmin ? "all" : (me?.id ?? "all"));
  const [writeDialogOpen, setWriteDialogOpen] = React.useState(false);
  const [editingReport, setEditingReport] = React.useState<EodReport | null>(null);

  React.useEffect(() => {
    if (me && !isAdmin && personId === "all") {
      setPersonId(me.id);
    }
  }, [me, isAdmin, personId]);

  if (!me) return null;

  const scopeUsers = isAdmin ? visibleUsers() : [me];
  const scopeIds = scopeUsers.map((u) => u.id);

  const inScope = state.eodReports.filter(
    (r) => scopeIds.includes(r.userId) && (personId === "all" || r.userId === personId),
  );
  const reports = filterEodByPeriod(inScope, period);
  const range = periodRangeLabel(period);

  const personName =
    personId === "all"
      ? "All team members"
      : (scopeUsers.find((u) => u.id === personId)?.fullName ?? "");

  // Aggregate metrics
  const totalHours = reports.reduce((acc, r) => acc + (r.hours || 0), 0);
  const uniqueContributors = new Set(reports.map((r) => r.userId)).size;

  return (
    <>
      <PageHeader
        title="EOD Reports"
        description={
          isAdmin
            ? "End-of-day reports submitted across team members. Working hours are auto-calculated from punch in/out. Easily review, edit, or download PDF summaries."
            : "Your daily end-of-day reports. View logged hours, track completed items, edit past reports, or export as PDF."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => setWriteDialogOpen(true)}
              className="gap-1.5 shadow-sm"
            >
              <Plus className="h-4 w-4" /> Write report
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadEodPdf({
                  title: `${eodPeriodLabel(period)} EOD — ${personName}`,
                  subtitle: `${range} · ${reports.length} report${reports.length === 1 ? "" : "s"}`,
                  reports,
                  users: state.users,
                })
              }
            >
              <Download className="h-4 w-4" /> Download PDF
            </Button>
          </div>
        }
      />

      {/* Summary KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Total Reports</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{reports.length}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Total Hours Logged</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-primary">
            {Math.round(totalHours * 10) / 10}h
          </p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Avg Shift Length</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {reports.length > 0 ? Math.round((totalHours / reports.length) * 10) / 10 : 0}h
          </p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Team Contributors</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {uniqueContributors}
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Select value={period} onValueChange={(v) => setPeriod(v as EodPeriod)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EOD_PERIODS.map((p) => (
              <SelectItem key={p} value={p}>
                {eodPeriodLabel(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && (
          <Select value={personId} onValueChange={setPersonId}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All team members</SelectItem>
              {scopeUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.fullName} ({u.designation})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <span className="self-center text-xs font-medium text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md">
          {range}
        </span>
      </div>

      {reports.length === 0 ? (
        <EmptyState
          title="No EOD reports found for this filter"
          hint="Try selecting 'All Reports' or click '+ Write report' to create a report for today or any previous date."
        />
      ) : (
        <div className="space-y-4">
          {reports.map((r) => {
            const u = state.users.find((x) => x.id === r.userId);
            const canEdit =
              me?.role === "super_admin" || me?.role === "admin" || me?.id === r.userId;
            const linkedTasks = (r.taskIds ?? [])
              .map((id) => state.tasks.find((t) => t.id === id))
              .filter(Boolean);

            return (
              <Card key={r.id} className="rounded-2xl transition hover:border-primary/30">
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div className="flex items-center gap-3">
                      <Initials name={u?.fullName ?? "?"} color={u?.avatarColor} size={36} />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground">
                            {u?.fullName ?? "Unknown"}
                          </p>
                          <Badge variant="outline" className="text-[10px] uppercase font-mono">
                            {u?.department}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {r.date} ·{" "}
                          <span className="font-semibold text-primary">{r.hours}h logged</span> ·
                          submitted {fmtDateTime(r.submittedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingReport(r)}
                          className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Edit3 className="h-3.5 w-3.5" /> Edit
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          downloadEodPdf({
                            title: `EOD ${r.date} — ${u?.fullName ?? "Report"}`,
                            subtitle: `Single day report`,
                            reports: [r],
                            users: state.users,
                          })
                        }
                        className="h-8 gap-1 text-xs"
                      >
                        <Download className="h-3.5 w-3.5" /> PDF
                      </Button>
                    </div>
                  </div>

                  <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
                    <div className="rounded-lg bg-muted/30 p-3">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Worked On
                      </dt>
                      <dd className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-foreground">
                        {r.worked || "—"}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Completed
                      </dt>
                      <dd className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-foreground">
                        {r.completed || "—"}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Blockers & Dependencies
                      </dt>
                      <dd className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-foreground">
                        {r.blockers ? (
                          <span className="text-amber-600 dark:text-amber-400">{r.blockers}</span>
                        ) : (
                          <span className="text-muted-foreground">None reported</span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  {linkedTasks.length > 0 && (
                    <div className="mt-3.5 flex flex-wrap items-center gap-1.5 pt-2 text-xs text-muted-foreground">
                      <span className="font-medium">Deliverables referenced:</span>
                      {linkedTasks.map((t) => (
                        <Badge key={t!.id} variant="secondary" className="text-[11px]">
                          ✓ {t!.title}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Report Dialog */}
      <EodLogoutDialog
        open={writeDialogOpen}
        onOpenChange={setWriteDialogOpen}
        mode="write"
        onDone={() => setWriteDialogOpen(false)}
      />

      {/* Edit Existing Report Dialog */}
      {editingReport && (
        <EodLogoutDialog
          open={!!editingReport}
          onOpenChange={(open) => {
            if (!open) setEditingReport(null);
          }}
          mode="edit"
          reportToEdit={editingReport}
          onDone={() => setEditingReport(null)}
        />
      )}
    </>
  );
}
