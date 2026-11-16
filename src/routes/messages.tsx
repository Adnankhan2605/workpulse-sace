import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  CheckCheck,
  Hash,
  Inbox,
  Megaphone,
  MessageSquare,
  MessageSquarePlus,
  Plus,
  Search,
  Send,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { AppShell, EmptyState, Initials, PageHeader, roleLabel } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useApp, newId, isoNow, dateKey } from "@/lib/store";
import { fmtDate, fmtTime } from "@/lib/format";
import type { Conversation, Message, User } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Inbox & Messages — SACE Portal" },
      {
        name: "description",
        content:
          "Team inbox, direct messages, project channels, and company announcements for SACE.",
      },
      { property: "og:title", content: "Inbox & Messages — SACE Portal" },
      {
        property: "og:description",
        content: "Chat with teammates, join departmental channels, and read company announcements.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <MessagesPage />
    </AppShell>
  ),
});

type InboxFilterTab = "all" | "direct" | "channel" | "announcement";

function formatMessageTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    return fmtTime(iso);
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) {
    return "Yesterday";
  }

  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return "Yesterday";

  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function MessagesPage() {
  const { state, me, update, notify, log } = useApp();
  const isAdmin = me?.role === "super_admin" || me?.role === "admin";

  const [activeTab, setActiveTab] = React.useState<InboxFilterTab>("all");
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [convoSearch, setConvoSearch] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  // Dialogs
  const [newChatOpen, setNewChatOpen] = React.useState(false);
  const [newGroupOpen, setNewGroupOpen] = React.useState(false);
  const [newAnnouncementOpen, setNewAnnouncementOpen] = React.useState(false);
  const [membersListOpen, setMembersListOpen] = React.useState(false);
  const [addMemberOpen, setAddMemberOpen] = React.useState(false);

  // Forms
  const [groupName, setGroupName] = React.useState("");
  const [groupTopic, setGroupTopic] = React.useState("");
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = React.useState<string[]>([]);
  const [announcementTitle, setAnnouncementTitle] = React.useState("");
  const [announcementBody, setAnnouncementBody] = React.useState("");
  const [memberToAdd, setMemberToAdd] = React.useState("");

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Ensure initial channels exist if empty
  React.useEffect(() => {
    if (state.conversations.length === 0) {
      update((d) => {
        d.conversations.push(
          {
            id: "c-announcements",
            name: "Company Announcements",
            kind: "announcement",
            participantIds: state.users.map((u) => u.id),
          },
          {
            id: "c-general",
            name: "general-chat",
            kind: "group",
            participantIds: state.users.map((u) => u.id),
          },
        );
        d.messages.push({
          id: newId(),
          conversationId: "c-announcements",
          senderId: state.users[0]?.id ?? "u-hakeem",
          body: "Welcome to SACE Team Inbox & Messaging! Keep track of all departmental channels and direct messages right here.",
          at: isoNow(),
          readBy: [state.users[0]?.id ?? "u-hakeem"],
        });
      });
    }
  }, [state.conversations.length, state.users, update]);

  // All accessible conversations for current user
  const mine = React.useMemo(() => {
    if (!me) return [];
    return state.conversations.filter(
      (c) => c.participantIds.includes(me.id) || c.kind === "announcement" || c.kind === "group",
    );
  }, [state.conversations, me]);

  // Calculations for last message, unread count & sorting
  const conversationStats = React.useMemo(() => {
    const map = new Map<
      string,
      {
        lastMessage: Message | null;
        unreadCount: number;
      }
    >();

    mine.forEach((c) => {
      const convMessages = state.messages
        .filter((m) => m.conversationId === c.id)
        .sort((a, b) => a.at.localeCompare(b.at));
      const last = convMessages[convMessages.length - 1] ?? null;
      const unread = convMessages.filter((m) => me && !m.readBy?.includes(me.id)).length;
      map.set(c.id, {
        lastMessage: last,
        unreadCount: unread,
      });
    });

    return map;
  }, [mine, state.messages, me]);

  // Counts for tabs
  const tabCounts = React.useMemo(() => {
    let totalUnread = 0;
    let directUnread = 0;
    let channelUnread = 0;
    let announcementUnread = 0;

    mine.forEach((c) => {
      const stat = conversationStats.get(c.id);
      const unread = stat?.unreadCount ?? 0;
      totalUnread += unread;
      if (c.kind === "direct") directUnread += unread;
      else if (c.kind === "group") channelUnread += unread;
      else if (c.kind === "announcement") announcementUnread += unread;
    });

    return { totalUnread, directUnread, channelUnread, announcementUnread };
  }, [mine, conversationStats]);

  // Filtered and sorted conversations
  const filteredConversations = React.useMemo(() => {
    return mine
      .filter((c) => {
        // Tab filter
        if (activeTab === "direct" && c.kind !== "direct") return false;
        if (activeTab === "channel" && c.kind !== "group") return false;
        if (activeTab === "announcement" && c.kind !== "announcement") return false;

        // Unread filter
        const stat = conversationStats.get(c.id);
        if (unreadOnly && (!stat || stat.unreadCount === 0)) return false;

        // Search query
        if (convoSearch.trim()) {
          const q = convoSearch.toLowerCase();
          const matchesName = c.name.toLowerCase().includes(q);
          const otherId = c.participantIds.find((id) => id !== me?.id);
          const otherUser = otherId ? state.users.find((u) => u.id === otherId) : null;
          const matchesUser =
            otherUser?.fullName.toLowerCase().includes(q) ||
            otherUser?.designation.toLowerCase().includes(q) ||
            otherUser?.department.toLowerCase().includes(q);
          const matchesLastMsg = stat?.lastMessage?.body.toLowerCase().includes(q);

          if (!matchesName && !matchesUser && !matchesLastMsg) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const timeA = conversationStats.get(a.id)?.lastMessage?.at ?? "";
        const timeB = conversationStats.get(b.id)?.lastMessage?.at ?? "";
        return timeB.localeCompare(timeA);
      });
  }, [mine, activeTab, unreadOnly, convoSearch, conversationStats, me, state.users]);

  // Ensure activeId is valid
  React.useEffect(() => {
    if (
      filteredConversations.length > 0 &&
      (!activeId || !filteredConversations.some((c) => c.id === activeId))
    ) {
      setActiveId(filteredConversations[0].id);
    }
  }, [filteredConversations, activeId]);

  const active = state.conversations.find((c) => c.id === activeId) ?? null;

  // Active thread
  const thread = React.useMemo(() => {
    if (!active) return [];
    return state.messages
      .filter((m) => m.conversationId === active.id)
      .sort((a, b) => a.at.localeCompare(b.at));
  }, [state.messages, active]);

  // Auto-scroll on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length, activeId]);

  // Auto-mark conversation as read when active
  React.useEffect(() => {
    if (!active || !me) return;
    const unreadMessages = state.messages.filter(
      (m) => m.conversationId === active.id && !m.readBy?.includes(me.id),
    );
    if (unreadMessages.length > 0) {
      update((d) => {
        d.messages.forEach((m) => {
          if (m.conversationId === active.id && !m.readBy?.includes(me.id)) {
            m.readBy = [...(m.readBy || []), me.id];
          }
        });
      });
    }
  }, [active, me, thread.length, update, state.messages]);

  const handleMarkAllAsRead = React.useCallback(() => {
    if (!me) return;
    update((d) => {
      d.messages.forEach((m) => {
        if (!m.readBy) m.readBy = [];
        if (!m.readBy.includes(me.id)) {
          m.readBy.push(me.id);
        }
      });
      d.notifications.forEach((n) => {
        if (n.userId === me.id && n.href?.startsWith("/messages")) {
          n.read = true;
        }
      });
    });
    toast.success("All messages marked as read");
  }, [me, update]);

  // Group messages by date
  const messageGroups = React.useMemo(() => {
    const groups: Array<{ dateHeader: string; messages: Message[] }> = [];
    let currentHeader = "";
    let currentList: Message[] = [];

    thread.forEach((msg) => {
      const header = formatDateHeader(msg.at);
      if (header !== currentHeader) {
        if (currentList.length > 0) {
          groups.push({ dateHeader: currentHeader, messages: currentList });
        }
        currentHeader = header;
        currentList = [msg];
      } else {
        currentList.push(msg);
      }
    });

    if (currentList.length > 0) {
      groups.push({ dateHeader: currentHeader, messages: currentList });
    }

    return groups;
  }, [thread]);

  if (!me) return null;

  const todayKey = dateKey(new Date());

  // Determine other participant for 1:1 direct chat
  const otherParticipantId = active?.participantIds.find((id) => id !== me.id);
  const otherParticipant =
    active?.kind === "direct" && otherParticipantId
      ? state.users.find((u) => u.id === otherParticipantId)
      : null;

  const isOtherPunchedIn = otherParticipant
    ? state.attendance.some(
        (a) => a.userId === otherParticipant.id && a.date === todayKey && a.punchIn && !a.punchOut,
      )
    : false;

  // Participants of the active channel/group
  const activeParticipants = (active?.participantIds || [])
    .map((pid) => state.users.find((u) => u.id === pid))
    .filter((u): u is User => !!u);

  const handleSendMessage = () => {
    if (!draft.trim() || !active) return;
    const body = draft.trim();
    setDraft("");

    const newMsgId = newId();
    update((d) => {
      d.messages.push({
        id: newMsgId,
        conversationId: active.id,
        senderId: me.id,
        body,
        at: isoNow(),
        readBy: [me.id],
      });
    });

    // Notify other participants in direct or channel
    active.participantIds.forEach((pid) => {
      if (pid !== me.id) {
        notify(
          pid,
          active.kind === "direct"
            ? `New message from ${me.fullName}`
            : `New message in #${active.name}`,
          body.length > 60 ? `${body.substring(0, 57)}…` : body,
          "/messages",
        );
      }
    });
  };

  const handleStartDirectChat = (targetUser: User) => {
    // Check if 1:1 direct chat already exists
    const existing = state.conversations.find(
      (c) =>
        c.kind === "direct" &&
        c.participantIds.length === 2 &&
        c.participantIds.includes(me.id) &&
        c.participantIds.includes(targetUser.id),
    );

    if (existing) {
      setActiveId(existing.id);
      setNewChatOpen(false);
      return;
    }

    // Create new direct conversation
    const newConvId = newId();
    const newConv: Conversation = {
      id: newConvId,
      name: targetUser.fullName,
      kind: "direct",
      participantIds: [me.id, targetUser.id],
    };

    update((d) => {
      d.conversations.unshift(newConv);
    });

    setActiveId(newConvId);
    setNewChatOpen(false);
    toast.success(`Direct conversation started with ${targetUser.fullName}`);
  };

  const handleCreateGroupChannel = () => {
    if (!groupName.trim()) return;
    const newConvId = newId();
    const channelCleanName = groupName.trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-");
    const participants = Array.from(new Set([me.id, ...selectedGroupMemberIds]));

    const newConv: Conversation = {
      id: newConvId,
      name: channelCleanName,
      kind: "group",
      participantIds: participants,
    };

    update((d) => {
      d.conversations.unshift(newConv);
      d.messages.push({
        id: newId(),
        conversationId: newConvId,
        senderId: me.id,
        body: groupTopic.trim()
          ? `🎉 Channel created. Topic: ${groupTopic.trim()}`
          : `🎉 Channel #${channelCleanName} created by ${me.fullName}. Welcome!`,
        at: isoNow(),
        readBy: [me.id],
      });
    });

    participants.forEach((pid) => {
      if (pid !== me.id) {
        notify(
          pid,
          `Invited to #${channelCleanName}`,
          `${me.fullName} added you to the #${channelCleanName} team channel.`,
          "/messages",
        );
      }
    });

    log("channel_created", `Created channel #${channelCleanName}`);
    setActiveId(newConvId);
    setNewGroupOpen(false);
    setGroupName("");
    setGroupTopic("");
    setSelectedGroupMemberIds([]);
    toast.success(`Channel #${channelCleanName} created`);
  };

  const handleCreateAnnouncement = () => {
    if (!announcementTitle.trim() || !announcementBody.trim()) return;
    const newConvId = newId();
    const allUserIds = state.users.filter((u) => u.active).map((u) => u.id);

    const newConv: Conversation = {
      id: newConvId,
      name: `📢 ${announcementTitle.trim()}`,
      kind: "announcement",
      participantIds: allUserIds,
    };

    update((d) => {
      d.conversations.unshift(newConv);
      d.messages.push({
        id: newId(),
        conversationId: newConvId,
        senderId: me.id,
        body: announcementBody.trim(),
        at: isoNow(),
        readBy: [me.id],
      });
    });

    // Notify all active users
    allUserIds.forEach((uid) => {
      if (uid !== me.id) {
        notify(
          uid,
          `Announcement: ${announcementTitle.trim()}`,
          announcementBody.trim().substring(0, 80),
          "/messages",
        );
      }
    });

    log("announcement_posted", announcementTitle.trim());
    setActiveId(newConvId);
    setNewAnnouncementOpen(false);
    setAnnouncementTitle("");
    setAnnouncementBody("");
    toast.success("Official company announcement published");
  };

  const handleAddMemberToChannel = () => {
    if (!active || !memberToAdd) return;
    const targetUser = state.users.find((u) => u.id === memberToAdd);
    if (!targetUser) return;

    if (active.participantIds.includes(memberToAdd)) {
      toast.error(`${targetUser.fullName} is already in this channel`);
      return;
    }

    update((d) => {
      const conv = d.conversations.find((c) => c.id === active.id);
      if (conv) {
        conv.participantIds.push(memberToAdd);
      }
      d.messages.push({
        id: newId(),
        conversationId: active.id,
        senderId: me.id,
        body: `${targetUser.fullName} was added to the channel by ${me.fullName}.`,
        at: isoNow(),
        readBy: [me.id],
      });
    });

    notify(
      memberToAdd,
      `Added to channel #${active.name}`,
      `${me.fullName} added you to #${active.name}`,
      "/messages",
    );

    setMemberToAdd("");
    setAddMemberOpen(false);
    toast.success(`${targetUser.fullName} added to channel`);
  };

  const handleMarkAllRead = () => {
    update((d) => {
      d.messages.forEach((m) => {
        if (!m.readBy?.includes(me.id)) {
          m.readBy = [...(m.readBy || []), me.id];
        }
      });
    });
    toast.success("All messages marked as read");
  };

  return (
    <>
      <PageHeader
        title="Inbox & Communication"
        description="Connect in real time with direct chats, project channels, and company-wide announcements."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {tabCounts.totalUnread > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleMarkAllRead}
                className="gap-1.5 text-xs"
              >
                <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" /> Mark All Read
              </Button>
            )}

            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNewAnnouncementOpen(true)}
                className="gap-1.5 text-xs shadow-xs"
              >
                <Megaphone className="h-3.5 w-3.5 text-amber-500" /> New Announcement
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => setNewGroupOpen(true)}
              className="gap-1.5 text-xs shadow-xs"
            >
              <Hash className="h-3.5 w-3.5 text-primary" /> New Channel
            </Button>

            <Button
              size="sm"
              onClick={() => setNewChatOpen(true)}
              className="gap-1.5 text-xs shadow-xs"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" /> Direct Chat
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Left Inbox Sidebar */}
        <Card className="flex h-[76vh] flex-col rounded-2xl border-border shadow-xs overflow-hidden">
          {/* Inbox Header & Tabs */}
          <div className="border-b border-border bg-card/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Inbox</h3>
              </div>
              <div className="flex items-center gap-2">
                {tabCounts.totalUnread > 0 && (
                  <>
                    <Badge
                      variant="default"
                      className="h-5 px-2 text-[10px] font-semibold bg-rose-500 text-white"
                    >
                      {tabCounts.totalUnread} new
                    </Badge>
                    <button
                      type="button"
                      onClick={handleMarkAllAsRead}
                      className="text-[11px] font-medium text-primary hover:underline transition-colors"
                    >
                      Mark all read
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Category Tabs */}
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as InboxFilterTab)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-4 w-full h-8 p-0.5 bg-muted/60">
                <TabsTrigger value="all" className="text-[11px] py-1">
                  All
                </TabsTrigger>
                <TabsTrigger value="direct" className="text-[11px] py-1 flex items-center gap-1">
                  Direct
                  {tabCounts.directUnread > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="channel" className="text-[11px] py-1 flex items-center gap-1">
                  Channels
                  {tabCounts.channelUnread > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="announcement"
                  className="text-[11px] py-1 flex items-center gap-1"
                >
                  Announce
                  {tabCounts.announcementUnread > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Search & Unread filter */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8 pl-8 text-xs bg-muted/30"
                  placeholder="Search inbox or messages…"
                  value={convoSearch}
                  onChange={(e) => setConvoSearch(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                variant={unreadOnly ? "default" : "outline"}
                className={cn(
                  "h-8 px-2 text-[11px] shrink-0 gap-1",
                  unreadOnly && "bg-primary text-primary-foreground",
                )}
                onClick={() => setUnreadOnly(!unreadOnly)}
                title="Filter by unread messages"
              >
                <Bell className="h-3 w-3" />
                Unread
              </Button>
            </div>
          </div>

          {/* Conversations List */}
          <CardContent className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredConversations.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-center p-4">
                <p className="text-xs font-semibold text-foreground">No conversations found</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {unreadOnly
                    ? "You're all caught up! No unread messages."
                    : convoSearch
                      ? "No chats matched your search term."
                      : "Start a 1:1 chat or join a channel."}
                </p>
                {!convoSearch && !unreadOnly && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 text-xs gap-1.5"
                    onClick={() => setNewChatOpen(true)}
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" /> Start Conversation
                  </Button>
                )}
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isSelected = c.id === activeId;
                const isDirect = c.kind === "direct";
                const isAnnouncement = c.kind === "announcement";
                const otherId = c.participantIds.find((id) => id !== me.id);
                const other =
                  isDirect && otherId ? state.users.find((u) => u.id === otherId) : null;
                const displayName = isDirect && other ? other.fullName : c.name;
                const stats = conversationStats.get(c.id);
                const unread = stats?.unreadCount ?? 0;
                const lastMsg = stats?.lastMessage;
                const lastMsgSender = lastMsg
                  ? lastMsg.senderId === me.id
                    ? "You"
                    : (state.users.find((u) => u.id === lastMsg.senderId)?.fullName.split(" ")[0] ??
                      "Someone")
                  : null;

                const isPunched = other
                  ? state.attendance.some(
                      (a) =>
                        a.userId === other.id && a.date === todayKey && a.punchIn && !a.punchOut,
                    )
                  : false;

                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-all relative border border-transparent",
                      isSelected
                        ? "bg-primary/10 border-primary/20 text-foreground font-medium shadow-xs"
                        : "hover:bg-muted/60 text-foreground",
                      unread > 0 && !isSelected && "bg-muted/40 font-medium",
                    )}
                  >
                    {/* Avatar / Channel Badge */}
                    <div className="relative shrink-0 mt-0.5">
                      {isDirect && other ? (
                        <>
                          <Initials
                            name={other.fullName}
                            color={other.avatarColor}
                            src={other.avatarUrl}
                            size={36}
                          />
                          <span
                            className={cn(
                              "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                              isPunched ? "bg-emerald-500" : "bg-muted-foreground/40",
                            )}
                            title={isPunched ? "Punched in today" : "Offline / off duty"}
                          />
                        </>
                      ) : isAnnouncement ? (
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                          <Megaphone className="h-4 w-4" />
                        </div>
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary font-semibold">
                          <Hash className="h-4 w-4" />
                        </div>
                      )}
                    </div>

                    {/* Content Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-xs font-semibold text-foreground">
                          {displayName}
                        </span>
                        {lastMsg && (
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {formatMessageTime(lastMsg.at)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <p className="truncate text-[11px] text-muted-foreground">
                          {lastMsg ? (
                            <>
                              <span className="font-medium text-foreground/80">
                                {lastMsgSender}:{" "}
                              </span>
                              {lastMsg.body}
                            </>
                          ) : isDirect ? (
                            (other?.designation ?? "Direct message")
                          ) : (
                            `${c.participantIds.length} members`
                          )}
                        </p>

                        {unread > 0 && (
                          <span className="ml-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shrink-0">
                            {unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Right Active Chat Workspace */}
        <Card className="flex h-[76vh] flex-col rounded-2xl border-border shadow-xs overflow-hidden">
          {active ? (
            <>
              {/* Active Conversation Top Bar */}
              <div className="flex items-center justify-between border-b border-border bg-card/80 px-5 py-3 backdrop-blur-xs">
                <div className="flex items-center gap-3 min-w-0">
                  {active.kind === "direct" && otherParticipant ? (
                    <div className="relative">
                      <Initials
                        name={otherParticipant.fullName}
                        color={otherParticipant.avatarColor}
                        src={otherParticipant.avatarUrl}
                        size={40}
                      />
                      <span
                        className={cn(
                          "absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-card",
                          isOtherPunchedIn ? "bg-emerald-500" : "bg-muted-foreground/40",
                        )}
                      />
                    </div>
                  ) : active.kind === "announcement" ? (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                      <Megaphone className="h-5 w-5" />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-semibold">
                      <Hash className="h-5 w-5" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-sm font-bold text-foreground">
                        {active.kind === "direct" && otherParticipant
                          ? otherParticipant.fullName
                          : active.name}
                      </h2>
                      {active.kind === "direct" && otherParticipant && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                            isOtherPunchedIn
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              isOtherPunchedIn ? "bg-emerald-500" : "bg-muted-foreground",
                            )}
                          />
                          {isOtherPunchedIn ? "Punched In Today" : "Off Duty"}
                        </span>
                      )}
                      {active.kind === "announcement" && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30"
                        >
                          Official Broadcast
                        </Badge>
                      )}
                    </div>

                    <p className="truncate text-xs text-muted-foreground">
                      {active.kind === "direct" && otherParticipant
                        ? `${otherParticipant.designation} · ${otherParticipant.department} · @${otherParticipant.username}`
                        : `${active.participantIds.length} team members in channel`}
                    </p>
                  </div>
                </div>

                {/* Top Bar Actions */}
                <div className="flex items-center gap-1.5">
                  {active.kind === "group" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAddMemberOpen(true)}
                        className="h-8 text-xs gap-1"
                      >
                        <UserPlus className="h-3.5 w-3.5" /> Invite
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setMembersListOpen(true)}
                        className="h-8 text-xs gap-1 text-muted-foreground"
                      >
                        <Users className="h-3.5 w-3.5" /> {active.participantIds.length}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Messages Stream Area */}
              <CardContent className="flex flex-1 flex-col p-4 overflow-hidden bg-muted/10">
                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                  {thread.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center p-6">
                      <div className="h-12 w-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground mb-3">
                        <MessageSquare className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">No messages yet</p>
                      <p className="text-xs text-muted-foreground max-w-xs mt-1">
                        {active.kind === "announcement"
                          ? "Official announcement posts will appear here."
                          : "Say hello to start collaborating with the team."}
                      </p>
                    </div>
                  ) : (
                    messageGroups.map((group, groupIdx) => (
                      <div key={groupIdx} className="space-y-3">
                        {/* Date Separator */}
                        <div className="flex items-center justify-center my-3">
                          <span className="rounded-full bg-muted/80 px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider shadow-2xs">
                            {group.dateHeader}
                          </span>
                        </div>

                        {/* Messages in this date group */}
                        {group.messages.map((m) => {
                          const isMe = m.senderId === me.id;
                          const sender = state.users.find((u) => u.id === m.senderId);
                          const senderRole = sender?.role;

                          return (
                            <div
                              key={m.id}
                              className={cn(
                                "flex items-end gap-2.5 group",
                                isMe ? "justify-end" : "justify-start",
                              )}
                            >
                              {!isMe && (
                                <Initials
                                  name={sender?.fullName ?? "Team Member"}
                                  color={sender?.avatarColor}
                                  src={sender?.avatarUrl}
                                  size={32}
                                />
                              )}

                              <div
                                className={cn(
                                  "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-2xs transition-all",
                                  isMe
                                    ? "bg-primary text-primary-foreground rounded-br-xs"
                                    : "bg-card border border-border/80 text-foreground rounded-bl-xs",
                                  active.kind === "announcement" &&
                                    "bg-amber-500/10 border-amber-500/20 text-foreground",
                                )}
                              >
                                {!isMe && (
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-foreground">
                                      {sender?.fullName}
                                    </span>
                                    {senderRole && senderRole !== "member" && (
                                      <span
                                        className={cn(
                                          "rounded-md px-1.5 py-0.2 text-[9px] font-semibold uppercase tracking-wider",
                                          senderRole === "super_admin"
                                            ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                                        )}
                                      >
                                        {roleLabel(senderRole)}
                                      </span>
                                    )}
                                  </div>
                                )}

                                <p className="whitespace-pre-wrap leading-relaxed text-xs sm:text-sm">
                                  {m.body}
                                </p>

                                <div
                                  className={cn(
                                    "flex items-center justify-end gap-1.5 mt-1 text-[10px]",
                                    isMe ? "text-primary-foreground/75" : "text-muted-foreground",
                                  )}
                                >
                                  <span>{fmtTime(m.at)}</span>
                                  {isMe && (
                                    <CheckCheck className="h-3 w-3 text-primary-foreground/90" />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Quick Action Response Chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2 pb-1">
                  <span className="text-[10px] text-muted-foreground font-medium mr-1">
                    Quick reply:
                  </span>
                  {[
                    "👍 Acknowledged",
                    "✅ Working on this",
                    "🙌 Thanks a lot",
                    "🤝 Let's sync today",
                  ].map((quick) => (
                    <button
                      key={quick}
                      type="button"
                      onClick={() => {
                        setDraft((prev) => (prev ? `${prev} ${quick}` : quick));
                      }}
                      className="rounded-full bg-background border border-border/80 px-2.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/50 transition"
                    >
                      {quick}
                    </button>
                  ))}
                </div>

                {/* Message Composer Box */}
                <form
                  className="flex items-center gap-2 pt-2 border-t border-border"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                >
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={
                      active.kind === "announcement"
                        ? "Post announcement reply or update…"
                        : active.kind === "direct" && otherParticipant
                          ? `Message ${otherParticipant.fullName.split(" ")[0]}…`
                          : `Message #${active.name}…`
                    }
                    className="h-10 text-xs sm:text-sm bg-background"
                  />
                  <Button
                    type="submit"
                    size="default"
                    disabled={!draft.trim()}
                    className="gap-1.5 h-10 px-4 shrink-0 shadow-xs"
                  >
                    <Send className="h-4 w-4" /> Send
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <EmptyState
                title="Select a conversation"
                hint="Choose a conversation from your inbox on the left, or create a new channel or direct chat."
              />
            </div>
          )}
        </Card>
      </div>

      {/* Start Direct Chat Modal */}
      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="h-5 w-5 text-primary" /> Start 1:1 Direct Chat
            </DialogTitle>
            <DialogDescription>
              Select any team member to start a private direct conversation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Team Directory ({state.users.filter((u) => u.id !== me.id && u.active).length})
              </p>
              <div className="space-y-1">
                {state.users
                  .filter((u) => u.id !== me.id && u.active)
                  .map((u) => {
                    const isPunched = state.attendance.some(
                      (a) => a.userId === u.id && a.date === todayKey && a.punchIn && !a.punchOut,
                    );
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleStartDirectChat(u)}
                        className="flex w-full items-center justify-between rounded-xl border border-transparent p-2.5 text-left transition hover:border-border hover:bg-muted/70"
                      >
                        <div className="flex items-center gap-3">
                          <Initials
                            name={u.fullName}
                            color={u.avatarColor}
                            src={u.avatarUrl}
                            size={36}
                          />
                          <div>
                            <p className="text-xs font-semibold text-foreground">{u.fullName}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {u.designation} · {u.department}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full font-medium",
                              isPunched
                                ? "bg-emerald-500/10 text-emerald-600"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {isPunched ? "Punched in" : "Off duty"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Team Channel Modal */}
      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-primary" /> Create Team Channel
            </DialogTitle>
            <DialogDescription>
              Create a dedicated channel for a squad, department, or special project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Channel Name</Label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-muted-foreground text-xs font-bold">#</span>
                <Input
                  placeholder="e.g. academics-sprint, design-reviews, marketing"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="pl-7 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Topic / Purpose (Optional)</Label>
              <Input
                placeholder="What is this channel about?"
                value={groupTopic}
                onChange={(e) => setGroupTopic(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Invite Members</Label>
                <button
                  type="button"
                  onClick={() => {
                    const allOtherIds = state.users
                      .filter((u) => u.id !== me.id && u.active)
                      .map((u) => u.id);
                    setSelectedGroupMemberIds((prev) =>
                      prev.length === allOtherIds.length ? [] : allOtherIds,
                    );
                  }}
                  className="text-[11px] text-primary hover:underline"
                >
                  {selectedGroupMemberIds.length ===
                  state.users.filter((u) => u.id !== me.id && u.active).length
                    ? "Deselect all"
                    : "Select all"}
                </button>
              </div>

              <div className="space-y-1 max-h-48 overflow-y-auto pr-1 border rounded-xl p-2 bg-muted/20">
                {state.users
                  .filter((u) => u.id !== me.id && u.active)
                  .map((u) => {
                    const isSelected = selectedGroupMemberIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() =>
                          setSelectedGroupMemberIds((prev) =>
                            prev.includes(u.id)
                              ? prev.filter((id) => id !== u.id)
                              : [...prev, u.id],
                          )
                        }
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg p-2 text-left text-xs transition",
                          isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="h-3.5 w-3.5 rounded border-gray-300 text-primary"
                          />
                          <Initials name={u.fullName} color={u.avatarColor} size={26} />
                          <span>{u.fullName}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{u.designation}</span>
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setNewGroupOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!groupName.trim()}
                onClick={handleCreateGroupChannel}
                className="gap-1.5"
              >
                <Users className="h-3.5 w-3.5" /> Create Channel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Official Announcement Modal */}
      <Dialog open={newAnnouncementOpen} onOpenChange={setNewAnnouncementOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-amber-500" /> Post Official Announcement
            </DialogTitle>
            <DialogDescription>
              Broadcast an official announcement to all active team members across SACE.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Announcement Title</Label>
              <Input
                placeholder="e.g. Q4 Strategy Townhall, Holiday Schedule, Policy Update"
                value={announcementTitle}
                onChange={(e) => setAnnouncementTitle(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Announcement Message</Label>
              <textarea
                rows={4}
                placeholder="Write the full briefing for the team…"
                value={announcementBody}
                onChange={(e) => setAnnouncementBody(e.target.value)}
                className="w-full rounded-xl border border-input bg-background p-2.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setNewAnnouncementOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!announcementTitle.trim() || !announcementBody.trim()}
                onClick={handleCreateAnnouncement}
                className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Megaphone className="h-3.5 w-3.5" /> Broadcast to All
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Channel Members List Dialog */}
      <Dialog open={membersListOpen} onOpenChange={setMembersListOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Channel Members (#{active?.name})
            </DialogTitle>
            <DialogDescription>
              {activeParticipants.length} team members participate in this channel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {activeParticipants.map((u) => {
              const isPunched = state.attendance.some(
                (a) => a.userId === u.id && a.date === todayKey && a.punchIn && !a.punchOut,
              );
              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-border/60 bg-muted/20"
                >
                  <div className="flex items-center gap-3">
                    <Initials name={u.fullName} color={u.avatarColor} src={u.avatarUrl} size={34} />
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        {u.fullName} {u.id === me.id && "(You)"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {u.designation} · {roleLabel(u.role)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                      isPunched
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isPunched ? "Online" : "Offline"}
                  </span>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite Member to Channel Dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Add Teammate to #{active?.name}
            </DialogTitle>
            <DialogDescription>Select a team member to invite to this channel.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Select Member</Label>
              <select
                value={memberToAdd}
                onChange={(e) => setMemberToAdd(e.target.value)}
                className="w-full rounded-xl border border-input bg-background p-2.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-ring"
              >
                <option value="">-- Choose team member --</option>
                {state.users
                  .filter((u) => u.active && !active?.participantIds.includes(u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.designation})
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setAddMemberOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!memberToAdd}
                onClick={handleAddMemberToChannel}
                className="gap-1.5"
              >
                <UserPlus className="h-3.5 w-3.5" /> Add Member
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
