import { Card, CardContent } from "@/components/ui/card";
import { ArrowDown, ArrowUp, LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  trend?: {
    direction: "up" | "down";
    value: string;
  };
  icon?: LucideIcon;
}

export default function StatCard({ label, value, trend, icon: Icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-2">
          <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </div>
          {Icon && (
            <Icon className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        <div className="text-3xl font-bold font-mono mb-1">{value}</div>
        {trend && (
          <div className="flex items-center gap-1 text-sm">
            {trend.direction === "up" ? (
              <ArrowUp className="w-4 h-4 text-destructive" />
            ) : (
              <ArrowDown className="w-4 h-4 text-chart-5" />
            )}
            <span className={trend.direction === "up" ? "text-destructive" : "text-chart-5"}>
              {trend.value}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
