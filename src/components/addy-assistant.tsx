import * as React from "react";
import {
  Bot,
  Send,
  X,
  Sparkles,
  HelpCircle,
  Clock,
  FileCheck,
  CalendarCheck,
  ChevronDown,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { askAddyAssistant, useApp } from "@/lib/store";
import { sanitizeExternalUrl } from "@/lib/security";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import addyAvatarSrc from "@/assets/images/addy_character_1788268940252.jpg";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  { label: "Punch-in guide", query: "How do I punch in and log my attendance hours?", icon: Clock },
  {
    label: "Task proof guide",
    query: "How do I submit proofs and deliverables for tasks?",
    icon: FileCheck,
  },
  {
    label: "EOD report help",
    query: "What should I include in my End of Day (EOD) report?",
    icon: HelpCircle,
  },
  {
    label: "Apply for leave",
    query: "How does the casual and sick leave application process work?",
    icon: CalendarCheck,
  },
];

export function AddyAssistant() {
  const { me } = useApp();

  const [mounted, setMounted] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [chatInput, setChatInput] = React.useState("");
  const [chatBusy, setChatBusy] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMsg[]>([
    {
      role: "assistant",
      content: `Hello ${me?.fullName ? me.fullName.split(" ")[0] : "there"}! I'm **Addy**, your SACE AI Assistant. How can I help you today with tasks, attendance, leave, or portal guidelines?`,
    },
  ]);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && chatOpen) {
        setChatOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chatOpen]);

  // Auto-scroll chat messages
  React.useEffect(() => {
    if (chatOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatOpen]);

  const sendChat = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || chatBusy) return;

    const userMsg: ChatMsg = { role: "user", content: trimmed };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setChatInput("");
    setChatBusy(true);

    try {
      const res = await askAddyAssistant(
        nextHistory.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      );

      if (res && res.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "I'm here to help with your SACE portal questions! Feel free to ask about attendance, EOD submissions, tasks, or leave policies.",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I'm here to help! For tasks, use the Tasks tab to view and submit proof. For attendance, punch in on your Overview tab. For leave, head to the Leave section.",
        },
      ]);
    } finally {
      setChatBusy(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  if (!mounted) return null;

  return (
    <>
      {/* Docked Floating Trigger Button */}
      {!chatOpen && (
        <div className="fixed bottom-5 right-5 z-[999] animate-in fade-in slide-in-from-bottom-3 duration-300">
          <button
            type="button"
            onClick={() => {
              setChatOpen(true);
              setTimeout(() => inputRef.current?.focus(), 150);
            }}
            className="group relative flex items-center gap-2.5 rounded-full border border-purple-500/30 bg-gradient-to-r from-purple-900 via-purple-800 to-indigo-900 px-3.5 py-2 text-white shadow-xl shadow-purple-950/30 transition-all hover:scale-105 hover:shadow-2xl hover:border-purple-400 cursor-pointer"
            aria-label="Open Addy AI Assistant"
          >
            <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border-2 border-white/40 bg-purple-950 shadow-sm">
              <img src={addyAvatarSrc} alt="Addy Mascot" className="h-full w-full object-cover" />
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-white" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-semibold leading-tight text-white flex items-center gap-1">
                Addy AI <Sparkles className="h-3 w-3 text-amber-300" />
              </span>
              <span className="text-[10px] text-purple-200/80 leading-none">Assistant</span>
            </div>
          </button>
        </div>
      )}

      {/* Modern AI Chat Drawer */}
      {chatOpen && (
        <div className="fixed bottom-5 right-5 z-[1000] flex h-[520px] w-[370px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-purple-500/20 bg-card shadow-2xl shadow-purple-950/25 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-purple-950 via-purple-900 to-indigo-950 px-4 py-3 text-white border-b border-purple-800/40">
            <div className="flex items-center gap-2.5">
              <div className="relative h-8 w-8 overflow-hidden rounded-full border-2 border-purple-400/40 bg-purple-950 shadow-sm">
                <img src={addyAvatarSrc} alt="Addy Mascot" className="h-full w-full object-cover" />
                <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold leading-tight flex items-center gap-1">
                  Addy <Sparkles className="h-3 w-3 text-amber-300" />
                </span>
                <span className="text-[10px] text-purple-200/80">SACE Workforce AI Assistant</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setChatOpen(false)}
                className="h-7 w-7 rounded-full text-purple-200 hover:bg-white/10 hover:text-white"
                title="Minimize assistant"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setChatOpen(false)}
                className="h-7 w-7 rounded-full text-purple-200 hover:bg-white/10 hover:text-white"
                title="Close assistant"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Chat Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs leading-relaxed bg-background/50"
          >
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex gap-2.5 max-w-[90%]",
                  m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto",
                )}
              >
                {m.role === "assistant" && (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full overflow-hidden border border-purple-500/40 mt-0.5 shadow-xs">
                    <img src={addyAvatarSrc} alt="Addy" className="h-full w-full object-cover" />
                  </div>
                )}
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2.5 shadow-xs",
                    m.role === "user"
                      ? "bg-purple-700 text-white font-medium rounded-br-xs"
                      : "bg-muted/80 text-foreground border border-border/70 rounded-bl-xs",
                  )}
                >
                  <div className="prose prose-xs dark:prose-invert max-w-none text-xs">
                    <ReactMarkdown urlTransform={(url) => sanitizeExternalUrl(url) ?? ""}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {chatBusy && (
              <div className="flex gap-2.5 mr-auto items-center text-muted-foreground text-xs animate-pulse">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full overflow-hidden border border-purple-400 animate-spin">
                  <img src={addyAvatarSrc} alt="Addy" className="h-full w-full object-cover" />
                </div>
                <span>Addy is preparing an answer...</span>
              </div>
            )}
          </div>

          {/* Quick Prompt Suggestions */}
          <div className="px-3 py-2 bg-muted/40 border-t border-border/60 flex gap-1.5 overflow-x-auto scrollbar-none">
            {SUGGESTIONS.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => sendChat(item.query)}
                className="flex items-center gap-1 rounded-lg border border-border/80 bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground whitespace-nowrap transition-colors shrink-0 cursor-pointer"
              >
                <item.icon className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Chat Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendChat(chatInput);
            }}
            className="flex items-center gap-2 border-t border-border p-3 bg-card shrink-0"
          >
            <Input
              ref={inputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about tasks, punch-in, leaves..."
              className="text-xs h-9 bg-background focus-visible:ring-purple-500"
              disabled={chatBusy}
            />
            <Button
              type="submit"
              size="sm"
              disabled={chatBusy || !chatInput.trim()}
              className="h-9 w-9 p-0 bg-purple-700 hover:bg-purple-800 text-white shrink-0 rounded-xl"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
