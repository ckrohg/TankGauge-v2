import { Progress } from "@/components/ui/progress";
import { Droplet } from "lucide-react";

interface TankGaugeProps {
  percentage: number;
  gallons: number;
  capacity: number;
}

export default function TankGauge({ percentage, gallons, capacity }: TankGaugeProps) {
  const MAX_SAFE_FILL = 80; // Propane tanks can only be filled to 80%
  const percentOfMax = (percentage / MAX_SAFE_FILL) * 100; // Normalize to 80% = 100%
  
  const getColor = () => {
    if (percentage >= 64) return "text-chart-5"; // 80%+ of safe max = green
    if (percentage >= 40) return "text-chart-3"; // 50%+ of safe max = yellow
    return "text-destructive"; // Below 50% of safe max = red
  };

  // Calculate gauge fill: 80% should fill the entire circle
  const gaugeFill = Math.min(percentOfMax, 100) * 2.64;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative w-56 h-56 flex items-center justify-center">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`text-center ${getColor()}`}>
            <div className="text-6xl font-light tracking-tighter">{percentage}<span className="text-3xl font-light">%</span></div>
            <div className="text-sm font-mono text-muted-foreground mt-2 font-light">
              {gallons.toFixed(0)} gal
            </div>
          </div>
        </div>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-muted"
            opacity="0.15"
          />
          {/* 80% max fill indicator - subtle marker */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="264 264"
            className="text-muted-foreground"
            opacity="0.3"
          />
          {/* Current level */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeDasharray={`${gaugeFill} 264`}
            strokeLinecap="round"
            className={getColor()}
          />
        </svg>
      </div>
      <div className="text-center">
        <div className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Tank Capacity</div>
        <div className="text-lg font-light font-mono mt-1">{capacity} gal <span className="text-xs">(80% max)</span></div>
      </div>
    </div>
  );
}
