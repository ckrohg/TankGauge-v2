import { Droplet } from "lucide-react";

interface TankGaugeProps {
  percentage: number;
  gallons: number;
  capacity: number;
  maxRecordedGallons?: number;
}

export default function TankGauge({ percentage, gallons, capacity, maxRecordedGallons }: TankGaugeProps) {
  const MAX_SAFE_FILL = 80; // Propane tanks can only be filled to 80%
  const percentOfMax = (percentage / MAX_SAFE_FILL) * 100; // Normalize to 80% = 100%

  const relativePercent = maxRecordedGallons && maxRecordedGallons > 0
    ? (gallons / maxRecordedGallons) * 100
    : null;

  const getColor = () => {
    if (percentage >= 64) return "text-chart-5"; // 80%+ of safe max = green
    if (percentage >= 40) return "text-chart-3"; // 50%+ of safe max = yellow
    return "text-destructive"; // Below 50% of safe max = red
  };

  // Calculate gauge fill: 80% should fill the entire circle
  const gaugeFill = Math.min(percentOfMax, 100) * 2.64;

  // Relative % arc (lighter, inner ring)
  const relativeGaugeFill = relativePercent !== null
    ? Math.min(relativePercent, 100) * 2.64
    : 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:gap-6">
      <div className="relative w-40 h-40 sm:w-56 sm:h-56 flex items-center justify-center">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`text-center ${getColor()}`}>
            <div className="text-4xl sm:text-6xl font-light tracking-tighter">{percentage}<span className="text-xl sm:text-3xl font-light">%</span></div>
            <div className="text-xs sm:text-sm font-mono text-muted-foreground mt-1 sm:mt-2 font-light">
              {gallons.toFixed(0)} gal
            </div>
            {relativePercent !== null && (
              <div className="text-[10px] sm:text-xs font-mono text-muted-foreground mt-1 font-light opacity-70">
                {relativePercent.toFixed(0)}% of max fill
              </div>
            )}
          </div>
        </div>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Background circle - outer */}
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
          {/* Background circle - inner (relative %) */}
          {relativePercent !== null && (
            <circle
              cx="50"
              cy="50"
              r="34"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-muted"
              opacity="0.1"
            />
          )}
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
          {/* Current level - outer ring (absolute %) */}
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
          {/* Relative % - inner ring */}
          {relativePercent !== null && (
            <circle
              cx="50"
              cy="50"
              r="34"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray={`${relativeGaugeFill} 214`}
              strokeLinecap="round"
              className={getColor()}
              opacity="0.5"
            />
          )}
        </svg>
      </div>
      <div className="text-center space-y-1">
        <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-widest font-medium">Tank Capacity</div>
        <div className="text-base sm:text-lg font-light font-mono">{capacity} gal <span className="text-[10px] sm:text-xs">(80% max)</span></div>
        {maxRecordedGallons && maxRecordedGallons > 0 && (
          <div className="text-xs text-muted-foreground font-mono">
            Max recorded: {maxRecordedGallons.toFixed(0)} gal
          </div>
        )}
      </div>
    </div>
  );
}
