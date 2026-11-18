import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CalendarHeart,
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  Search,
  Sparkles,
  Info,
  CalendarCheck,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { AppShell, EmptyState, PageHeader } from "@/components/app-shell";
import { StatCard, StatusPill } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp, dateKey, newId, isoNow } from "@/lib/store";
import { fmtDate, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CompanyHoliday } from "@/lib/types";

export const Route = createFileRoute("/holidays")({
  head: () => ({
    meta: [
      { title: "Company Holidays — SACE Portal" },
      {
        name: "description",
        content:
          "Official company holidays schedule, observed non-working days, and target hours adjustments.",
      },
      { property: "og:title", content: "Company Holidays — SACE Portal" },
      {
        property: "og:description",
        content: "View and manage SACE Group official company holidays and shift deductions.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <HolidaysPage />
    </AppShell>
  ),
});

function HolidaysPage() {
  const { state, me, can, update, log } = useApp();
  const isAdmin = me?.role === "super_admin" || me?.role === "admin" || can("manage_holidays");

  const todayKey = dateKey(new Date());
  const currentMonthPrefix = todayKey.slice(0, 7);

  const [search, setSearch] = React.useState("");
  const [monthFilter, setMonthFilter] = React.useState<string>("all");
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [editingHoliday, setEditingHoliday] = React.useState<CompanyHoliday | null>(null);
  const [deletingHoliday, setDeletingHoliday] = React.useState<CompanyHoliday | null>(null);

  // Form states
  const [formName, setFormName] = React.useState("");
  const [formDate, setFormDate] = React.useState(todayKey);
  const [formDesc, setFormDesc] = React.useState("");
  const [formMandatory, setFormMandatory] = React.useState(true);

  const holidays = React.useMemo(() => {
    return [...(state.holidays || [])].sort((a, b) => a.date.localeCompare(b.date));
  }, [state.holidays]);

  // Months available in the holiday dataset
  const availableMonths = React.useMemo(() => {
    const set = new Set<string>();
    holidays.forEach((h) => set.add(h.date.slice(0, 7)));
    return Array.from(set).sort();
  }, [holidays]);

  const filteredHolidays = React.useMemo(() => {
    return holidays.filter((h) => {
      const matchesSearch =
        search.trim() === "" ||
        h.name.toLowerCase().includes(search.toLowerCase()) ||
        (h.description || "").toLowerCase().includes(search.toLowerCase());
      const matchesMonth = monthFilter === "all" || h.date.startsWith(monthFilter);
      return matchesSearch && matchesMonth;
    });
  }, [holidays, search, monthFilter]);

  const upcomingHolidays = React.useMemo(() => {
    return holidays.filter((h) => h.date >= todayKey);
  }, [holidays, todayKey]);

  const currentMonthHolidays = React.useMemo(() => {
    return holidays.filter((h) => h.date.startsWith(currentMonthPrefix));
  }, [holidays, currentMonthPrefix]);

  const handleOpenAdd = () => {
    if (!isAdmin) {
      toast.error("Admin access required.");
      return;
    }
    setFormName("");
    setFormDate(todayKey);
    setFormDesc("");
    setFormMandatory(true);
    setEditingHoliday(null);
    setIsAddOpen(true);
  };

  const handleOpenEdit = (h: CompanyHoliday) => {
    if (!isAdmin) {
      toast.error("Admin access required.");
      return;
    }
    setEditingHoliday(h);
    setFormName(h.name);
    setFormDate(h.date);
    setFormDesc(h.description || "");
    setFormMandatory(h.mandatory ?? true);
    setIsAddOpen(true);
  };

  const handleSaveHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error("Admin access required.");
      return;
    }
    if (!formName.trim() || !formDate) {
      toast.error("Please provide a holiday name and date.");
      return;
    }

    if (editingHoliday) {
      update((draft) => {
        const item = (draft.holidays || []).find((h) => h.id === editingHoliday.id);
        if (item) {
          item.name = formName.trim();
          item.date = formDate;
          item.description = formDesc.trim();
          item.mandatory = formMandatory;
        }
      });
      log("holiday_updated", `Updated holiday: ${formName.trim()} (${formDate})`);
      toast.success(`Updated holiday "${formName.trim()}".`);
    } else {
      const newHol: CompanyHoliday = {
        id: newId(),
        name: formName.trim(),
        date: formDate,
        description: formDesc.trim(),
        mandatory: formMandatory,
        createdAt: isoNow(),
        ...(me?.id ? { createdBy: me.id } : {}),
      };
      update((draft) => {
        if (!draft.holidays) draft.holidays = [];
        draft.holidays.push(newHol);
      });
      log("holiday_added", `Added holiday: ${formName.trim()} (${formDate})`);
      toast.success(`Added holiday "${formName.trim()}".`);
    }

    setIsAddOpen(false);
  };

  const handleDeleteHoliday = () => {
    if (!isAdmin) {
      toast.error("Admin access required.");
      return;
    }
    if (!deletingHoliday) return;
    const name = deletingHoliday.name;
    const date = deletingHoliday.date;
    update((draft) => {
      draft.holidays = (draft.holidays || []).filter((h) => h.id !== deletingHoliday.id);
    });
    log("holiday_deleted", `Removed holiday: ${name} (${date})`);
    toast.success(`Holiday "${name}" removed.`);
    setDeletingHoliday(null);
  };

  const handleLoadDefaults = () => {
    if (!isAdmin) {
      toast.error("Admin access required.");
      return;
    }
    const createdByProp = me?.id ? { createdBy: me.id } : {};
    const defaults: CompanyHoliday[] = [
      {
        id: newId(),
        name: "New Year's Day",
        date: "2026-01-01",
        description: "New Year celebration and company recess.",
        mandatory: true,
        createdAt: isoNow(),
        ...createdByProp,
      },
      {
        id: newId(),
        name: "Memorial Day",
        date: "2026-05-25",
        description: "National remembrance observance and paid holiday.",
        mandatory: true,
        createdAt: isoNow(),
        ...createdByProp,
      },
      {
        id: newId(),
        name: "Independence Day (Observed)",
        date: "2026-07-03",
        description: "National holiday observance and workforce office closure.",
        mandatory: true,
        createdAt: isoNow(),
        ...createdByProp,
      },
      {
        id: newId(),
        name: "Labor Day",
        date: "2026-09-07",
        description: "Honoring workforce dedication and employee leadership across SACE.",
        mandatory: true,
        createdAt: isoNow(),
        ...createdByProp,
      },
      {
        id: newId(),
        name: "Thanksgiving Day",
        date: "2026-11-26",
        description: "National Thanksgiving holiday with official office closure.",
        mandatory: true,
        createdAt: isoNow(),
        ...createdByProp,
      },
      {
        id: newId(),
        name: "Day After Thanksgiving",
        date: "2026-11-27",
        description: "Extended holiday weekend for SACE Group workforce.",
        mandatory: true,
        createdAt: isoNow(),
        ...createdByProp,
      },
      {
        id: newId(),
        name: "Christmas Day",
        date: "2026-12-25",
        description: "Annual winter holiday office closure.",
        mandatory: true,
        createdAt: isoNow(),
        ...createdByProp,
      },
    ];

    update((draft) => {
      draft.holidays = defaults;
    });
    log("holidays_reset", "Populated standard 2026 SACE company holidays schedule.");
    toast.success("Standard 2026 SACE company holidays loaded.");
  };

  return (
    <>
      <PageHeader
        title="Company Holidays"
        description={
          isAdmin
            ? "Manage the official company holiday schedule, observed non-working dates, and monthly target working hours deductions."
            : "Review upcoming SACE Group company holidays, observed closures, and automatic target hour credits."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && holidays.length === 0 && (
              <Button variant="outline" size="sm" onClick={handleLoadDefaults} className="gap-1.5">
                <Sparkles className="h-4 w-4 text-brand-gold" /> Load 2026 Holidays
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" onClick={handleOpenAdd} className="gap-1.5 shadow-sm">
                <Plus className="h-4 w-4" /> Add Holiday
              </Button>
            )}
          </div>
        }
      />

      {/* Overview Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <StatCard
          label="Total Holidays"
          value={holidays.length}
          hint="Calendar year 2026"
          icon={CalendarHeart}
          accent="purple"
        />
        <StatCard
          label="Upcoming Holidays"
          value={upcomingHolidays.length}
          hint={
            upcomingHolidays[0]
              ? `Next: ${upcomingHolidays[0].name} (${fmtDate(upcomingHolidays[0].date)})`
              : "No upcoming holidays"
          }
          icon={CalendarCheck}
          accent="teal"
        />
        <StatCard
          label="Current Month"
          value={currentMonthHolidays.length}
          hint={`${currentMonthHolidays.length} non-working day${currentMonthHolidays.length === 1 ? "" : "s"}`}
          icon={CalendarDays}
        />
        <StatCard
          label="Target Hours Credit"
          value={`${currentMonthHolidays.length * 8}h`}
          hint="Deducted from monthly target"
          icon={Clock}
          accent="success"
        />
      </div>

      {/* Info Notice for All Users */}
      <div className="mb-6 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-xs text-muted-foreground flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-start sm:items-center gap-3">
          <div className="rounded-xl bg-amber-500/15 p-2 text-amber-500 shrink-0">
            <Info className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">
              Attendance &amp; Target Hours Policy
            </p>
            <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
              Every company holiday falling on a scheduled workday automatically reduces the
              employee monthly target by <strong>8.0 hours</strong>. Holidays appear with a gold
              badge on the Attendance Calendar and never count as absent or require makeup shifts.
            </p>
          </div>
        </div>
        {isAdmin && (
          <div className="shrink-0">
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Admin Permissions Active
            </span>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <Card className="rounded-2xl mb-6">
        <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search holidays by name or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Filter by Month:
            </span>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-48 text-xs">
                <SelectValue placeholder="All Months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months (2026)</SelectItem>
                {availableMonths.map((m) => {
                  const [y, mo] = m.split("-");
                  const monthName = new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString([], {
                    month: "long",
                    year: "numeric",
                  });
                  return (
                    <SelectItem key={m} value={m}>
                      {monthName}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Holidays List Table */}
      <Card className="rounded-2xl">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarHeart className="h-4 w-4 text-amber-500" />
            Official Holiday Directory ({filteredHolidays.length})
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {filteredHolidays.length} holiday{filteredHolidays.length === 1 ? "" : "s"} shown
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {filteredHolidays.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={CalendarHeart}
                title="No holidays found"
                description={
                  search || monthFilter !== "all"
                    ? "Try adjusting your search query or month filter."
                    : isAdmin
                      ? "No company holidays have been scheduled yet. Click Add Holiday or Load 2026 Holidays to get started."
                      : "No holidays have been scheduled for this period."
                }
                {...(isAdmin
                  ? {
                      action: (
                        <Button size="sm" onClick={handleOpenAdd} className="mt-2 gap-1.5">
                          <Plus className="h-4 w-4" /> Add Holiday
                        </Button>
                      ),
                    }
                  : {})}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3.5">Holiday Name</th>
                    <th className="px-5 py-3.5">Date &amp; Day</th>
                    <th className="px-5 py-3.5">Policy &amp; Hours</th>
                    <th className="px-5 py-3.5">Description</th>
                    <th className="px-5 py-3.5">Status</th>
                    {isAdmin && <th className="px-5 py-3.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredHolidays.map((h) => {
                    const holidayDate = new Date(`${h.date}T00:00:00`);
                    const isPast = h.date < todayKey;
                    const isToday = h.date === todayKey;
                    const dayOfWeek = holidayDate.toLocaleDateString([], { weekday: "long" });

                    return (
                      <tr
                        key={h.id}
                        className={cn(
                          "transition-colors hover:bg-muted/30",
                          isToday && "bg-amber-500/5",
                        )}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500 font-semibold text-xs shrink-0">
                              🎉
                            </span>
                            <div>
                              <p className="font-semibold text-foreground text-xs sm:text-sm">
                                {h.name}
                              </p>
                              {isToday && (
                                <span className="inline-block mt-0.5 text-[10px] font-semibold text-amber-500 uppercase tracking-wider">
                                  Today
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4 text-xs font-medium whitespace-nowrap">
                          <p className="text-foreground font-semibold">{fmtDate(h.date)}</p>
                          <p className="text-[11px] text-muted-foreground">{dayOfWeek}</p>
                        </td>

                        <td className="px-5 py-4 text-xs whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 text-[11px] font-medium text-amber-500">
                            <Clock className="h-3 w-3" /> 8h Target Reduction
                          </span>
                        </td>

                        <td className="px-5 py-4 text-xs text-muted-foreground max-w-xs">
                          {h.description || "Official company holiday observance."}
                        </td>

                        <td className="px-5 py-4 text-xs whitespace-nowrap">
                          {isToday ? (
                            <StatusPill value="holiday" label="Active Today" />
                          ) : isPast ? (
                            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground font-medium">
                              Past Holiday
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-xs text-emerald-500 font-medium">
                              Upcoming
                            </span>
                          )}
                        </td>

                        {isAdmin && (
                          <td className="px-5 py-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => handleOpenEdit(h)}
                                aria-label="Edit holiday"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeletingHoliday(h)}
                                aria-label="Delete holiday"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin Add / Edit Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarHeart className="h-5 w-5 text-amber-500" />
              {editingHoliday ? "Edit Company Holiday" : "Add Company Holiday"}
            </DialogTitle>
            <DialogDescription>
              {editingHoliday
                ? "Update holiday details and observance schedule."
                : "Schedule an official company holiday. Shift hours will be credited automatically for all staff."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveHoliday} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="holiday-name" className="text-xs font-semibold">
                Holiday Name *
              </Label>
              <Input
                id="holiday-name"
                placeholder="e.g. Thanksgiving Day, Independence Day…"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="holiday-date" className="text-xs font-semibold">
                Observance Date *
              </Label>
              <Input
                id="holiday-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="holiday-desc" className="text-xs font-semibold">
                Description (Optional)
              </Label>
              <Textarea
                id="holiday-desc"
                placeholder="Details regarding holiday coverage, emergency contacts, or branch closures…"
                rows={2}
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="holiday-mandatory" className="text-xs font-semibold">
                  Official Workforce Closure
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Deducts 8 hours from employee monthly target shifts.
                </p>
              </div>
              <Switch
                id="holiday-mandatory"
                checked={formMandatory}
                onCheckedChange={setFormMandatory}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                {editingHoliday ? "Save Changes" : "Create Holiday"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Admin Delete Confirmation Alert Dialog */}
      <AlertDialog
        open={!!deletingHoliday}
        onOpenChange={(open) => !open && setDeletingHoliday(null)}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Remove Company Holiday?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>"{deletingHoliday?.name}"</strong> scheduled
              on <strong>{deletingHoliday ? fmtDate(deletingHoliday.date) : ""}</strong>? This will
              restore standard target shift requirements for that date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteHoliday}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Holiday
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
