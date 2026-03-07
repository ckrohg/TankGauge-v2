import { Button } from "@/components/ui/button";
import { Settings, RefreshCw, Droplet, LogOut } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";

interface HeaderProps {
  lastSync?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function Header({ lastSync, onRefresh, isRefreshing }: HeaderProps) {
  const [location] = useLocation();
  const { user, signOut } = useAuth();

  const handleLogout = async () => {
    queryClient.clear();
    await signOut();
  };

  const displayName = user?.email || "";

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" data-testid="link-home">
          <div className="flex items-center gap-3 hover-elevate active-elevate-2 px-3 py-2 rounded-md -ml-3 cursor-pointer">
            <Droplet className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">Tank Monitor</h1>
          </div>
        </Link>

        <div className="flex items-center gap-4">
          {displayName && (
            <div className="hidden sm:block text-sm text-muted-foreground">
              {displayName}
            </div>
          )}
          {lastSync && (
            <div className="hidden sm:block text-sm text-muted-foreground">
              Last sync: <span className="font-mono">{lastSync}</span>
            </div>
          )}
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              disabled={isRefreshing}
              data-testid="button-refresh"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          )}
          <Link href={location === "/settings" ? "/" : "/settings"} data-testid="link-settings">
            <Button variant="ghost" size="icon">
              <Settings className="w-5 h-5" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
