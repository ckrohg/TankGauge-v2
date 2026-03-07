// Helper functions for staggered automatic scraping schedules

export type ScheduleWindow = "morning" | "evening" | "afternoon" | "night";

interface ScheduleConfig {
  window: ScheduleWindow;
  offsetMinutes: number;
  seed: number;
}

// Deterministic random number generator using seed
function seededRandom(seed: number): number {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

// Generate schedule configuration for a given frequency
export function generateScheduleConfig(frequency: string, userId: string): ScheduleConfig {
  // Use userId as seed for deterministic randomization
  const seed = parseInt(userId.replace(/\D/g, '').slice(0, 8) || '0', 10);
  
  switch (frequency) {
    case "hourly":
      // Random minute offset 0-59 for hourly scrapes
      return {
        window: "morning", // Not really used for hourly
        offsetMinutes: Math.floor(seededRandom(seed) * 60),
        seed,
      };
      
    case "twice-daily":
      // Random morning (6am-9am) or evening (6pm-9pm) with 180-minute window
      const isMorning = seededRandom(seed) > 0.5;
      return {
        window: isMorning ? "morning" : "evening",
        offsetMinutes: Math.floor(seededRandom(seed + 1) * 180), // 0-179 minutes
        seed,
      };
      
    case "daily":
      // Random time in morning window (6am-9am)
      return {
        window: "morning",
        offsetMinutes: Math.floor(seededRandom(seed) * 180),
        seed,
      };
      
    case "weekly":
      // Random time in morning window (6am-9am) on Sundays
      return {
        window: "morning",
        offsetMinutes: Math.floor(seededRandom(seed) * 180),
        seed,
      };
      
    default:
      // Default to daily morning
      return {
        window: "morning",
        offsetMinutes: Math.floor(seededRandom(seed) * 180),
        seed,
      };
  }
}

// Calculate the actual hour and minute for a given window and offset
export function calculateScheduleTime(window: ScheduleWindow, offsetMinutes: number): { hour: number; minute: number } {
  let baseHour: number;
  
  switch (window) {
    case "morning":
      baseHour = 6; // 6am-9am
      break;
    case "afternoon":
      baseHour = 12; // 12pm-3pm
      break;
    case "evening":
      baseHour = 18; // 6pm-9pm
      break;
    case "night":
      baseHour = 0; // 12am-3am
      break;
    default:
      baseHour = 6;
  }
  
  const totalMinutes = baseHour * 60 + offsetMinutes;
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  
  return { hour, minute };
}

// Calculate next run time for a user based on their settings
export function calculateNextRunTime(
  frequency: string,
  window: ScheduleWindow,
  offsetMinutes: number,
  fromDate: Date = new Date()
): Date {
  const { hour, minute } = calculateScheduleTime(window, offsetMinutes);
  const nextRun = new Date(fromDate);
  
  switch (frequency) {
    case "hourly":
      // Every hour at the specified minute offset
      nextRun.setMinutes(offsetMinutes, 0, 0);
      if (nextRun <= fromDate) {
        nextRun.setHours(nextRun.getHours() + 1);
      }
      break;
      
    case "twice-daily":
      // Either morning or evening based on window
      nextRun.setHours(hour, minute, 0, 0);
      if (nextRun <= fromDate) {
        // If we missed this window, schedule for the other window today or tomorrow
        if (window === "morning") {
          // Switch to evening today
          const { hour: eveningHour, minute: eveningMinute } = calculateScheduleTime("evening", offsetMinutes);
          nextRun.setHours(eveningHour, eveningMinute, 0, 0);
        }
        if (nextRun <= fromDate) {
          // Move to next day's morning
          nextRun.setDate(nextRun.getDate() + 1);
          const { hour: morningHour, minute: morningMinute } = calculateScheduleTime("morning", offsetMinutes);
          nextRun.setHours(morningHour, morningMinute, 0, 0);
        }
      }
      break;
      
    case "daily":
      // Once per day at the specified time
      nextRun.setHours(hour, minute, 0, 0);
      if (nextRun <= fromDate) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      break;
      
    case "weekly":
      // Once per week on Sunday at the specified time
      nextRun.setHours(hour, minute, 0, 0);
      // Find next Sunday
      const daysUntilSunday = (7 - nextRun.getDay()) % 7;
      if (daysUntilSunday > 0) {
        nextRun.setDate(nextRun.getDate() + daysUntilSunday);
      } else if (nextRun <= fromDate) {
        // If it's already Sunday but past the time, move to next Sunday
        nextRun.setDate(nextRun.getDate() + 7);
      }
      break;
      
    default:
      // Default to daily
      nextRun.setHours(hour, minute, 0, 0);
      if (nextRun <= fromDate) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
  }
  
  return nextRun;
}

// Get cron expression for a frequency (for the shared per-frequency cron job)
export function getFrequencyCronExpression(frequency: string): string {
  switch (frequency) {
    case "hourly":
      return "0 * * * *"; // Every hour at minute 0
    case "twice-daily":
      return "*/30 * * * *"; // Every 30 minutes (check for due users)
    case "daily":
      return "*/30 * * * *"; // Every 30 minutes (check for due users)
    case "weekly":
      return "0 * * * 0"; // Every hour on Sunday
    default:
      return "*/30 * * * *"; // Default: check every 30 minutes
  }
}
