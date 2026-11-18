import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Inbox,
  KeyRound,
  Lock,
  LockOpen,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, Initials, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/format";
import { isoNow, newId, useApp } from "@/lib/store";
import type { VaultCategory, VaultItem, VaultVisibility } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  MIN_VAULT_PASSWORD_LENGTH,
  decryptVaultPayload,
  encryptVaultPayload,
  generateRandomVaultPassword,
  type VaultSecretPayload,
} from "@/lib/vault-crypto";

export const Route = createFileRoute("/vault")({
  validateSearch: (search: Record<string, unknown>): { check?: string | undefined } => ({
    check: typeof search["check"] === "string" ? search["check"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Encrypted Vault — SACE Portal" },
      {
        name: "description",
        content:
          "Store and share end-to-end encrypted passwords, secrets, credentials, and secure notes across SACE teams.",
      },
      { property: "og:title", content: "Encrypted Vault — SACE Portal" },
      {
        property: "og:description",
        content: "Zero-trust AES-GCM encrypted credential storage and team sharing.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <VaultPage />
    </AppShell>
  ),
});

const VAULT_CATEGORIES: VaultCategory[] = ["Passwords", "Secrets", "Credentials", "Small Text"];

type VaultTab = "all" | "inbox" | "personal" | "sent";

function categoryIcon(category: VaultCategory) {
  switch (category) {
    case "Passwords":
      return KeyRound;
    case "Secrets":
      return ShieldCheck;
    case "Credentials":
      return UserCheck;
    case "Small Text":
      return FileText;
  }
}

function VaultPage() {
  const { state, me, update, notify, log } = useApp();
  const navigate = useNavigate();
  const { check: checkParam } = Route.useSearch();

  const [activeTab, setActiveTab] = React.useState<VaultTab>("all");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState("");

  // In-memory decrypted payloads & transient personal passphrase (cleared on lock/inactivity/logout)
  const [decryptedMap, setDecryptedMap] = React.useState<Record<string, VaultSecretPayload>>({});
  const [personalPassphrase, setPersonalPassphrase] = React.useState<string>("");
  const [createPersonalPassphrase, setCreatePersonalPassphrase] = React.useState<string>("");
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const failedUnlockRef = React.useRef<Record<string, { count: number; lockedUntil: number }>>({});

  // Create / Create & Send Dialog State
  const [createOpen, setCreateOpen] = React.useState(false);
  const [category, setCategory] = React.useState<VaultCategory>("Passwords");
  const [title, setTitle] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [secretValue, setSecretValue] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [visibility, setVisibility] = React.useState<VaultVisibility>("close");
  const [deliveryMode, setDeliveryMode] = React.useState<"personal" | "send">("personal");
  const [recipientId, setRecipientId] = React.useState<string>("");
  const [passwordMode, setPasswordMode] = React.useState<"random" | "custom">("random");
  const [sharePassword, setSharePassword] = React.useState<string>(() =>
    generateRandomVaultPassword(18),
  );
  const [showCreateSecret, setShowCreateSecret] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  // Post-Send Password Copy Reminder Modal
  const [sentSummary, setSentSummary] = React.useState<{
    recipientName: string;
    recipientId: string;
    vaultTitle: string;
    accessPassword: string;
  } | null>(null);

  // Vault Access Modal (Unlock / Check)
  const [unlockTarget, setUnlockTarget] = React.useState<VaultItem | null>(null);
  const [unlockPasswordInput, setUnlockPasswordInput] = React.useState("");
  const [unlockError, setUnlockError] = React.useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = React.useState(false);
  const [inlinePasteBox, setInlinePasteBox] = React.useState("");

  // Share existing personal item dialog
  const [shareExistingItem, setShareExistingItem] = React.useState<VaultItem | null>(null);
  const [existingShareRecipient, setExistingShareRecipient] = React.useState("");
  const [existingPasswordMode, setExistingPasswordMode] = React.useState<"random" | "custom">(
    "random",
  );
  const [existingSharePassword, setExistingSharePassword] = React.useState(() =>
    generateRandomVaultPassword(18),
  );
  const [isSharingExisting, setIsSharingExisting] = React.useState(false);

  // Auto-lock decrypted payloads & transient passphrases after 5 minutes of inactivity or on unmount
  React.useEffect(() => {
    const hasSecrets =
      Object.keys(decryptedMap).length > 0 || Boolean(personalPassphrase) || Boolean(sentSummary);
    if (!hasSecrets) return;
    const timer = window.setTimeout(
      () => {
        setDecryptedMap({});
        setPersonalPassphrase("");
        setCreatePersonalPassphrase("");
        setSentSummary(null);
        setInlinePasteBox("");
        toast.info("Vault auto-locked due to inactivity.");
      },
      5 * 60 * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [decryptedMap, personalPassphrase, sentSummary]);

  React.useEffect(() => {
    return () => {
      setDecryptedMap({});
      setPersonalPassphrase("");
      setCreatePersonalPassphrase("");
      setSentSummary(null);
      setInlinePasteBox("");
    };
  }, []);

  const allVaults = React.useMemo(() => state.vaultItems ?? [], [state.vaultItems]);

  const activeTeammates = React.useMemo(
    () => state.users.filter((u) => u.active && u.id !== me?.id),
    [state.users, me?.id],
  );

  // Accessible vaults: created by me OR sent to me
  const accessibleVaults = React.useMemo(() => {
    if (!me) return [];
    return allVaults
      .filter((v) => v.creatorId === me.id || v.recipientId === me.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [allVaults, me]);

  const inboxVaults = React.useMemo(
    () => accessibleVaults.filter((v) => v.recipientId === me?.id),
    [accessibleVaults, me?.id],
  );
  const personalVaults = React.useMemo(
    () => accessibleVaults.filter((v) => v.creatorId === me?.id && !v.recipientId),
    [accessibleVaults, me?.id],
  );
  const sentVaults = React.useMemo(
    () => accessibleVaults.filter((v) => v.creatorId === me?.id && !!v.recipientId),
    [accessibleVaults, me?.id],
  );

  const uncheckedInboxCount = inboxVaults.filter((v) => !v.checkedByRecipient).length;

  // Handle ?check=<vaultId> navigation from Notification Center
  React.useEffect(() => {
    if (!checkParam || !me) return;
    const target = accessibleVaults.find((v) => v.id === checkParam);
    if (target) {
      setActiveTab("inbox");
      setUnlockTarget(target);
      setUnlockPasswordInput("");
      setUnlockError(null);
      setInlinePasteBox("");
    }
  }, [checkParam, me, accessibleVaults]);

  const filteredVaults = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return accessibleVaults.filter((v) => {
      if (activeTab === "inbox" && v.recipientId !== me?.id) return false;
      if (activeTab === "personal" && !(v.creatorId === me?.id && !v.recipientId)) return false;
      if (activeTab === "sent" && !(v.creatorId === me?.id && !!v.recipientId)) return false;
      if (categoryFilter !== "all" && v.category !== categoryFilter) return false;
      if (!q) return true;
      const sender = state.users.find((u) => u.id === v.creatorId)?.fullName ?? "";
      const recipient = v.recipientId
        ? (state.users.find((u) => u.id === v.recipientId)?.fullName ?? "")
        : "";
      return (
        v.title.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q) ||
        sender.toLowerCase().includes(q) ||
        recipient.toLowerCase().includes(q)
      );
    });
  }, [accessibleVaults, activeTab, categoryFilter, searchQuery, me?.id, state.users]);

  const copyToClipboard = async (text: string, label: string, keyId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(keyId);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => {
        setCopiedId((cur) => (cur === keyId ? null : cur));
      }, 2000);
    } catch {
      toast.error("Unable to access clipboard. Please copy manually.");
    }
  };

  const resetCreateForm = () => {
    setCategory("Passwords");
    setTitle("");
    setUsername("");
    setSecretValue("");
    setNotes("");
    setVisibility("close");
    setDeliveryMode("personal");
    setRecipientId(activeTeammates[0]?.id ?? "");
    setPasswordMode("random");
    setSharePassword(generateRandomVaultPassword(18));
    setCreatePersonalPassphrase(personalPassphrase);
    setShowCreateSecret(false);
  };

  const openCreateModal = (mode: "personal" | "send" = "personal") => {
    resetCreateForm();
    setDeliveryMode(mode);
    if (activeTeammates[0]?.id) {
      setRecipientId(activeTeammates[0].id);
    }
    setCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) return;

    const cleanTitle = title.trim();
    const cleanSecret = secretValue.trim();
    if (!cleanTitle || !cleanSecret) {
      toast.error("Please enter both a title and a password or secret value.");
      return;
    }

    const isSending = deliveryMode === "send";
    if (isSending && !recipientId) {
      toast.error("Please select a team member recipient to send this vault to.");
      return;
    }

    const effectiveKey = isSending ? sharePassword : createPersonalPassphrase || personalPassphrase;
    if (effectiveKey.length < MIN_VAULT_PASSWORD_LENGTH) {
      toast.error(
        `Please enter a vault ${isSending ? "access password" : "master passphrase"} of at least ${MIN_VAULT_PASSWORD_LENGTH} characters.`,
      );
      return;
    }

    setIsSaving(true);
    try {
      const payload: VaultSecretPayload = {
        username: username.trim(),
        secretValue: cleanSecret,
        notes: notes.trim(),
      };

      const encrypted = await encryptVaultPayload(payload, effectiveKey);
      const id = `vault-${newId()}`;

      const item: VaultItem = {
        id,
        title: cleanTitle,
        category,
        creatorId: me.id,
        recipientId: isSending ? recipientId : null,
        visibility: isSending ? "close" : visibility,
        passwordProtected: true,
        encryptedPayload: encrypted.encryptedPayload,
        iv: encrypted.iv,
        salt: encrypted.salt,
        checkedByRecipient: false,
        createdAt: isoNow(),
        unlockedAt: null,
      };

      update((d) => {
        if (!d.vaultItems) d.vaultItems = [];
        d.vaultItems.unshift(item);
      });

      if (isSending) {
        const recipient = state.users.find((u) => u.id === recipientId);
        notify(
          recipientId,
          "Encrypted Vault Received",
          "New vault sent. Check once.",
          `/vault?check=${id}`,
        );
        log(
          "vault_sent",
          `Sent encrypted vault "${cleanTitle}" (${category}) to ${recipient?.fullName ?? recipientId}`,
        );
        setCreateOpen(false);
        setSentSummary({
          recipientName: recipient?.fullName ?? "Recipient",
          recipientId,
          vaultTitle: cleanTitle,
          accessPassword: effectiveKey,
        });
        toast.success(`Encrypted vault sent to ${recipient?.fullName ?? "teammate"}`);
      } else {
        setPersonalPassphrase(effectiveKey);
        if (visibility === "open") {
          setDecryptedMap((prev) => ({ ...prev, [id]: payload }));
        }
        log("vault_created", `Created personal ${category} vault "${cleanTitle}"`);
        setCreateOpen(false);
        toast.success("Vault item encrypted and saved");
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Encryption failed. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDecryptPersonal = async (item: VaultItem) => {
    if (!me) return;
    if (personalPassphrase) {
      const res = await decryptVaultPayload(
        item.encryptedPayload,
        item.iv,
        item.salt,
        personalPassphrase,
      );
      if (res.ok) {
        setDecryptedMap((prev) => ({ ...prev, [item.id]: res.data }));
        toast.success("Vault item decrypted");
        return;
      }
    }
    setUnlockTarget(item);
    setUnlockPasswordInput("");
    setUnlockError(null);
    setInlinePasteBox("");
  };

  const handleMaskItem = (itemId: string) => {
    setDecryptedMap((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    const target = allVaults.find((v) => v.id === itemId);
    if (target && !target.recipientId && target.visibility === "open") {
      update((d) => {
        const found = (d.vaultItems ?? []).find((v) => v.id === itemId);
        if (found) {
          found.visibility = "close";
        }
      });
    }
  };

  const handleLockAll = () => {
    setDecryptedMap({});
    setPersonalPassphrase("");
    setCreatePersonalPassphrase("");
    setInlinePasteBox("");
    setUnlockPasswordInput("");
    setSentSummary(null);
    toast.success("All unlocked secrets cleared from memory.");
  };

  const handleUnlockSharedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockTarget) return;

    const nowMs = Date.now();
    const record = failedUnlockRef.current[unlockTarget.id];
    if (record && record.lockedUntil > nowMs) {
      const waitSec = Math.ceil((record.lockedUntil - nowMs) / 1000);
      setUnlockError(`Too many failed attempts. Wait ${waitSec}s before trying again.`);
      return;
    }

    const candidate = unlockPasswordInput;
    if (!candidate) {
      setUnlockError("Enter the vault access password or passphrase.");
      return;
    }

    setIsUnlocking(true);
    setUnlockError(null);
    const res = await decryptVaultPayload(
      unlockTarget.encryptedPayload,
      unlockTarget.iv,
      unlockTarget.salt,
      candidate,
    );
    setIsUnlocking(false);

    if (!res.ok) {
      const prevCount = record?.count ?? 0;
      const nextCount = prevCount + 1;
      const cooldownMs = nextCount >= 5 ? Math.min(300_000, 15_000 * 2 ** (nextCount - 5)) : 0;
      failedUnlockRef.current[unlockTarget.id] = {
        count: nextCount,
        lockedUntil: cooldownMs ? Date.now() + cooldownMs : 0,
      };
      setUnlockError(
        cooldownMs
          ? `${res.error} Locked for ${Math.ceil(cooldownMs / 1000)}s after ${nextCount} failed attempts.`
          : res.error,
      );
      return;
    }

    delete failedUnlockRef.current[unlockTarget.id];
    if (!unlockTarget.recipientId) {
      setPersonalPassphrase(candidate);
    }
    setDecryptedMap((prev) => ({ ...prev, [unlockTarget.id]: res.data }));
    if (me && unlockTarget.recipientId === me.id && !unlockTarget.checkedByRecipient) {
      update((d) => {
        const found = (d.vaultItems ?? []).find((v) => v.id === unlockTarget.id);
        if (found) {
          found.checkedByRecipient = true;
          found.unlockedAt = isoNow();
        }
        d.notifications.forEach((n) => {
          if (n.userId === me.id && n.href === `/vault?check=${unlockTarget.id}`) {
            n.read = true;
          }
        });
      });
      log("vault_unlocked", `Unlocked shared vault "${unlockTarget.title}"`);
    }
    toast.success("Vault unlocked successfully");
  };

  const handleShareExistingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me || !shareExistingItem) return;
    if (!existingShareRecipient) {
      toast.error("Please select a recipient.");
      return;
    }
    if (existingSharePassword.length < MIN_VAULT_PASSWORD_LENGTH) {
      toast.error(`Access password must be at least ${MIN_VAULT_PASSWORD_LENGTH} characters.`);
      return;
    }

    setIsSharingExisting(true);
    try {
      let plain = decryptedMap[shareExistingItem.id] ?? null;
      if (!plain && personalPassphrase) {
        const dec = await decryptVaultPayload(
          shareExistingItem.encryptedPayload,
          shareExistingItem.iv,
          shareExistingItem.salt,
          personalPassphrase,
        );
        if (dec.ok) {
          plain = dec.data;
        }
      }
      if (!plain) {
        toast.error("Decrypt the source vault item first before re-encrypting to send.");
        setIsSharingExisting(false);
        return;
      }

      const encrypted = await encryptVaultPayload(plain, existingSharePassword);
      const id = `vault-${newId()}`;
      const newShared: VaultItem = {
        id,
        title: shareExistingItem.title,
        category: shareExistingItem.category,
        creatorId: me.id,
        recipientId: existingShareRecipient,
        visibility: "close",
        passwordProtected: true,
        encryptedPayload: encrypted.encryptedPayload,
        iv: encrypted.iv,
        salt: encrypted.salt,
        checkedByRecipient: false,
        createdAt: isoNow(),
        unlockedAt: null,
      };

      const recipient = state.users.find((u) => u.id === existingShareRecipient);
      update((d) => {
        if (!d.vaultItems) d.vaultItems = [];
        d.vaultItems.unshift(newShared);
      });
      notify(
        existingShareRecipient,
        "Encrypted Vault Received",
        "New vault sent. Check once.",
        `/vault?check=${id}`,
      );
      log(
        "vault_sent",
        `Shared encrypted vault "${shareExistingItem.title}" with ${recipient?.fullName ?? existingShareRecipient}`,
      );

      setShareExistingItem(null);
      setSentSummary({
        recipientName: recipient?.fullName ?? "Recipient",
        recipientId: existingShareRecipient,
        vaultTitle: shareExistingItem.title,
        accessPassword: existingSharePassword,
      });
      toast.success(`Encrypted vault sent to ${recipient?.fullName ?? "teammate"}`);
    } finally {
      setIsSharingExisting(false);
    }
  };

  const handleDeleteVault = (item: VaultItem) => {
    update((d) => {
      d.vaultItems = (d.vaultItems ?? []).filter((v) => v.id !== item.id);
    });
    setDecryptedMap((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    log("vault_deleted", `Removed vault item "${item.title}"`);
    toast.success("Vault item deleted");
  };

  if (!me) return null;

  const unlockedModalPayload = unlockTarget ? decryptedMap[unlockTarget.id] : undefined;

  return (
    <>
      <PageHeader
        title="Encrypted Vault"
        description="End-to-end AES-256-GCM encrypted credentials, secrets, and secure notes shared across SACE Workpulse."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(decryptedMap).length > 0 || Boolean(personalPassphrase)) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLockAll}
                className="gap-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400"
              >
                <Lock className="h-4 w-4" /> Lock All
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => openCreateModal("send")}
              className="gap-1.5 border-purple-500/30 hover:border-purple-500/60"
            >
              <Send className="h-4 w-4 text-primary" /> Create & Send
            </Button>
            <Button
              size="sm"
              onClick={() => openCreateModal("personal")}
              className="gap-1.5 bg-gradient-to-r from-[#8A007E] to-purple-700 text-white shadow-sm hover:from-[#730068] hover:to-purple-600"
            >
              <Plus className="h-4 w-4" /> Create Vault
            </Button>
          </div>
        }
      />

      {/* Summary KPI Strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <p className="text-xs text-muted-foreground">Accessible Vaults</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {accessibleVaults.length}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <p className="text-xs text-muted-foreground">Inbox Received</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-2xl font-bold tabular-nums text-foreground">{inboxVaults.length}</p>
            {uncheckedInboxCount > 0 && (
              <span className="text-xs font-semibold text-amber-500 tabular-nums">
                {uncheckedInboxCount} unchecked
              </span>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <p className="text-xs text-muted-foreground">My Personal Vault</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {personalVaults.length}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <p className="text-xs text-muted-foreground">Sent to Team</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {sentVaults.length}
          </p>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as VaultTab)}>
          <TabsList className="grid w-full grid-cols-4 lg:w-auto">
            <TabsTrigger value="all" className="text-xs">
              All ({accessibleVaults.length})
            </TabsTrigger>
            <TabsTrigger value="inbox" className="gap-1.5 text-xs">
              Inbox ({inboxVaults.length})
              {uncheckedInboxCount > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white tabular-nums">
                  {uncheckedInboxCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="personal" className="text-xs">
              My Vault ({personalVaults.length})
            </TabsTrigger>
            <TabsTrigger value="sent" className="text-xs">
              Sent ({sentVaults.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-64 sm:flex-initial">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, category, or member..."
              className="h-9 pl-9 text-xs"
            />
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-44 text-xs" aria-label="Filter by vault category">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {VAULT_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Vault Cards Grid */}
      {filteredVaults.length === 0 ? (
        <EmptyState
          title="No vault items match your view"
          hint="Create an encrypted password, secret, credential, or small text note, or send one securely to a team member."
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredVaults.map((item) => {
            const CatIcon = categoryIcon(item.category);
            const sender = state.users.find((u) => u.id === item.creatorId);
            const recipient = item.recipientId
              ? state.users.find((u) => u.id === item.recipientId)
              : null;
            const isReceived = item.recipientId === me.id;
            const isSentByMe = item.creatorId === me.id && !!item.recipientId;
            const isPersonal = item.creatorId === me.id && !item.recipientId;

            const activePlain = decryptedMap[item.id];
            const isRevealed = !!activePlain;

            return (
              <Card
                key={item.id}
                className="flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-colors hover:border-purple-500/40"
              >
                <div className="h-1 w-full bg-gradient-to-r from-[#8A007E] via-purple-600 to-indigo-500" />
                <CardHeader className="pb-3 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CatIcon className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                        <span>{item.category}</span>
                        <span aria-hidden>·</span>
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck className="h-3 w-3" /> AES-256 Encrypted
                        </span>
                      </div>
                      <CardTitle className="mt-1.5 truncate text-base font-bold text-foreground">
                        {item.title}
                      </CardTitle>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isReceived && !item.checkedByRecipient && (
                        <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                          New
                        </span>
                      )}
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium",
                          isRevealed
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-purple-500/15 text-purple-600 dark:text-purple-300",
                        )}
                      >
                        {isRevealed ? (
                          <>
                            <LockOpen className="h-3 w-3" /> Open
                          </>
                        ) : (
                          <>
                            <Lock className="h-3 w-3" /> Close
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Sender / Recipient Line */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {isReceived ? (
                      <>
                        <span>From {sender?.fullName ?? "Teammate"}</span>
                        <span aria-hidden>·</span>
                        <span>{fmtDateTime(item.createdAt)}</span>
                      </>
                    ) : isSentByMe ? (
                      <>
                        <span>Sent to {recipient?.fullName ?? "Teammate"}</span>
                        <span aria-hidden>·</span>
                        <span>{item.checkedByRecipient ? "Checked" : "Pending check"}</span>
                      </>
                    ) : (
                      <>
                        <span>Personal Vault</span>
                        <span aria-hidden>·</span>
                        <span>{fmtDateTime(item.createdAt)}</span>
                      </>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col justify-between space-y-4 pt-0">
                  {!isRevealed ? (
                    <div className="rounded-xl border border-purple-500/20 bg-muted/40 p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Protected Payload</span>
                        <span className="font-mono text-[11px]">Locked</span>
                      </div>
                      <p className="font-mono text-base font-bold tracking-widest text-foreground/80 select-none">
                        *****
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.passwordProtected
                          ? "Enter the vault access password to decrypt and inspect."
                          : "Masked as ***** (Close mode). Click decrypt to view in clear text."}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-500/25 bg-muted/40 p-3.5 space-y-3">
                      {activePlain.username && (
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-muted-foreground">
                              Username / ID
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(activePlain.username, "Username", `${item.id}-user`)
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                            >
                              {copiedId === `${item.id}-user` ? (
                                <>
                                  <Check className="h-3 w-3" /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" /> Copy
                                </>
                              )}
                            </button>
                          </div>
                          <p className="mt-0.5 font-mono text-xs font-semibold text-foreground break-all">
                            {activePlain.username}
                          </p>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {item.category === "Small Text" ? "Secret Note" : "Secret / Password"}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                activePlain.secretValue,
                                "Secret value",
                                `${item.id}-secret`,
                              )
                            }
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                          >
                            {copiedId === `${item.id}-secret` ? (
                              <>
                                <Check className="h-3 w-3" /> Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" /> Quick Copy
                              </>
                            )}
                          </button>
                        </div>
                        <p className="mt-1 rounded-lg bg-background/80 p-2 font-mono text-xs font-semibold text-foreground break-all whitespace-pre-wrap border border-border/60">
                          {activePlain.secretValue}
                        </p>
                      </div>

                      {activePlain.notes && (
                        <div>
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Notes
                          </span>
                          <p className="mt-0.5 text-xs text-foreground/90 whitespace-pre-wrap">
                            {activePlain.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Card Footer Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                    {!isRevealed ? (
                      item.recipientId ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            setUnlockTarget(item);
                            setUnlockPasswordInput("");
                            setUnlockError(null);
                            setInlinePasteBox("");
                          }}
                          className="gap-1.5 bg-gradient-to-r from-[#8A007E] to-purple-700 text-white hover:from-[#730068] hover:to-purple-600"
                        >
                          <Unlock className="h-3.5 w-3.5" />
                          {isReceived ? "Check" : "Decrypt"}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleDecryptPersonal(item)}
                          className="gap-1.5 border-purple-500/30 hover:border-purple-500/60"
                        >
                          <Eye className="h-3.5 w-3.5 text-primary" /> Decrypt & Reveal
                        </Button>
                      )
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMaskItem(item.id)}
                          className="gap-1 text-xs"
                        >
                          <EyeOff className="h-3.5 w-3.5" /> Hide
                        </Button>
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      {isPersonal && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setShareExistingItem(item);
                            setExistingShareRecipient(activeTeammates[0]?.id ?? "");
                            setExistingPasswordMode("random");
                            setExistingSharePassword(generateRandomVaultPassword(18));
                          }}
                          className="h-8 px-2.5 text-xs gap-1 text-primary"
                          title="Encrypt and send to a team member"
                        >
                          <Send className="h-3.5 w-3.5" /> Send
                        </Button>
                      )}
                      {item.creatorId === me.id && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteVault(item)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          aria-label={`Delete ${item.title}`}
                          title="Delete vault item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Create & Send Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-2xl sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              {deliveryMode === "send"
                ? "Create & Send Encrypted Vault"
                : "Create Encrypted Vault Item"}
            </DialogTitle>
            <DialogDescription>
              All credentials and text are encrypted client-side with AES-256-GCM before storage or
              delivery.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 pt-1">
            {/* Delivery Mode Switch */}
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => setDeliveryMode("personal")}
                className={cn(
                  "rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                  deliveryMode === "personal"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Save to My Vault
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMode("send")}
                className={cn(
                  "rounded-lg px-3 py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5",
                  deliveryMode === "send"
                    ? "bg-gradient-to-r from-[#8A007E] to-purple-700 text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Send className="h-3.5 w-3.5" /> Create & Send
              </button>
            </div>

            {/* Category & Visibility */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as VaultCategory)}>
                  <SelectTrigger className="h-9 text-xs" aria-label="Vault category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {VAULT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Initial Visibility</Label>
                {deliveryMode === "send" ? (
                  <div className="flex h-9 items-center gap-2 rounded-md border border-purple-500/30 bg-purple-500/10 px-3 text-xs text-purple-600 dark:text-purple-300">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span>Always Close (*****) until unlocked</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-input bg-muted/30 p-1">
                    <button
                      type="button"
                      onClick={() => setVisibility("close")}
                      className={cn(
                        "flex items-center justify-center gap-1 rounded-md py-1 text-xs font-medium transition-colors",
                        visibility === "close"
                          ? "bg-card text-foreground shadow-xs font-semibold"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <EyeOff className="h-3 w-3" /> Close (*****)
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibility("open")}
                      className={cn(
                        "flex items-center justify-center gap-1 rounded-md py-1 text-xs font-medium transition-colors",
                        visibility === "open"
                          ? "bg-card text-foreground shadow-xs font-semibold"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Eye className="h-3 w-3" /> Open
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Production AWS Root Key, CRM Admin Portal, API Secret"
                className="text-xs"
                required
              />
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Username / Account Identifier{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin@sacegroup.com or key_id_prod"
                className="text-xs font-mono"
              />
            </div>

            {/* Secret / Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">
                  {category === "Small Text" ? "Encrypted Text Content" : "Password / Secret Value"}
                </Label>
                {category !== "Small Text" && (
                  <button
                    type="button"
                    onClick={() => setShowCreateSecret((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    {showCreateSecret ? (
                      <>
                        <EyeOff className="h-3 w-3" /> Mask input
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3" /> Show input
                      </>
                    )}
                  </button>
                )}
              </div>
              {category === "Small Text" ? (
                <Textarea
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  placeholder="Enter sensitive note, recovery codes, or confidential instructions..."
                  rows={3}
                  className="text-xs font-mono resize-none"
                  required
                />
              ) : (
                <Input
                  type={showCreateSecret ? "text" : "password"}
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  placeholder="Enter password, token, or API secret..."
                  className="text-xs font-mono"
                  required
                />
              )}
            </div>

            {/* Optional Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Context, environment URL, or usage guidelines..."
                rows={2}
                className="text-xs resize-none"
              />
            </div>

            {/* Personal Vault Master Passphrase (when saving to personal vault) */}
            {deliveryMode === "personal" && (
              <div className="space-y-1.5 rounded-xl border border-purple-500/25 bg-purple-500/5 p-3.5">
                <Label className="text-xs font-semibold">
                  Personal Vault Master Passphrase (min {MIN_VAULT_PASSWORD_LENGTH} characters)
                </Label>
                <Input
                  type="password"
                  value={createPersonalPassphrase}
                  onChange={(e) => setCreatePersonalPassphrase(e.target.value)}
                  placeholder="Enter a private passphrase to derive your encryption key..."
                  className="h-9 font-mono text-xs"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Derived solely in memory using PBKDF2-SHA256 (600,000 iterations). Never stored or
                  transmitted.
                </p>
              </div>
            )}

            {/* Recipient & Access Password Generator (for Create & Send) */}
            {deliveryMode === "send" && (
              <div className="space-y-4 rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Recipient Team Member</Label>
                  <Select value={recipientId} onValueChange={setRecipientId}>
                    <SelectTrigger className="h-9 text-xs" aria-label="Select vault recipient">
                      <SelectValue placeholder="Choose active team member..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activeTeammates.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.fullName} · {u.department} ({u.designation})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Vault Unlocking Password</Label>
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-background/60 p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setPasswordMode("random");
                        setSharePassword(generateRandomVaultPassword(16));
                      }}
                      className={cn(
                        "rounded-md py-1.5 text-xs font-medium transition-colors",
                        passwordMode === "random"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Create Random Password
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPasswordMode("custom");
                        setSharePassword("");
                      }}
                      className={cn(
                        "rounded-md py-1.5 text-xs font-medium transition-colors",
                        passwordMode === "custom"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Custom Password
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      value={sharePassword}
                      onChange={(e) => setSharePassword(e.target.value)}
                      readOnly={passwordMode === "random"}
                      placeholder={
                        passwordMode === "random"
                          ? "Auto-generated strong password"
                          : "Enter custom vault access password..."
                      }
                      className="h-9 flex-1 font-mono text-xs"
                    />
                    {passwordMode === "random" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={() => setSharePassword(generateRandomVaultPassword(16))}
                        title="Regenerate random password"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!sharePassword.trim()}
                      onClick={() =>
                        void copyToClipboard(
                          sharePassword.trim(),
                          "Vault access password",
                          "create-share-pw",
                        )
                      }
                      className="h-9 gap-1 px-3 text-xs shrink-0"
                    >
                      {copiedId === "create-share-pw" ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-500" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Copy this password and share it securely with the recipient. They will need it
                    to unlock the vault.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="gap-1.5 bg-gradient-to-r from-[#8A007E] to-purple-700 text-white hover:from-[#730068] hover:to-purple-600"
              >
                {deliveryMode === "send" ? (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    {isSaving ? "Encrypting & Sending…" : "Create & Send"}
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" />
                    {isSaving ? "Encrypting…" : "Save to Vault"}
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Post-Send Access Password Summary Modal */}
      <Dialog open={!!sentSummary} onOpenChange={(o) => !o && setSentSummary(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-500" /> Vault Encrypted & Sent
            </DialogTitle>
            <DialogDescription>
              {sentSummary?.recipientName} received a notification:{" "}
              <span className="font-medium text-foreground">"New vault sent. Check once."</span>
            </DialogDescription>
          </DialogHeader>

          {sentSummary && (
            <div className="space-y-4 pt-1">
              <div className="rounded-xl border border-purple-500/25 bg-muted/40 p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Vault Access Password for "{sentSummary.vaultTitle}"
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs font-bold text-foreground break-all">
                    {sentSummary.accessPassword}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void copyToClipboard(
                        sentSummary.accessPassword,
                        "Vault access password",
                        "sent-summary-pw",
                      )
                    }
                    className="gap-1 shrink-0"
                  >
                    {copiedId === "sent-summary-pw" ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-500" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  For end-to-end security, this unlocking password is not stored in the database or
                  sent via CRM chat. Share it with {sentSummary.recipientName} over a separate
                  trusted channel.
                </p>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" onClick={() => setSentSummary(null)}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Vault Access Modal (Unlock Flow) */}
      <Dialog
        open={!!unlockTarget}
        onOpenChange={(open) => {
          if (!open) {
            if (unlockTarget) {
              setDecryptedMap((prev) => {
                const next = { ...prev };
                delete next[unlockTarget.id];
                return next;
              });
            }
            setUnlockTarget(null);
            setUnlockPasswordInput("");
            setUnlockError(null);
            setInlinePasteBox("");
            if (checkParam) {
              void navigate({ to: "/vault", search: { check: undefined }, replace: true });
            }
          }
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {unlockedModalPayload ? (
                <Unlock className="h-5 w-5 text-emerald-500" />
              ) : (
                <KeyRound className="h-5 w-5 text-primary" />
              )}
              {unlockedModalPayload ? "Vault Unlocked" : "Unlock Encrypted Vault"}
            </DialogTitle>
            <DialogDescription>
              {unlockTarget ? (
                <span>
                  {unlockTarget.title} · {unlockTarget.category} · From{" "}
                  {state.users.find((u) => u.id === unlockTarget.creatorId)?.fullName ??
                    "Team Member"}
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {unlockTarget && !unlockedModalPayload ? (
            <form onSubmit={handleUnlockSharedSubmit} className="space-y-4 pt-1">
              <div className="rounded-xl border border-purple-500/25 bg-muted/40 p-4">
                <div className="flex items-center gap-3">
                  <Initials
                    name={
                      state.users.find((u) => u.id === unlockTarget.creatorId)?.fullName ?? "User"
                    }
                    color={state.users.find((u) => u.id === unlockTarget.creatorId)?.avatarColor}
                    size={36}
                  />
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      Password verification required
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Enter the vault access password created by the sender to decrypt the payload.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Vault Access Password</Label>
                <Input
                  type="password"
                  value={unlockPasswordInput}
                  onChange={(e) => {
                    setUnlockPasswordInput(e.target.value);
                    if (unlockError) setUnlockError(null);
                  }}
                  placeholder="Enter vault access password..."
                  className="font-mono text-xs"
                  autoFocus
                  required
                />
                {unlockError && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-destructive pt-1">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                    {unlockError}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setUnlockTarget(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isUnlocking}
                  className="gap-1.5 bg-gradient-to-r from-[#8A007E] to-purple-700 text-white hover:from-[#730068] hover:to-purple-600"
                >
                  <Unlock className="h-3.5 w-3.5" />
                  {isUnlocking ? "Decrypting…" : "Unlock Vault"}
                </Button>
              </div>
            </form>
          ) : unlockTarget && unlockedModalPayload ? (
            <div className="space-y-4 pt-1">
              <div className="rounded-xl border border-emerald-500/30 bg-muted/40 p-4 space-y-3">
                {unlockedModalPayload.username && (
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Username / Account
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] gap-1 text-primary"
                        onClick={() =>
                          void copyToClipboard(
                            unlockedModalPayload.username,
                            "Username",
                            "modal-copy-user",
                          )
                        }
                      >
                        {copiedId === "modal-copy-user" ? (
                          <>
                            <Check className="h-3 w-3" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> Copy
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="mt-0.5 font-mono text-xs font-semibold text-foreground break-all">
                      {unlockedModalPayload.username}
                    </p>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {unlockTarget.category === "Small Text"
                        ? "Decrypted Text"
                        : "Decrypted Password / Secret"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px] gap-1 text-primary"
                      onClick={() => {
                        void copyToClipboard(
                          unlockedModalPayload.secretValue,
                          "Decrypted value",
                          "modal-copy-secret",
                        );
                        setInlinePasteBox(unlockedModalPayload.secretValue);
                      }}
                    >
                      {copiedId === "modal-copy-secret" ? (
                        <>
                          <Check className="h-3 w-3" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Quick-Copy & Paste
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="mt-1 rounded-lg border border-border bg-background p-2.5 font-mono text-xs font-bold text-foreground break-all whitespace-pre-wrap">
                    {unlockedModalPayload.secretValue}
                  </p>
                </div>

                {unlockedModalPayload.notes && (
                  <div>
                    <span className="text-[11px] font-medium text-muted-foreground">Notes</span>
                    <p className="mt-0.5 text-xs text-foreground/90 whitespace-pre-wrap">
                      {unlockedModalPayload.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Local Quick-Paste Scratchpad (ephemeral, never persisted) */}
              <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Temporary Copy / Verify Box</Label>
                  <button
                    type="button"
                    onClick={() => setInlinePasteBox(unlockedModalPayload.secretValue)}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Insert unlocked value
                  </button>
                </div>
                <Input
                  value={inlinePasteBox}
                  onChange={(e) => setInlinePasteBox(e.target.value)}
                  placeholder="Ephemeral local box (clears automatically on close)..."
                  className="h-9 font-mono text-xs"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      if (unlockTarget) {
                        setDecryptedMap((prev) => {
                          const next = { ...prev };
                          delete next[unlockTarget.id];
                          return next;
                        });
                      }
                      setInlinePasteBox("");
                      setUnlockTarget(null);
                    }}
                  >
                    Lock & Close
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Share Existing Personal Vault Modal */}
      <Dialog
        open={!!shareExistingItem}
        onOpenChange={(open) => !open && setShareExistingItem(null)}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Inbox className="h-5 w-5 text-primary" /> Send Encrypted Vault
            </DialogTitle>
            <DialogDescription>
              Re-encrypt "{shareExistingItem?.title}" with a dedicated access password and send to a
              team member.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleShareExistingSubmit} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Recipient</Label>
              <Select value={existingShareRecipient} onValueChange={setExistingShareRecipient}>
                <SelectTrigger className="h-9 text-xs" aria-label="Select recipient">
                  <SelectValue placeholder="Choose active team member..." />
                </SelectTrigger>
                <SelectContent>
                  {activeTeammates.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName} · {u.department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Vault Access Password</Label>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setExistingPasswordMode("random");
                    setExistingSharePassword(generateRandomVaultPassword(16));
                  }}
                  className={cn(
                    "rounded-md py-1.5 text-xs font-medium transition-colors",
                    existingPasswordMode === "random"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Create Random Password
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExistingPasswordMode("custom");
                    setExistingSharePassword("");
                  }}
                  className={cn(
                    "rounded-md py-1.5 text-xs font-medium transition-colors",
                    existingPasswordMode === "custom"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Custom Password
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  value={existingSharePassword}
                  onChange={(e) => setExistingSharePassword(e.target.value)}
                  readOnly={existingPasswordMode === "random"}
                  placeholder="Vault unlocking password..."
                  className="h-9 flex-1 font-mono text-xs"
                />
                {existingPasswordMode === "random" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => setExistingSharePassword(generateRandomVaultPassword(16))}
                    title="Regenerate random password"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!existingSharePassword.trim()}
                  onClick={() =>
                    void copyToClipboard(
                      existingSharePassword.trim(),
                      "Vault access password",
                      "existing-share-pw",
                    )
                  }
                  className="h-9 gap-1 px-3 text-xs shrink-0"
                >
                  {copiedId === "existing-share-pw" ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-500" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setShareExistingItem(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSharingExisting}
                className="gap-1.5 bg-gradient-to-r from-[#8A007E] to-purple-700 text-white hover:from-[#730068] hover:to-purple-600"
              >
                <Send className="h-3.5 w-3.5" />
                {isSharingExisting ? "Encrypting…" : "Encrypt & Send"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
