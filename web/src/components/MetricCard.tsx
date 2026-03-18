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
      <CardContent className="p-3 sm:p-8">
        <div className="space-y-1 sm:space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-widest">
              {label}
            </div>
            <Icon className={`w-3 h-3 sm:w-4 sm:h-4 ${highlight ? "text-primary" : "text-muted-foreground/40"}`} />
          </div>
          <div className="text-2xl sm:text-5xl font-light tracking-tight font-mono">{value}</div>
          {subvalue && (
            <div className="text-xs sm:text-sm text-muted-foreground font-light">
              {subvalue}
            </div>
          )}
          {auxiliaryText && trendDirection && (
            <div className={`flex items-center gap-1.5 text-[10px] sm:text-xs font-light ${trendColor}`}>
              <TrendIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>{auxiliaryText}</span>
            </div>
          )}
          {auxiliaryText && !trendDirection && (
            <div className="text-[10px] sm:text-xs text-muted-foreground/70 font-light">
              {auxiliaryText}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
