import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  subvalue?: string;
  auxiliaryText?: string;
  trendDirection?: 'higher' | 'lower';
  icon: LucideIcon;
  highlight?: boolean;
}

export default function MetricCard({ 
  label, 
  value, 
  subvalue, 
  auxiliaryText,
  trendDirection,
  icon: Icon, 
  highlight 
}: MetricCardProps) {
  const TrendIcon = trendDirection === 'higher' ? TrendingUp : TrendingDown;
  const trendColor = trendDirection === 'higher' ? 'text-red-500' : 'text-green-500';
  
  return (
    <Card className="border-0 shadow-none">
      <CardContent className="p-8">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
              {label}
            </div>
            <Icon className={`w-4 h-4 ${highlight ? "text-primary" : "text-muted-foreground/40"}`} />
          </div>
          <div className="text-5xl font-light tracking-tight font-mono">{value}</div>
          {subvalue && (
            <div className="text-sm text-muted-foreground font-light">
              {subvalue}
            </div>
          )}
          {auxiliaryText && trendDirection && (
            <div className={`flex items-center gap-1.5 text-xs font-light ${trendColor}`}>
              <TrendIcon className="w-3.5 h-3.5" />
              <span>{auxiliaryText}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
