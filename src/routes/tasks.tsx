import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  Filter,
  Image as ImageIcon,
  Link as LinkIcon,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  UserCheck,
  Users,
  ZoomIn,
} from "lucide-react";
import { AppShell, EmptyState, Initials, PageHeader } from "@/components/app-shell";
import ProofReviewSection from "@/components/proof-review-section";
import {
  isSafeImageSrc,
  sanitizeExternalUrl,
  validateAndNormalizeImage,
  validateProofDocumentFile,
} from "@/lib/security";
import { StatCard, StatusPill } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { fmtDateTime, titleCase } from "@/lib/format";
import { CADENCES, cadenceDueDate, cadenceLabel } from "@/lib/cadence";
import type {
  Priority,
  ProofType,
  Task,
  TaskCadence,
  TaskProof,
  TaskStatus,
  User,
} from "@/lib/types";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks Hub — SACE Portal" },
      {
        name: "description",
        content: "Team and individual task management, planning, proof of work, and review.",
      },
      { property: "og:title", content: "Tasks Hub — SACE Portal" },
      {
        property: "og:description",
        content: "Self-managed and team task planning with proof of completion.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <TasksPage />
    </AppShell>
  ),
});

function TasksPage() {
  const { state, me, visibleUsers, update, log } = useApp();
  const isAdmin = me?.role !== "member";
  const [activeTab, setActiveTab] = React.useState<"team" | "my" | "proofs">(
    isAdmin ? "team" : "my",
  );

  // Filters
  const [memberFilter, setMemberFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [cadenceFilter, setCadenceFilter] = React.useState<string>("all");
  const [dateFilter, setDateFilter] = React.useState<string>("");
  const [query, setQuery] = React.useState<string>("");
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);
  const [previewProof, setPreviewProof] = React.useState<{
    proof: TaskProof;
    taskTitle: string;
    assigneeName: string;
  } | null>(null);

  // All proofs for gallery
  const allProofsWithTask = React.useMemo(() => {
    const list: Array<{ proof: TaskProof; task: Task; user: User | undefined }> = [];
    state.tasks.forEach((t) => {
      const u = state.users.find((user) => user.id === t.assigneeId);
      t.proofs.forEach((p) => {
        list.push({ proof: p, task: t, user: u });
      });
    });
    return list.sort((a, b) => (a.proof.submittedAt < b.proof.submittedAt ? 1 : -1));
  }, [state.tasks, state.users]);

  if (!me) return null;

  const todayKey = dateKey(new Date());
  const allUsers = state.users;
  const teamMembers = me?.role === "super_admin" ? state.users : visibleUsers();
  const teamMemberIds = teamMembers.map((u) => u.id);

  // Scope determination
  const rawTasks =
    activeTab === "my"
      ? state.tasks.filter((t) => t.assigneeId === me.id)
      : state.tasks.filter((t) => teamMemberIds.includes(t.assigneeId));

  const filteredTasks = rawTasks.filter((t) => {
    if (activeTab !== "my" && memberFilter !== "all" && t.assigneeId !== memberFilter) {
      return false;
    }
    if (statusFilter === "overdue") {
      if (!(t.dueDate < todayKey && !["approved", "completed"].includes(t.status))) return false;
    } else if (statusFilter !== "all" && t.status !== statusFilter) {
      return false;
    }
    if (cadenceFilter !== "all" && t.cadence !== cadenceFilter) {
      return false;
    }
    if (dateFilter && t.dueDate !== dateFilter) {
      return false;
    }
    if (query) {
      const q = query.toLowerCase();
      const assignee = state.users.find((u) => u.id === t.assigneeId);
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchDesc = t.description.toLowerCase().includes(q);
      const matchAssignee = assignee?.fullName.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchAssignee) return false;
    }
    return true;
  });

  // Metrics for team
  const totalCount = rawTasks.length;
  const inProgressCount = rawTasks.filter((t) => t.status === "in_progress").length;
  const submittedCount = rawTasks.filter((t) => t.status === "submitted").length;
  const completedCount = rawTasks.filter((t) =>
    ["approved", "completed"].includes(t.status),
  ).length;
  const overdueCount = rawTasks.filter(
    (t) => t.dueDate < todayKey && !["approved", "completed"].includes(t.status),
  ).length;

  return (
    <>
      <PageHeader
        title={isAdmin ? "Tasks & Deliverables" : "My Tasks"}
        description={
          isAdmin
            ? "Super Admins and Admins can assign tasks to any team member, review submitted completion proofs, and monitor execution."
            : "Plan your tasks, upload completion proofs, and track status approvals."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <NewTaskDialog
              defaultAssigneeId={me!.id}
              teamMembers={teamMembers}
              canAssignOthers={isAdmin}
            />
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as typeof activeTab);
            if (v === "my") setMemberFilter("all");
          }}
        >
          <TabsList className="grid grid-cols-3 w-80 sm:w-96">
            {isAdmin && (
              <TabsTrigger value="team" className="gap-1.5 text-xs">
                <Users className="h-4 w-4" /> Team Tasks
              </TabsTrigger>
            )}
            <TabsTrigger value="my" className="gap-1.5 text-xs">
              <UserCheck className="h-4 w-4" /> My Tasks
            </TabsTrigger>
            <TabsTrigger value="proofs" className="gap-1.5 text-xs">
              <FileCheck2 className="h-4 w-4" /> Proofs Gallery
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Overview Stat Cards */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Tasks" value={totalCount} icon={CalendarCheck} />
        <StatCard label="In Progress" value={inProgressCount} icon={Clock} accent="teal" />
        <StatCard
          label="Needs Review"
          value={submittedCount}
          icon={FileCheck2}
          accent="purple"
          hint="Proofs awaiting review"
        />
        <StatCard
          label="Approved / Done"
          value={completedCount}
          icon={CheckCircle2}
          accent="success"
        />
        <StatCard
          label="Overdue"
          value={overdueCount}
          hint={overdueCount > 0 ? "Requires attention" : "On schedule"}
        />
      </div>

      {/* Tab Content: Proofs Gallery */}
      {activeTab === "proofs" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Uploaded Completion Proofs ({allProofsWithTask.length})
            </h2>
            <span className="text-xs text-muted-foreground">
              Inspect screenshots, verification files, and links uploaded across tasks
            </span>
          </div>

          {allProofsWithTask.length === 0 ? (
            <EmptyState
              title="No completion proofs uploaded yet"
              hint="When team members submit tasks with image screenshots, links, or documents, they will appear here for one-click review."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {allProofsWithTask.map(({ proof, task, user }) => {
                const isImage =
                  proof.type === "image" ||
                  proof.value.startsWith("data:image") ||
                  proof.value.includes("images.unsplash.com") ||
                  /\.(jpg|jpeg|png|webp|gif)/i.test(proof.value);

                return (
                  <Card
                    key={proof.id}
                    className="overflow-hidden rounded-2xl transition hover:border-primary/40 hover:shadow-md"
                  >
                    {/* Visual Media Preview */}
                    {isImage ? (
                      <div
                        className="relative h-44 w-full cursor-pointer bg-muted/40 overflow-hidden group"
                        onClick={() =>
                          setPreviewProof({
                            proof,
                            taskTitle: task.title,
                            assigneeName: user?.fullName ?? "Team Member",
                          })
                        }
                      >
                        <img
                          src={proof.value}
                          alt={task.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-medium text-xs gap-1">
                          <ZoomIn className="h-4 w-4" /> Click to enlarge proof
                        </div>
                        <Badge className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-[10px] text-white border-none">
                          Screenshot / Image
                        </Badge>
                      </div>
                    ) : proof.type === "link" ? (
                      <div className="h-28 bg-primary/5 p-4 flex flex-col justify-between border-b border-border/50">
                        <div className="flex items-center gap-2 text-primary font-medium text-xs">
                          <LinkIcon className="h-4 w-4 shrink-0" /> Verified Web Link
                        </div>
                        {sanitizeExternalUrl(proof.value) ? (
                          <a
                            href={sanitizeExternalUrl(proof.value)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-foreground font-mono truncate underline hover:text-primary flex items-center gap-1"
                          >
                            {proof.value} <ExternalLink className="h-3 w-3 inline shrink-0" />
                          </a>
                        ) : (
                          <span className="text-xs text-destructive font-mono truncate">
                            Blocked unsafe URL
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="h-28 bg-muted/30 p-4 flex flex-col justify-between border-b border-border/50">
                        <div className="flex items-center gap-2 text-foreground font-medium text-xs">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" /> Uploaded
                          Document
                        </div>
                        <p className="text-xs font-mono text-muted-foreground truncate bg-background p-1.5 rounded border">
                          {proof.value}
                        </p>
                      </div>
                    )}

                    <CardContent className="p-4 space-y-3">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <StatusPill value={task.status} />
                          <span className="text-[10px] text-muted-foreground">
                            {fmtDateTime(proof.submittedAt)}
                          </span>
                        </div>
                        <h4 className="mt-2 text-sm font-semibold text-foreground line-clamp-1">
                          {task.title}
                        </h4>
                        {proof.note && (
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2 italic">
                            &quot;{proof.note}&quot;
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border/60">
                        <div className="flex items-center gap-2">
                          <Initials
                            name={user?.fullName ?? "?"}
                            color={user?.avatarColor}
                            src={user?.avatarUrl}
                            size={24}
                          />
                          <span className="text-xs font-medium text-foreground">
                            {user?.fullName ?? "Unknown"}
                          </span>
                        </div>

                        {isAdmin && task.status === "submitted" && (
                          <TaskActions
                            task={task}
                            isAdmin={isAdmin}
                            isAssignedToMe={task.assigneeId === me!.id}
                            compact
                            onPreviewProof={(p, title, name) =>
                              setPreviewProof({ proof: p, taskTitle: title, assigneeName: name })
                            }
                          />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Task List Mode (Team or My) */
        <>
          {/* Filter Toolbar */}
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] max-w-xs flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 text-xs"
                placeholder={activeTab === "team" ? "Search title or assignee…" : "Search tasks…"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search tasks"
              />
            </div>

            {activeTab === "team" && (
              <Select value={memberFilter} onValueChange={setMemberFilter}>
                <SelectTrigger className="w-48 text-xs">
                  <SelectValue placeholder="All Members" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Team Members</SelectItem>
                  {teamMembers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName} {u.id === me!.id ? "(You)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {[
                  "all",
                  "assigned",
                  "in_progress",
                  "submitted",
                  "approved",
                  "completed",
                  "overdue",
                ].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "all"
                      ? "All statuses"
                      : s === "submitted"
                        ? "Submitted (Review)"
                        : titleCase(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={cadenceFilter} onValueChange={setCadenceFilter}>
              <SelectTrigger className="w-36 text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {CADENCES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {cadenceLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-36 text-xs"
                placeholder="Due date filter"
                title="Filter by target due date"
              />
              {dateFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDateFilter("")}
                  className="h-9 px-2 text-xs text-muted-foreground"
                >
                  Clear date
                </Button>
              )}
            </div>
          </div>

          {/* Task List */}
          {filteredTasks.length === 0 ? (
            <EmptyState
              title="No tasks match the criteria"
              hint="Try adjusting the search or filters, or click '+ New task' to create a task."
            />
          ) : (
            <div className="space-y-4">
              {filteredTasks.map((task) => {
                const overdue =
                  task.dueDate < todayKey && !["approved", "completed"].includes(task.status);
                const assignee = state.users.find((u) => u.id === task.assigneeId);
                const isAssignedToMe = task.assigneeId === me!.id;
                const canEditTask = isAdmin || task.assignedById === me!.id;

                return (
                  <Card key={task.id} className="rounded-2xl transition-shadow hover:shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {cadenceLabel(task.cadence)} task
                            </span>
                            <span className="text-muted-foreground text-xs">·</span>
                            <span className="text-xs text-muted-foreground">
                              Target date:{" "}
                              <strong className="text-foreground">{task.dueDate}</strong>
                            </span>
                            <span className="text-muted-foreground text-xs">·</span>
                            <span className="text-xs text-muted-foreground">
                              Required Proof: <strong>{titleCase(task.requiredProof)}</strong>
                            </span>
                          </div>
                          <h3 className="text-base font-semibold text-foreground">{task.title}</h3>
                          {task.description && (
                            <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
                          )}

                          {activeTab === "team" && assignee && (
                            <div className="mt-3 flex items-center gap-2 text-xs">
                              <Initials
                                name={assignee.fullName}
                                color={assignee.avatarColor}
                                src={assignee.avatarUrl}
                                size={22}
                              />
                              <span className="font-medium text-foreground">
                                {assignee.fullName}
                              </span>
                              <span className="text-muted-foreground">
                                ({assignee.designation})
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {canEditTask && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingTask(task)}
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit
                            </Button>
                          )}
                          <StatusPill value={task.priority} />
                          <StatusPill value={overdue ? "overdue" : task.status} />
                        </div>
                      </div>

                      {/* Submitted Proofs Display with Visual Thumbnail */}
                      {task.proofs.length > 0 && (
                        <div className="mt-4 space-y-2.5 rounded-xl border border-border/80 bg-muted/30 p-3.5">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-foreground flex items-center gap-1.5">
                              <FileCheck2 className="h-3.5 w-3.5 text-primary" /> Submitted
                              Completion Proof ({task.proofs.length})
                            </p>
                            <span className="text-[11px] text-muted-foreground">
                              Click on image/link to inspect
                            </span>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            {task.proofs.map((p) => {
                              const isImage =
                                p.type === "image" ||
                                p.value.startsWith("data:image") ||
                                p.value.includes("images.unsplash.com") ||
                                /\.(jpg|jpeg|png|webp|gif)/i.test(p.value);

                              return (
                                <div
                                  key={p.id}
                                  className="rounded-lg border border-border bg-card p-2.5 text-xs shadow-xs"
                                >
                                  <div className="flex items-start gap-2.5">
                                    {isImage ? (
                                      <div
                                        className="relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded border border-border group"
                                        onClick={() =>
                                          setPreviewProof({
                                            proof: p,
                                            taskTitle: task.title,
                                            assigneeName: assignee?.fullName ?? "Member",
                                          })
                                        }
                                      >
                                        <img
                                          src={p.value}
                                          alt="Proof"
                                          className="h-full w-full object-cover group-hover:opacity-80"
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100">
                                          <ZoomIn className="h-3 w-3 text-white" />
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                                        {p.type === "link" ? (
                                          <LinkIcon className="h-4 w-4" />
                                        ) : (
                                          <FileText className="h-4 w-4" />
                                        )}
                                      </div>
                                    )}

                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center justify-between">
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] uppercase font-mono"
                                        >
                                          {p.type} proof
                                        </Badge>
                                        <span className="text-[10px] text-muted-foreground">
                                          {fmtDateTime(p.submittedAt)}
                                        </span>
                                      </div>

                                      {p.type === "link" ? (
                                        sanitizeExternalUrl(p.value) ? (
                                          <a
                                            href={sanitizeExternalUrl(p.value)!}
                                            className="mt-1 block truncate text-primary underline"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            {p.value}
                                          </a>
                                        ) : (
                                          <span className="mt-1 block truncate text-destructive font-mono">
                                            Blocked unsafe URL
                                          </span>
                                        )
                                      ) : isImage ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPreviewProof({
                                              proof: p,
                                              taskTitle: task.title,
                                              assigneeName: assignee?.fullName ?? "Member",
                                            })
                                          }
                                          className="mt-1 text-left font-medium text-foreground hover:underline text-xs"
                                        >
                                          Click to view screenshot
                                        </button>
                                      ) : (
                                        <p className="mt-1 font-mono text-muted-foreground truncate">
                                          {p.value}
                                        </p>
                                      )}

                                      {p.note && (
                                        <p className="mt-1 text-[11px] text-muted-foreground">
                                          Note: {p.note}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {isAdmin && task.proofs.length > 0 && (
                        <ProofReviewSection
                          task={task}
                          onStatusChange={(newStatus) => {
                            if (!isAdmin) {
                              toast.error("Admin privileges required to review task proofs.");
                              return;
                            }
                            const statusMap: Record<string, TaskStatus> = {
                              Accepted: "approved",
                              Rejected: "rejected",
                              "Re-upload": "revision_requested",
                            };
                            const targetStatus = statusMap[newStatus] || "submitted";
                            update((d) => {
                              const t = d.tasks.find((x) => x.id === task.id);
                              if (t) t.status = targetStatus;
                            });
                            log("Task review status updated", `${task.title} → ${newStatus}`);
                            toast.success(`Task status updated to ${newStatus}`);
                          }}
                        />
                      )}

                      {/* Task Actions */}
                      <TaskActions
                        task={task}
                        isAdmin={isAdmin}
                        isAssignedToMe={isAssignedToMe}
                        onPreviewProof={(p, title, name) =>
                          setPreviewProof({ proof: p, taskTitle: title, assigneeName: name })
                        }
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Edit Task Dialog */}
      {editingTask && (
        <EditTaskDialog
          task={editingTask}
          open={!!editingTask}
          onOpenChange={(open) => {
            if (!open) setEditingTask(null);
          }}
          teamMembers={teamMembers}
        />
      )}

      {/* Lightbox Image Preview Dialog */}
      {previewProof && (
        <Dialog open={!!previewProof} onOpenChange={(open) => !open && setPreviewProof(null)}>
          <DialogContent className="max-w-3xl rounded-2xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base">{previewProof.taskTitle}</DialogTitle>
              <DialogDescription>
                Proof submitted by {previewProof.assigneeName} on{" "}
                {fmtDateTime(previewProof.proof.submittedAt)}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-2 space-y-4">
              <div className="flex justify-center rounded-xl bg-black/90 p-2 overflow-hidden max-h-[60vh]">
                <img
                  src={previewProof.proof.value}
                  alt="Full proof screenshot"
                  className="max-h-[58vh] max-w-full rounded object-contain"
                />
              </div>
              {previewProof.proof.note && (
                <div className="rounded-lg bg-muted/40 p-3 text-xs">
                  <span className="font-semibold text-foreground">Submitter Note:</span>{" "}
                  <span className="text-muted-foreground">{previewProof.proof.note}</span>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function TaskActions({
  task,
  isAdmin,
  isAssignedToMe,
  compact = false,
  onPreviewProof,
}: {
  task: Task;
  isAdmin: boolean;
  isAssignedToMe: boolean;
  compact?: boolean;
  onPreviewProof?: (proof: TaskProof, taskTitle: string, assigneeName: string) => void;
}) {
  const { update, log, me, notify, state } = useApp();
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [reviewNote, setReviewNote] = React.useState("");
  const [reviewStatus, setReviewStatus] = React.useState<"approved" | "rejected" | "reupload">(
    "approved",
  );

  const assigneeUser = state.users.find((u) => u.id === task.assigneeId);
  const assigneeName = assigneeUser?.fullName ?? "Team Member";

  const setStatus = (status: TaskStatus, msg: string) => {
    update((d) => {
      const t = d.tasks.find((x) => x.id === task.id);
      if (t) t.status = status;
    });
    log("Task updated", `${task.title} → ${titleCase(status)}`);
    toast.success(msg);
  };

  const handleApprove = () => {
    update((d) => {
      const t = d.tasks.find((x) => x.id === task.id);
      if (t) {
        t.status = "approved";
        if (reviewNote.trim()) {
          t.comments.push({
            id: newId(),
            authorId: me!.id,
            body: `Approved: ${reviewNote.trim()}`,
            at: isoNow(),
          });
        }
      }
    });
    notify(
      task.assigneeId,
      "Task Approved",
      `Your task "${task.title}" has been approved.`,
      "/tasks",
    );
    log("Task approved", task.title);
    toast.success("Task approved.");
    setReviewOpen(false);
  };

  const handleReject = () => {
    update((d) => {
      const t = d.tasks.find((x) => x.id === task.id);
      if (t) {
        t.status = "rejected";
        if (reviewNote.trim()) {
          t.comments.push({
            id: newId(),
            authorId: me!.id,
            body: `Rejected: ${reviewNote.trim()}`,
            at: isoNow(),
          });
        }
      }
    });
    notify(
      task.assigneeId,
      "Task Rejected",
      `Your task "${task.title}" was rejected: ${reviewNote.trim() || "No feedback provided."}`,
      "/tasks",
    );
    log("Task rejected", task.title);
    toast.success("Task rejected.");
    setReviewOpen(false);
  };

  const handleRequestRevision = () => {
    if (!reviewNote.trim()) {
      toast.error("Please add feedback explaining the required revisions.");
      return;
    }
    update((d) => {
      const t = d.tasks.find((x) => x.id === task.id);
      if (t) {
        t.status = "revision_requested";
        t.comments.push({
          id: newId(),
          authorId: me!.id,
          body: `Revision requested (Reupload): ${reviewNote.trim()}`,
          at: isoNow(),
        });
      }
    });
    notify(
      task.assigneeId,
      "Reupload / Revision Requested",
      `Your admin requested reupload on "${task.title}": ${reviewNote.trim()}`,
      "/tasks",
    );
    log("Task reupload requested", task.title);
    toast.success("Reupload / Revision requested.");
    setReviewOpen(false);
  };

  const handleSubmitReview = () => {
    if (reviewStatus === "approved") {
      handleApprove();
    } else if (reviewStatus === "rejected") {
      handleReject();
    } else if (reviewStatus === "reupload") {
      handleRequestRevision();
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "mt-0" : "mt-4"}`}>
      {/* Member actions */}
      {isAssignedToMe && task.status === "assigned" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setStatus("in_progress", "Task started")}
        >
          Start task
        </Button>
      )}

      {isAssignedToMe && !["approved", "completed"].includes(task.status) && (
        <SubmitProofDialog task={task} />
      )}

      {isAssignedToMe && task.status !== "completed" && task.status !== "approved" && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setStatus("completed", "Task marked complete")}
        >
          Mark complete
        </Button>
      )}

      {/* Admin review actions for submitted tasks */}
      {isAdmin && task.status === "submitted" && (
        <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 shadow-sm">
              <FileCheck2 className="h-4 w-4" /> Review proof
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl max-w-lg overflow-hidden">
            <DialogHeader>
              <DialogTitle>Review Task Proof</DialogTitle>
              <DialogDescription>
                Review submitted proof for &quot;{task.title}&quot; and select action.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
              <div className="rounded-xl bg-muted p-3.5 text-xs space-y-2.5 overflow-hidden">
                <p className="font-semibold text-foreground">Submitted proof details:</p>
                {task.proofs.map((p) => {
                  const isImage =
                    p.type === "image" ||
                    p.value.startsWith("data:image") ||
                    p.value.includes("images.unsplash.com") ||
                    /\.(jpg|jpeg|png|webp|gif)/i.test(p.value);

                  return (
                    <div
                      key={p.id}
                      className="rounded-lg border bg-card p-3 space-y-2 overflow-hidden max-w-full"
                    >
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px] uppercase font-mono">
                          {p.type} proof
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {fmtDateTime(p.submittedAt)}
                        </span>
                      </div>

                      {isImage ? (
                        <div
                          className="relative h-28 w-full cursor-pointer overflow-hidden rounded-md border border-border bg-muted/40 group"
                          onClick={() => {
                            setReviewOpen(false);
                            onPreviewProof?.(p, task.title, assigneeName);
                          }}
                        >
                          <img
                            src={p.value}
                            alt="Proof thumbnail"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-medium text-xs gap-1">
                            <ZoomIn className="h-4 w-4" /> Click to enlarge proof
                          </div>
                        </div>
                      ) : p.type === "link" ? (
                        sanitizeExternalUrl(p.value) ? (
                          <a
                            href={sanitizeExternalUrl(p.value)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-primary underline truncate text-xs font-mono break-all"
                          >
                            {p.value} <ExternalLink className="h-3 w-3 inline shrink-0 ml-1" />
                          </a>
                        ) : (
                          <span className="block text-destructive text-xs font-mono">
                            Blocked unsafe URL
                          </span>
                        )
                      ) : (
                        <p className="text-foreground font-mono text-xs break-all bg-muted/50 p-2 rounded">
                          {p.value}
                        </p>
                      )}

                      {p.note && (
                        <p className="text-muted-foreground text-[11px] italic">Note: {p.note}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Admin Status Dropdown */}
              <div className="space-y-1.5">
                <Label htmlFor="review-status-select" className="text-xs">
                  Review Status Action
                </Label>
                <Select
                  value={reviewStatus}
                  onValueChange={(v) => setReviewStatus(v as "approved" | "rejected" | "reupload")}
                >
                  <SelectTrigger id="review-status-select" className="text-xs">
                    <SelectValue placeholder="Select status action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="reupload">Reupload (Request Revision)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="review-note" className="text-xs">
                  Review feedback{" "}
                  {reviewStatus === "reupload" || reviewStatus === "rejected"
                    ? "(required)"
                    : "(optional)"}
                </Label>
                <Textarea
                  id="review-note"
                  placeholder="Feedback or instructions…"
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  rows={3}
                  className="text-xs"
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => setReviewOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSubmitReview}>
                  Submit Review Action
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isAdmin && task.status !== "approved" && task.status !== "completed" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setStatus("approved", "Task approved by admin")}
        >
          Quick approve
        </Button>
      )}
    </div>
  );
}

function SubmitProofDialog({ task }: { task: Task }) {
  const { update, log, me, state, notify } = useApp();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<"image" | "file" | "link" | "text">(
    task.requiredProof === "any"
      ? "text"
      : (task.requiredProof as "image" | "file" | "link" | "text"),
  );
  const [value, setValue] = React.useState("");
  const [note, setNote] = React.useState("");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (type === "image") {
        const normalized = await validateAndNormalizeImage(file, {
          maxDim: 960,
          quality: 0.78,
        });
        setValue(normalized);
      } else {
        const { safeName } = validateProofDocumentFile(file);
        setValue(safeName);
      }
    } catch (err) {
      e.target.value = "";
      setValue("");
      toast.error(err instanceof Error ? err.message : "Invalid file upload.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 shadow-sm">
          <FileCheck2 className="h-4 w-4" /> Submit proof
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit Completion Proof</DialogTitle>
          <DialogDescription>
            Provide verifiable proof (link, document, screenshot or detail) that you finished &quot;
            {task.title}&quot;.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label className="text-xs">Proof Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image">Screenshot / Image</SelectItem>
                <SelectItem value="link">URL / Web Link</SelectItem>
                <SelectItem value="file">File / Document</SelectItem>
                <SelectItem value="text">Written Sign-off / Note</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "image" ? (
            <div className="space-y-2">
              <Label htmlFor="proof-file" className="text-xs">
                Upload Screenshot / Image (JPEG, PNG, WebP · max 2 MB)
              </Label>
              <Input
                id="proof-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => void handleFileUpload(e)}
                className="text-xs"
              />
              {value && isSafeImageSrc(value) && (
                <div className="mt-2 rounded-lg border p-1 bg-muted/40 max-h-36 overflow-hidden flex justify-center">
                  <img src={value} alt="Preview" className="max-h-32 rounded object-contain" />
                </div>
              )}
            </div>
          ) : type === "file" ? (
            <div className="space-y-2">
              <Label htmlFor="proof-file-doc" className="text-xs">
                Upload Document / File
              </Label>
              <Input
                id="proof-file-doc"
                type="file"
                onChange={handleFileUpload}
                className="text-xs"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="proof-value" className="text-xs">
                {type === "link" ? "Document / Delivery URL" : "Sign-off Note"}
              </Label>
              <Input
                id="proof-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  type === "link" ? "https://docs.google.com/..." : "Details on what was completed"
                }
                className="text-xs"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="proof-note" className="text-xs">
              Optional Comments / Context
            </Label>
            <Textarea
              id="proof-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any context for your reviewer…"
              rows={2}
              className="text-xs"
            />
          </div>

          <Button
            className="w-full"
            disabled={!value.trim()}
            onClick={() => {
              let submittedValue = value.trim();
              if (type === "link") {
                const safeUrl = sanitizeExternalUrl(submittedValue);
                if (!safeUrl) {
                  toast.error("Please enter a valid http:// or https:// URL.");
                  return;
                }
                submittedValue = safeUrl;
              }
              update((d) => {
                const t = d.tasks.find((x) => x.id === task.id);
                if (!t) return;
                t.proofs.push({
                  id: newId(),
                  type,
                  value: submittedValue,
                  note: note.trim(),
                  submittedAt: isoNow(),
                });
                t.status = "submitted";
              });
              const adminUser = state.users.find(
                (u) => u.role === "admin" || u.role === "super_admin",
              );
              if (adminUser) {
                notify(
                  adminUser.id,
                  "Proof Submitted",
                  `${me?.fullName} submitted proof for "${task.title}".`,
                  "/tasks",
                );
              }
              log("Task proof submitted", task.title);
              toast.success("Proof submitted successfully.");
              setOpen(false);
              setValue("");
              setNote("");
            }}
          >
            Submit Proof for Review
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditTaskDialog({
  task,
  open,
  onOpenChange,
  teamMembers,
}: {
  task: Task;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamMembers: User[];
}) {
  const { update, log, notify, me } = useApp();
  const [form, setForm] = React.useState({
    title: task.title,
    description: task.description,
    assigneeId: task.assigneeId,
    cadence: task.cadence,
    priority: task.priority,
    dueDate: task.dueDate,
    requiredProof: task.requiredProof,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Task &amp; Assignee</DialogTitle>
          <DialogDescription>
            Update deliverables, change deadlines, or reassign to another team member.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Assignee</Label>
            <Select
              value={form.assigneeId}
              onValueChange={(v) => setForm({ ...form, assigneeId: v })}
            >
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName} ({u.designation})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-t-title" className="text-xs">
              Title
            </Label>
            <Input
              id="edit-t-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-t-desc" className="text-xs">
              Description
            </Label>
            <Textarea
              id="edit-t-desc"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Cadence</Label>
              <Select
                value={form.cadence}
                onValueChange={(v) => setForm({ ...form, cadence: v as TaskCadence })}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CADENCES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {cadenceLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm({ ...form, priority: v as Priority })}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["low", "medium", "high", "urgent"].map((p) => (
                    <SelectItem key={p} value={p}>
                      {titleCase(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-t-due" className="text-xs">
                Due Date
              </Label>
              <Input
                id="edit-t-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Required Proof</Label>
              <Select
                value={form.requiredProof}
                onValueChange={(v) => setForm({ ...form, requiredProof: v as ProofType })}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["any", "image", "file", "link"].map((p) => (
                    <SelectItem key={p} value={p}>
                      {titleCase(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!form.title.trim()}
              onClick={() => {
                const wasReassigned = form.assigneeId !== task.assigneeId;
                update((d) => {
                  const t = d.tasks.find((x) => x.id === task.id);
                  if (!t) return;
                  t.title = form.title.trim();
                  t.description = form.description.trim();
                  t.assigneeId = form.assigneeId;
                  t.cadence = form.cadence;
                  t.priority = form.priority;
                  t.dueDate = form.dueDate;
                  t.requiredProof = form.requiredProof;
                });
                if (wasReassigned && form.assigneeId !== me!.id) {
                  notify(
                    form.assigneeId,
                    "Task Assigned to You",
                    `${me?.fullName} assigned you: "${form.title}"`,
                    "/tasks",
                  );
                }
                log("Task updated", form.title);
                toast.success("Task updated successfully");
                onOpenChange(false);
              }}
            >
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewTaskDialog({
  defaultAssigneeId,
  teamMembers,
  canAssignOthers,
}: {
  defaultAssigneeId: string;
  teamMembers: User[];
  canAssignOthers: boolean;
}) {
  const { me, update, log, notify } = useApp();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    title: "",
    description: "",
    assigneeId: defaultAssigneeId,
    cadence: "today" as TaskCadence,
    priority: "medium" as Priority,
    dueDate: cadenceDueDate("today"),
    requiredProof: "any" as ProofType,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 shadow-sm">
          <Plus className="h-4 w-4" /> New task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {canAssignOthers ? "Create / Assign Task" : "Set a task for yourself"}
          </DialogTitle>
          <DialogDescription>
            {canAssignOthers
              ? "Assign a deliverable to yourself or any team member with defined target date and proof requirement."
              : "Define your deliverable for today, this week, month or quarter."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {canAssignOthers && (
            <div className="space-y-1.5">
              <Label className="text-xs">Assignee</Label>
              <Select
                value={form.assigneeId}
                onValueChange={(v) => setForm({ ...form, assigneeId: v })}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName} {u.id === me!.id ? "(You)" : `(${u.designation})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="t-title" className="text-xs">
              Title
            </Label>
            <Input
              id="t-title"
              value={form.title}
              placeholder="e.g. Complete client onboarding call"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-desc" className="text-xs">
              Description
            </Label>
            <Textarea
              id="t-desc"
              rows={3}
              placeholder="Context, deliverables, and requirements…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="text-xs"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Task type</Label>
              <Select
                value={form.cadence}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    cadence: v as TaskCadence,
                    dueDate: cadenceDueDate(v as TaskCadence),
                  })
                }
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CADENCES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {cadenceLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm({ ...form, priority: v as Priority })}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["low", "medium", "high", "urgent"].map((p) => (
                    <SelectItem key={p} value={p}>
                      {titleCase(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-due" className="text-xs">
                Target date
              </Label>
              <Input
                id="t-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Proof of completion</Label>
              <Select
                value={form.requiredProof}
                onValueChange={(v) => setForm({ ...form, requiredProof: v as ProofType })}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["any", "image", "file", "link"].map((p) => (
                    <SelectItem key={p} value={p}>
                      {titleCase(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            className="w-full mt-2"
            disabled={!form.title.trim()}
            onClick={() => {
              update((d) => {
                d.tasks.unshift({
                  id: newId(),
                  title: form.title,
                  description: form.description,
                  assigneeId: form.assigneeId,
                  assignedById: me!.id,
                  priority: form.priority,
                  status: "assigned",
                  cadence: form.cadence,
                  startDate: dateKey(new Date()),
                  dueDate: form.dueDate,
                  requiredProof: form.requiredProof,
                  proofs: [],
                  comments: [],
                });
              });
              if (form.assigneeId !== me!.id) {
                notify(
                  form.assigneeId,
                  "New Task Assigned",
                  `${me?.fullName} assigned you: "${form.title}"`,
                  "/tasks",
                );
              }
              log("Task created", form.title);
              toast.success("Task added to plan");
              setOpen(false);
              setForm({ ...form, title: "", description: "" });
            }}
          >
            Save task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
