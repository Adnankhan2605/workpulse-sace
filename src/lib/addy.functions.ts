import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { z } from "zod";

const AskSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(24),
  context: z.string().max(2000).optional(),
});

const SYSTEM_PROMPT = `You are Addy, the built-in assistant for SACE Portal — an internal workforce operations portal for SACE Group.

Speak warmly, briefly and practically. Use short paragraphs or bullet points. Never invent features that don't exist.

How the portal works:
- Sign in with a SACE username or work email.
- Overview (/dashboard): daily vision, punch in / punch out timer, hours today and this month, attendance percentage, active tasks and quick actions. Punch out requires at least one task proof submitted that day.
- Tasks (/tasks): team members set their OWN tasks. Nobody assigns work to them. Each task is typed as Today, Weekly, Monthly or Quarterly, with a priority, target date and required proof type (any / image / file / link). Members start a task, submit proof (text, link, file or image) and mark it complete. Admins and Super Admins also set and track their own tasks the same way.
- EOD Reports (/eod): at log out everyone submits an End of Day report — what they worked on, what they completed, blockers and hours. Individuals see their own reports; Admins and Super Admins see the whole team, filter by daily / weekly / monthly / quarterly views and download PDFs for one person or for all team members.
- Attendance (/attendance): calendar of present, absent, leave and week-off days.
- Leave Requests (/leave): casual and sick leave with balances; Admins and Super Admins approve or reject with a comment.
- Leads (/leads): shared lead datasets uploaded by Admins.
- Messages (/messages): internal direct and group chat.
- Support Tickets (/tickets): raise and track internal helpdesk requests.
- Leaderboard (/leaderboard): recognition and awards.
- Team & Accounts (/team, Admins+): create and manage employee accounts.
- Progress Reports (/reports, Admins+), Audit Logs (/audit, Super Admin), Roles & Permissions (/roles, Super Admin), Settings (/settings): profile, daily vision and preferences.

Roles: Super Admin (everything), Admin (team management, approvals, reports, leads, recognition), Team Member (own tasks, attendance, leave, tickets, messages, EOD).

If a question is outside the portal, answer helpfully but keep it short. If you truly don't know, say so and suggest raising a support ticket.`;

export const askAddy = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AskSchema.parse(data))
  .handler(async ({ data }) => {
    const geminiKey = process.env["GEMINI_API_KEY"];
    const lovableKey = process.env["LOVABLE_API_KEY"];

    const systemInstruction = data.context
      ? `${SYSTEM_PROMPT}\n\nCurrent user context: ${data.context}`
      : SYSTEM_PROMPT;

    if (geminiKey) {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        const contents = data.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
          },
        });

        if (response.text) {
          return { reply: response.text };
        }
      } catch (err) {
        console.error("[Addy / Gemini Error]", err);
      }
    }

    if (lovableKey) {
      try {
        const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
        const gateway = createLovableAiGatewayProvider(lovableKey);

        const result = streamText({
          model: gateway("google/gemini-3.7-flash"),
          system: systemInstruction,
          messages: data.messages,
        });

        return { reply: await result.text };
      } catch (err) {
        console.error("[Addy / Lovable Gateway Error]", err);
      }
    }

    // Friendly in-memory fallback for local development or preview without API keys
    const lastUserMessage = data.messages[data.messages.length - 1]?.content.toLowerCase() || "";

    if (lastUserMessage.includes("task") || lastUserMessage.includes("todo")) {
      return {
        reply:
          "You can create and manage your own tasks on the **Tasks** page (`/tasks`). Remember to submit proof before punching out for the day!",
      };
    }
    if (
      lastUserMessage.includes("eod") ||
      lastUserMessage.includes("punch") ||
      lastUserMessage.includes("logout")
    ) {
      return {
        reply:
          "End of Day (EOD) reports are submitted during punch out or on the **EOD Reports** page (`/eod`). They summarize your day's achievements, hours, and any blockers.",
      };
    }
    if (lastUserMessage.includes("leave")) {
      return {
        reply:
          "Check your casual and sick leave balances and submit time-off requests on the **Leave Requests** page (`/leave`).",
      };
    }
    if (
      lastUserMessage.includes("ticket") ||
      lastUserMessage.includes("help") ||
      lastUserMessage.includes("support")
    ) {
      return {
        reply:
          "You can raise internal IT or administrative helpdesk requests on the **Support Tickets** page (`/tickets`).",
      };
    }

    return {
      reply:
        "Hi! I'm Addy, your SACE Workforce assistant. I can guide you on managing tasks, punch timers, EOD submissions, leave requests, and reports. What would you like help with?",
    };
  });
