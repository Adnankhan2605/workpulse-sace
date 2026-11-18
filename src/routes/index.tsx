import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SaceLogo } from "@/components/sace-logo";
import { Lock, User } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in — SACE Workforce Portal" },
      {
        name: "description",
        content:
          "Sign in to SACE Workforce Portal to punch in, manage tasks, leave, leads and support tickets.",
      },
      { property: "og:title", content: "Sign in — SACE Workforce Portal" },
      {
        property: "og:description",
        content: "Secure sign in for SACE Group employees and administrators.",
      },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const { login, me, ready } = useApp();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (ready && me) {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [ready, me, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!identifier.trim() || !password) {
      setError("Please enter your username/email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await login(identifier, password);
      if (!res.ok) {
        setError(res.error ?? "Unable to sign in.");
        return;
      }
      toast.success("Welcome back to SACE Workforce Portal");
      await navigate({ to: "/dashboard", replace: true });
    } catch {
      setError("Unable to complete sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2 transition-opacity duration-200">
      {/* Left Branding Showcase */}
      <div className="relative hidden flex-col justify-between bg-gradient-to-br from-purple-950 via-purple-900 to-slate-950 p-12 text-white lg:flex">
        <div className="flex items-center gap-4">
          <SaceLogo size="lg" variant="badge" />
          <div className="flex flex-col">
            <span className="text-2xl font-black tracking-tight text-white">WORKPULSE</span>
            <span className="text-xs font-medium text-purple-200/70 tracking-widest uppercase">
              YOUR TEAM OPERATIONS HUB
            </span>
          </div>
        </div>

        <div className="max-w-md space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/20 bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-200">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Official Internal Workplace
          </div>
          <h2 className="text-4xl font-bold leading-tight tracking-tight text-white">
            Unified workforce operations and management.
          </h2>
          <p className="text-sm leading-relaxed text-purple-200/80">
            Daily shift punch-in, verified task deliverables, end-of-day reports, leave management,
            team communication, and real-time performance analytics.
          </p>
        </div>

        <div className="flex items-center justify-between text-xs text-purple-300/60 border-t border-purple-800/40 pt-4">
          <span>© SACE Group · All rights reserved</span>
          <span>Internal Portal</span>
        </div>
      </div>

      {/* Right Login Container */}
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left space-y-2">
            <div className="mb-2">
              <SaceLogo size="xl" variant="wordmark" className="h-14" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Sign in to your account
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your assigned SACE credentials to access the portal.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="identifier">Username or email</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="identifier"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. hakeem or hakeem@sacegroup.com"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Enter your password"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive animate-in fade-in"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-purple-700 hover:bg-purple-800 text-white font-medium py-2.5 rounded-xl shadow-sm transition-all"
              size="lg"
              disabled={busy}
            >
              {busy ? "Authenticating…" : "Sign in"}
            </Button>
          </form>

          <div className="rounded-xl bg-muted/40 border p-3.5 text-xs text-muted-foreground text-center">
            <p>
              Accounts are created by the Super Admin. If you need account access, please contact
              management.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
