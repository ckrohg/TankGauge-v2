import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save, RefreshCw, Lock, UserPlus, X, Users, Bell, Mail } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { Settings, TankShare } from "@/types";

export default function Settings() {
  const { toast } = useToast();
  const [frequency, setFrequency] = useState("twice-daily");
  const [tankfarmUsername, setTankfarmUsername] = useState("");
  const [tankfarmPassword, setTankfarmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [weeklyEmailEnabled, setWeeklyEmailEnabled] = useState(true);
  const [lowAlertEnabled, setLowAlertEnabled] = useState(true);
  const [refillThresholdPct, setRefillThresholdPct] = useState("30");
  const [lowAlertPct, setLowAlertPct] = useState("20");
  const [percentBasis, setPercentBasis] = useState("relative");
  const [notifyEmail, setNotifyEmail] = useState("");

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  // Update form fields when settings load
  useEffect(() => {
    if (settings) {
      setFrequency(settings.scrapingFrequency || "twice-daily");
      setTankfarmUsername(settings.tankfarmUsername || "");
      setTankfarmPassword(settings.tankfarmPassword || "");
      setWeeklyEmailEnabled(settings.weeklyEmailEnabled ?? true);
      setLowAlertEnabled(settings.lowAlertEnabled ?? true);
      setRefillThresholdPct(
        settings.refillThresholdPct != null ? String(Math.round(Number(settings.refillThresholdPct))) : "30"
      );
      setLowAlertPct(
        settings.lowAlertPct != null ? String(Math.round(Number(settings.lowAlertPct))) : "20"
      );
      setPercentBasis(settings.percentBasis || "relative");
      setNotifyEmail(settings.notifyEmail || "");
    }
  }, [settings]);

  const { data: sharesData } = useQuery<{ ownShares: TankShare[]; sharedWithMe: TankShare[] }>({
    queryKey: ["/api/shares"],
  });

  const inviteMutation = useMutation({
    mutationFn: async (sharedEmail: string) => {
      return await apiRequest("POST", "/api/shares", { sharedEmail });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shares"] });
      setInviteEmail("");
      toast({ title: "Invite sent", description: "They'll see your tank data when they sign in." });
    },
    onError: (error: any) => {
      const msg = error?.message?.includes("already been invited")
        ? "This email has already been invited."
        : error?.message?.includes("cannot invite yourself")
        ? "You can't invite yourself."
        : "Failed to send invite.";
      toast({ title: "Invite failed", description: msg, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (shareId: string) => {
      return await apiRequest("DELETE", `/api/shares/${shareId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shares"] });
      toast({ title: "Access revoked" });
    },
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { 
      scrapingFrequency: string;
      tankfarmUsername?: string | null;
      tankfarmPassword?: string | null;
    }) => {
      return await apiRequest("PUT", "/api/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings saved",
        description: "Your settings have been updated successfully.",
      });
    },
    onError: (error: any) => {
      console.error("Settings save error:", error);
      toast({
        title: "Save failed",
        description: error.message || "Failed to update settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const notifMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PUT", "/api/settings", {
        weeklyEmailEnabled,
        lowAlertEnabled,
        refillThresholdPct: Math.min(95, Math.max(1, Number(refillThresholdPct) || 30)),
        lowAlertPct: Math.min(95, Math.max(1, Number(lowAlertPct) || 20)),
        percentBasis,
        notifyEmail: notifyEmail.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Notifications saved", description: "Your email preferences have been updated." });
    },
    onError: (error: any) => {
      toast({
        title: "Save failed",
        description: error.message || "Failed to update notifications.",
        variant: "destructive",
      });
    },
  });

  const testDigestMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/notifications/test");
    },
    onSuccess: () => {
      toast({ title: "Test digest sent", description: "Check your inbox for the weekly summary." });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't send test",
        description: error.message || "Make sure email is configured and you have tank data.",
        variant: "destructive",
      });
    },
  });

  // Manual refresh mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/scrape");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({
        title: "Data refreshed",
        description: "Latest tank data has been fetched successfully.",
      });
    },
    onError: (error: any) => {
      const isAuthError = error?.message?.includes("Unauthorized") || error?.status === 401;
      toast({
        title: isAuthError ? "Authentication required" : "Refresh failed",
        description: isAuthError 
          ? "Your session has expired. Please sign in again to refresh data."
          : "Failed to fetch latest data. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateSettingsMutation.mutate({ 
      scrapingFrequency: frequency,
      tankfarmUsername: tankfarmUsername || null,
      tankfarmPassword: tankfarmPassword || null,
    });
  };

  const handleManualRefresh = () => {
    refreshMutation.mutate();
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast({ title: "Missing fields", description: "Please fill in both password fields.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords match.", variant: "destructive" });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Password updated", description: "Your password has been changed successfully." });
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message || "Failed to update password.", variant: "destructive" });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-6">
          <Link href="/" data-testid="link-back-dashboard">
            <Button variant="ghost" className="gap-2 -ml-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground">
            Configure your data collection schedule and tank farm credentials
          </p>
        </div>

        <div className="space-y-6">
          <Card data-testid="card-credentials">
            <CardHeader>
              <CardTitle>Tank Farm Credentials</CardTitle>
              <CardDescription>
                Connect to tankfarm.io to automatically collect tank data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings && (
                <div className={`p-4 rounded-lg border ${
                  settings.tankfarmUsername && settings.tankfarmPassword
                    ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' 
                    : 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800'
                }`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <p className="font-medium text-sm mb-1" data-testid="text-credentials-status">
                        {settings.tankfarmUsername && settings.tankfarmPassword
                          ? '✓ Credentials Configured' 
                          : '⚠ Credentials Not Set'}
                      </p>
                      <p className="text-sm opacity-80">
                        {settings.tankfarmUsername && settings.tankfarmPassword
                          ? 'Your tankfarm.io credentials are set and ready to use.'
                          : 'Enter your tankfarm.io credentials below to enable automatic data collection.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tankfarmUsername">Tankfarm.io Username</Label>
                  <Input
                    id="tankfarmUsername"
                    type="text"
                    placeholder="your@email.com"
                    value={tankfarmUsername}
                    onChange={(e) => setTankfarmUsername(e.target.value)}
                    disabled={isLoading}
                    data-testid="input-tankfarm-username"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="tankfarmPassword">Tankfarm.io Password</Label>
                  <Input
                    id="tankfarmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={tankfarmPassword}
                    onChange={(e) => setTankfarmPassword(e.target.value)}
                    disabled={isLoading}
                    data-testid="input-tankfarm-password"
                  />
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">
                  Note: Credentials are stored encrypted in the database and are used to automatically fetch your tank data from tankfarm.io.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-sharing">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Share Tank Access
              </CardTitle>
              <CardDescription>
                Invite others to view your tank data by entering their email
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && inviteEmail) {
                      inviteMutation.mutate(inviteEmail);
                    }
                  }}
                  disabled={inviteMutation.isPending}
                  data-testid="input-invite-email"
                />
                <Button
                  onClick={() => inviteMutation.mutate(inviteEmail)}
                  disabled={!inviteEmail || inviteMutation.isPending}
                  data-testid="button-invite"
                >
                  {inviteMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                </Button>
              </div>

              {sharesData?.ownShares && sharesData.ownShares.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                    Shared With
                  </Label>
                  {sharesData.ownShares.map((share) => (
                    <div key={share.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <div className="text-sm font-medium">{share.sharedEmail}</div>
                        <div className="text-xs text-muted-foreground">
                          {share.status === "pending" ? "Pending signup" : "Active"}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => revokeMutation.mutate(share.id)}
                        disabled={revokeMutation.isPending}
                        data-testid={`button-revoke-${share.id}`}
                      >
                        <X className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {sharesData?.sharedWithMe && sharesData.sharedWithMe.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                    Tanks Shared With Me
                  </Label>
                  {sharesData.sharedWithMe.map((share) => (
                    <div key={share.id} className="p-3 rounded-lg bg-muted/50">
                      <div className="text-sm text-muted-foreground">
                        Viewing tank from owner
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-notifications">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Email Notifications
              </CardTitle>
              <CardDescription>
                Weekly tank digest and low-fuel alerts, sent to your email
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="switch-weekly">Weekly digest</Label>
                  <p className="text-xs text-muted-foreground">A tank summary every Monday morning.</p>
                </div>
                <Switch
                  id="switch-weekly"
                  checked={weeklyEmailEnabled}
                  onCheckedChange={setWeeklyEmailEnabled}
                  data-testid="switch-weekly"
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="switch-low-alert">Low-fuel alerts</Label>
                  <p className="text-xs text-muted-foreground">Email me when the tank gets low.</p>
                </div>
                <Switch
                  id="switch-low-alert"
                  checked={lowAlertEnabled}
                  onCheckedChange={setLowAlertEnabled}
                  data-testid="switch-low-alert"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="percentBasis">Percentages are measured</Label>
                <Select value={percentBasis} onValueChange={setPercentBasis}>
                  <SelectTrigger id="percentBasis" data-testid="select-percent-basis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relative">Relative to a full fill (recommended)</SelectItem>
                    <SelectItem value="absolute">Absolute gauge reading</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {percentBasis === "relative"
                    ? "100% = your tank's historical high (a full fill). More intuitive."
                    : "Raw tankfarm.io gauge, where a full propane tank reads ~80%."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="refillThreshold">Refill target (%)</Label>
                  <Input
                    id="refillThreshold"
                    type="number"
                    min={1}
                    max={95}
                    value={refillThresholdPct}
                    onChange={(e) => setRefillThresholdPct(e.target.value)}
                    data-testid="input-refill-threshold"
                  />
                  <p className="text-xs text-muted-foreground">
                    Estimate counts down to this {percentBasis === "relative" ? "% of full" : "gauge %"}.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lowAlert">Alert at (%)</Label>
                  <Input
                    id="lowAlert"
                    type="number"
                    min={1}
                    max={95}
                    value={lowAlertPct}
                    onChange={(e) => setLowAlertPct(e.target.value)}
                    data-testid="input-low-alert"
                  />
                  <p className="text-xs text-muted-foreground">
                    Low-fuel alert at this {percentBasis === "relative" ? "% of full" : "gauge %"}.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notifyEmail">Send to (optional)</Label>
                <Input
                  id="notifyEmail"
                  type="email"
                  placeholder="Defaults to your account email"
                  value={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.value)}
                  data-testid="input-notify-email"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  className="gap-2"
                  onClick={() => notifMutation.mutate()}
                  disabled={notifMutation.isPending}
                  data-testid="button-save-notifications"
                >
                  {notifMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => testDigestMutation.mutate()}
                  disabled={testDigestMutation.isPending}
                  data-testid="button-test-digest"
                >
                  {testDigestMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4" />
                  )}
                  Send test digest
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Update Password</CardTitle>
              <CardDescription>
                Change your account password
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isUpdatingPassword}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isUpdatingPassword}
                />
              </div>
              <Button
                onClick={handleUpdatePassword}
                disabled={isUpdatingPassword || !newPassword || !confirmPassword}
                variant="outline"
                className="w-full"
              >
                {isUpdatingPassword ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Update Password
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data Collection Schedule</CardTitle>
              <CardDescription>
                How often should we automatically check your tank levels?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="frequency">Check Frequency</Label>
                <Select value={frequency} onValueChange={setFrequency} disabled={isLoading}>
                  <SelectTrigger id="frequency" data-testid="select-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Every Hour</SelectItem>
                    <SelectItem value="twice-daily">Twice Daily (6 AM & 6 PM)</SelectItem>
                    <SelectItem value="daily">Once Daily (6 AM)</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manual Actions</CardTitle>
              <CardDescription>
                Trigger a manual data refresh anytime
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleManualRefresh}
                disabled={refreshMutation.isPending}
                data-testid="button-manual-refresh"
                className="w-full"
              >
                {refreshMutation.isPending ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Fetching Data...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh Now
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Button
            onClick={handleSave}
            disabled={updateSettingsMutation.isPending || isLoading}
            data-testid="button-save-settings"
            className="w-full"
            size="lg"
          >
            {updateSettingsMutation.isPending ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
