import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ImagePlus, Loader2, MapPin, Navigation, ShieldCheck } from "lucide-react";
import { AppShell, Initials, PageHeader, roleLabel } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/lib/store";
import { DEFAULT_OFFICE_GEOFENCE, requestCurrentPosition } from "@/lib/geofence";
import { PASSWORD_POLICY_ERROR, isStrongPassword, validateAndNormalizeImage } from "@/lib/security";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — SACE Portal" },
      {
        name: "description",
        content: "Update your SACE Portal profile, photo, daily vision and password.",
      },
      { property: "og:title", content: "Settings — SACE Portal" },
      { property: "og:description", content: "Personal profile and portal preferences." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
});

/** Validate MIME/magic bytes/size and downscale avatar to a bounded WebP data URL. */
async function toAvatarDataUrl(file: File): Promise<string> {
  return validateAndNormalizeImage(file, { maxDim: 256, squareCrop: true, quality: 0.82 });
}

function SettingsPage() {
  const { state, me, can, saveUser, saveOfficeGeofence, log } = useApp();
  const isAdmin = me?.role === "super_admin" || me?.role === "admin" || can("system_settings");
  const currentGeofence = state.officeGeofence ?? DEFAULT_OFFICE_GEOFENCE;

  const [fullName, setFullName] = React.useState(me?.fullName ?? "");
  const [email, setEmail] = React.useState(me?.email ?? "");
  const [designation, setDesignation] = React.useState(me?.designation ?? "");
  const [vision, setVision] = React.useState(me?.dailyVision ?? "");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const [geoEnabled, setGeoEnabled] = React.useState(currentGeofence.enabled);
  const [officeName, setOfficeName] = React.useState(currentGeofence.officeName);
  const [officeLat, setOfficeLat] = React.useState(String(currentGeofence.latitude));
  const [officeLon, setOfficeLon] = React.useState(String(currentGeofence.longitude));
  const [radiusMeters, setRadiusMeters] = React.useState(String(currentGeofence.radiusMeters));
  const [geoBusy, setGeoBusy] = React.useState(false);
  const [detectingLoc, setDetectingLoc] = React.useState(false);

  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (me) {
      setFullName(me.fullName || "");
      setEmail(me.email || "");
      setDesignation(me.designation || "");
      setVision(me.dailyVision || "");
    }
  }, [me]);

  React.useEffect(() => {
    if (state.officeGeofence) {
      setGeoEnabled(state.officeGeofence.enabled);
      setOfficeName(state.officeGeofence.officeName);
      setOfficeLat(String(state.officeGeofence.latitude));
      setOfficeLon(String(state.officeGeofence.longitude));
      setRadiusMeters(String(state.officeGeofence.radiusMeters));
    }
  }, [state.officeGeofence]);

  if (!me) {
    return null;
  }

  async function detectCurrentOfficeGps() {
    setDetectingLoc(true);
    try {
      const coords = await requestCurrentPosition();
      setOfficeLat(String(coords.latitude));
      setOfficeLon(String(coords.longitude));
      toast.success(
        `Captured GPS coordinates (${coords.latitude}, ${coords.longitude}) · ±${coords.accuracyMeters}m`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not capture current GPS location.");
    } finally {
      setDetectingLoc(false);
    }
  }

  async function handleSaveGeofence(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) {
      toast.error("Admin access required to update office geofencing.");
      return;
    }
    const lat = Number(officeLat);
    const lon = Number(officeLon);
    const radius = Number(radiusMeters);
    if (!officeName.trim()) {
      toast.error("Enter an office location name.");
      return;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      toast.error("Office Latitude must be a valid number between -90 and 90.");
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      toast.error("Office Longitude must be a valid number between -180 and 180.");
      return;
    }
    if (!Number.isFinite(radius) || radius < 10 || radius > 50000) {
      toast.error("Allowed Radius must be between 10 meters and 50,000 meters.");
      return;
    }

    setGeoBusy(true);
    const res = await saveOfficeGeofence({
      enabled: geoEnabled,
      officeName: officeName.trim(),
      latitude: lat,
      longitude: lon,
      radiusMeters: Math.round(radius),
    });
    setGeoBusy(false);

    if (!res.ok) {
      toast.error(res.error ?? "Failed to save office geofence configuration.");
      return;
    }
    toast.success("Office geofencing settings saved securely.");
  }

  async function pickAvatar(file: File | undefined) {
    if (!file || !me) return;
    setBusy(true);
    try {
      const avatarUrl = await toAvatarDataUrl(file);
      const res = await saveUser({ userId: me.id, avatarUrl });
      if (!res.ok) throw new Error(res.error ?? "Could not save the photo");
      log("avatar_updated", "Updated profile photo");
      toast.success("Profile photo updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the photo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" description="Your profile and portal preferences." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <Initials
                name={me.fullName}
                color={me.avatarColor}
                size={48}
                src={me.avatarUrl ?? null}
              />
              <div>
                <p className="font-semibold">{me.fullName}</p>
                <p className="text-sm text-muted-foreground">
                  {roleLabel(me.role)} · @{me.username}
                </p>
              </div>
              <div className="ml-auto">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => void pickAvatar(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus className="mr-1 h-4 w-4" /> Change photo
                </Button>
              </div>
            </div>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!me) return;
                setBusy(true);
                const res = await saveUser({
                  userId: me.id,
                  fullName: fullName.trim(),
                  email: email.trim(),
                  designation: designation.trim(),
                  dailyVision: vision.trim() || null,
                });
                setBusy(false);
                if (!res.ok) {
                  toast.error(res.error ?? "Could not save your profile");
                  return;
                }
                log("profile_updated", "Updated own profile");
                toast.success("Profile saved");
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={fullName || ""}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email || ""}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="designation">Designation</Label>
                <Input
                  id="designation"
                  value={designation || ""}
                  onChange={(e) => setDesignation(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vision">Daily vision</Label>
                <Textarea
                  id="vision"
                  value={vision || ""}
                  onChange={(e) => setVision(e.target.value)}
                  rows={3}
                />
              </div>
              <Button type="submit" disabled={busy}>
                Save profile
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-2xl">
            <CardContent className="space-y-4 p-5">
              <h3 className="font-semibold">Security &amp; Password</h3>
              <form
                className="space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!me) return;
                  if (!isStrongPassword(password)) {
                    toast.error(PASSWORD_POLICY_ERROR);
                    return;
                  }
                  setBusy(true);
                  const res = await saveUser({ userId: me.id, password });
                  setBusy(false);
                  if (!res.ok) {
                    toast.error(res.error ?? "Could not update the password");
                    return;
                  }
                  setPassword("");
                  log("password_changed", "Changed own password");
                  toast.success("Password updated");
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="pwd">New password</Label>
                  <Input
                    id="pwd"
                    type="password"
                    value={password || ""}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                  />
                </div>
                <Button type="submit" variant="outline" disabled={busy}>
                  Update password
                </Button>
              </form>
            </CardContent>
          </Card>

          {isAdmin && (
            <Card className="rounded-2xl border-border">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">
                        Office Geofencing &amp; Punch-In Boundary
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Restrict employee punch-ins to physical office GPS coordinates.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Label htmlFor="geofence-toggle" className="text-xs text-muted-foreground">
                      {geoEnabled ? "Active" : "Disabled"}
                    </Label>
                    <Switch
                      id="geofence-toggle"
                      checked={geoEnabled}
                      onCheckedChange={setGeoEnabled}
                    />
                  </div>
                </div>

                <form className="space-y-4" onSubmit={handleSaveGeofence}>
                  <div className="space-y-2">
                    <Label htmlFor="office-name">Office location name</Label>
                    <Input
                      id="office-name"
                      value={officeName}
                      onChange={(e) => setOfficeName(e.target.value)}
                      placeholder="e.g. SACE Group Headquarters"
                      required
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="office-lat">Office Latitude</Label>
                      <Input
                        id="office-lat"
                        type="number"
                        step="any"
                        min={-90}
                        max={90}
                        className="font-mono tabular-nums"
                        value={officeLat}
                        onChange={(e) => setOfficeLat(e.target.value)}
                        placeholder="17.385044"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="office-lon">Office Longitude</Label>
                      <Input
                        id="office-lon"
                        type="number"
                        step="any"
                        min={-180}
                        max={180}
                        className="font-mono tabular-nums"
                        value={officeLon}
                        onChange={(e) => setOfficeLon(e.target.value)}
                        placeholder="78.486671"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="office-radius">Allowed Radius (meters)</Label>
                      <div className="flex items-center gap-1">
                        {[50, 100, 250, 500].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setRadiusMeters(String(preset))}
                            className={cn(
                              "rounded-md border px-2 py-0.5 text-[11px] font-medium tabular-nums transition-colors cursor-pointer",
                              Number(radiusMeters) === preset
                                ? "border-primary bg-primary/15 text-primary"
                                : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {preset}m
                          </button>
                        ))}
                      </div>
                    </div>
                    <Input
                      id="office-radius"
                      type="number"
                      min={10}
                      max={50000}
                      step={5}
                      className="font-mono tabular-nums"
                      value={radiusMeters}
                      onChange={(e) => setRadiusMeters(e.target.value)}
                      placeholder="100"
                      required
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Haversine distance checks run on both client and server on every punch-in.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={detectingLoc || geoBusy}
                      onClick={() => void detectCurrentOfficeGps()}
                      className="gap-1.5"
                    >
                      {detectingLoc ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Navigation className="h-3.5 w-3.5" />
                      )}
                      {detectingLoc ? "Detecting GPS..." : "Use Current GPS"}
                    </Button>

                    <Button type="submit" disabled={geoBusy || detectingLoc} className="gap-1.5">
                      {geoBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      {geoBusy ? "Saving..." : "Save Location Settings"}
                    </Button>
                  </div>

                  {state.officeGeofence?.updatedAt && (
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      Last updated {new Date(state.officeGeofence.updatedAt).toLocaleString()}
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
