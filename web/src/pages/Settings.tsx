import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { Settings } from "@/types";

export default function Settings() {
  const { toast } = useToast();
  const [frequency, setFrequency] = useState("twice-daily");
  const [tankfarmUsername, setTankfarmUsername] = useState("");
  const [tankfarmPassword, setTankfarmPassword] = useState("");

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  // Update form fields when settings load
  useEffect(() => {
    if (settings) {
      setFrequency(settings.scrapingFrequency || "twice-daily");
      setTankfarmUsername(settings.tankfarmUsername || "");
      setTankfarmPassword(settings.tankfarmPassword || "");
    }
  }, [settings]);

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
