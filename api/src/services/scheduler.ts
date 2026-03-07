import cron, { type ScheduledTask } from "node-cron";
import { storage } from "../storage.js";
import { tankFarmScraper } from "./tankfarm-scraper.js";
import type { Settings, InsertTankReading, TankReading } from "../schema.js";
import {
  generateScheduleConfig,
  calculateNextRunTime,
  getFrequencyCronExpression,
  type ScheduleWindow
} from "../utils/schedule-helpers.js";

interface ScheduledUser {
  userId: string;
  settingsId: string;
  frequency: string;
  window: ScheduleWindow;
  offsetMinutes: number;
  nextRunTime: Date;
}

export class TaskScheduler {
  private cronTasks: Map<string, ScheduledTask> = new Map();
  private userSchedules: ScheduledUser[] = [];
  private isCheckingDueUsers: boolean = false; // Mutex to prevent overlapping cron checks
  private activeScrapingUsers: Set<string> = new Set(); // Track users currently being scraped

  async initialize(): Promise<void> {
    console.log("=".repeat(80));
    console.log("[SCHEDULER] INITIALIZING AUTOMATIC PER-USER SCRAPING");
    console.log("=".repeat(80));
    
    // Load all user settings and build schedule queue
    await this.loadAllUserSchedules();
    
    // Start per-frequency cron jobs
    this.startFrequencyCrons();
    
    console.log("=".repeat(80));
    console.log(`[SCHEDULER] ✅ INITIALIZED WITH ${this.userSchedules.length} USER SCHEDULES`);
    console.log("=".repeat(80));
    
    // Catch up on overdue scrapes in the background (don't block server startup)
    // This runs after a short delay to let the server fully start
    setTimeout(() => {
      this.runCatchUpScrapes().catch(err => {
        console.error("[SCHEDULER] Error in catch-up scrapes:", err);
      });
    }, 5000); // 5 second delay before starting catch-up
  }

  private async loadAllUserSchedules(): Promise<void> {
    try {
      // Get all settings from database
      const allSettings = await storage.getAllSettings();
      
      const schedules: ScheduledUser[] = [];
      
      for (const settings of allSettings) {
        if (!settings.scrapingFrequency) continue;
        
        const { userId, id: settingsId, scrapingFrequency, scheduleWindow, scheduleOffsetMinutes, scheduleSeed } = settings;
        
        let window: ScheduleWindow;
        let offsetMinutes: number;
        let seed: number;
        
        // Sanitize and validate schedule metadata
        const offsetValue = scheduleOffsetMinutes !== null && scheduleOffsetMinutes !== undefined 
          ? Number(scheduleOffsetMinutes) 
          : NaN;
        const seedValue = scheduleSeed !== null && scheduleSeed !== undefined
          ? Number(scheduleSeed)
          : NaN;
        
        const needsRegeneration = !scheduleWindow 
          || isNaN(offsetValue) 
          || isNaN(seedValue)
          || offsetValue < 0;
        
        if (needsRegeneration) {
          // Generate new deterministic schedule
          const config = generateScheduleConfig(scrapingFrequency, userId);
          window = config.window;
          offsetMinutes = config.offsetMinutes;
          seed = config.seed;
          
          // Save to database for restart safety
          console.log(`[Scheduler] Regenerating schedule metadata for user ${userId}: window=${window}, offset=${offsetMinutes}`);
          await storage.updateSettings(settingsId, userId, {
            scheduleWindow: window,
            scheduleOffsetMinutes: offsetMinutes,
            scheduleSeed: seed,
          });
        } else {
          // Use stored values with type coercion
          window = scheduleWindow as ScheduleWindow;
          offsetMinutes = offsetValue;
          seed = seedValue;
        }
        
        // Calculate next run time
        const nextRunTime = calculateNextRunTime(
          scrapingFrequency,
          window,
          offsetMinutes
        );
        
        // Guard against invalid dates before adding to queue
        if (!nextRunTime || isNaN(nextRunTime.getTime())) {
          console.error(`[Scheduler] Invalid nextRunTime for user ${userId}, skipping. Frequency: ${scrapingFrequency}, window: ${window}, offset: ${offsetMinutes}`);
          continue;
        }
        
        schedules.push({
          userId,
          settingsId,
          frequency: scrapingFrequency,
          window,
          offsetMinutes,
          nextRunTime,
        });
      }
      
      // Sort by next run time (priority queue)
      this.userSchedules = schedules.sort((a: ScheduledUser, b: ScheduledUser) => 
        a.nextRunTime.getTime() - b.nextRunTime.getTime()
      );
        
      console.log(`[SCHEDULER] Loaded ${this.userSchedules.length} user schedules`);
      
      // Log each schedule for visibility
      for (const schedule of this.userSchedules) {
        console.log(`[SCHEDULER] User ${schedule.userId}: ${schedule.frequency} at ${schedule.nextRunTime.toISOString()} (${schedule.window} + ${schedule.offsetMinutes}min)`);
      }
    } catch (error) {
      console.error("[Scheduler] Error loading user schedules:", error);
      this.userSchedules = [];
    }
  }

  private startFrequencyCrons(): void {
    // Use a SINGLE cron job that runs every 30 minutes to check all due users
    // This prevents multiple overlapping cron triggers from spamming the logs
    const cronExpression = "*/30 * * * *"; // Every 30 minutes
    
    const task = cron.schedule(cronExpression, async () => {
      console.log(`[SCHEDULER] 🔔 Running periodic check...`);
      
      // First run catch-up for any overdue users
      try {
        await this.runCatchUpScrapes();
      } catch (err) {
        console.error("[SCHEDULER] Error in periodic catch-up:", err);
      }
      
      // Then check for users due at their scheduled time
      await this.checkAndRunDueUsers();
    });
    
    this.cronTasks.set("main", task);
    console.log(`[SCHEDULER] ✅ Started scheduler cron: ${cronExpression} (checks every 30 minutes)`);
  }

  private async checkAndRunDueUsers(): Promise<void> {
    // Prevent overlapping checks from multiple cron triggers
    if (this.isCheckingDueUsers) {
      console.log(`[Scheduler] Skipping - another check is already in progress`);
      return;
    }
    
    this.isCheckingDueUsers = true;
    
    try {
      const now = new Date();
      const dueUsers: ScheduledUser[] = [];
      
      // Find all users whose next run time has passed
      for (const schedule of this.userSchedules) {
        // Skip invalid dates (defensive check)
        if (!schedule.nextRunTime || isNaN(schedule.nextRunTime.getTime())) {
          console.error(`[Scheduler] Skipping user ${schedule.userId} with invalid nextRunTime`);
          continue;
        }
        
        // Skip users who are already being scraped
        if (this.activeScrapingUsers.has(schedule.userId)) {
          console.log(`[Scheduler] Skipping user ${schedule.userId} - scrape already in progress`);
          continue;
        }
        
        // Check if user has credentials (pre-flight check)
        const settings = await storage.getSettings(schedule.userId);
        if (!settings?.tankfarmUsername || !settings?.tankfarmPassword) {
          // User has no credentials - skip silently and update their next run time
          schedule.nextRunTime = calculateNextRunTime(
            schedule.frequency,
            schedule.window,
            schedule.offsetMinutes,
            now
          );
          continue;
        }
        
        if (schedule.nextRunTime <= now) {
          dueUsers.push(schedule);
        } else {
          // Since array is sorted by valid times, break when we hit a future time
          break;
        }
      }
      
      if (dueUsers.length === 0) {
        return;
      }
      
      console.log(`[Scheduler] Found ${dueUsers.length} users due for scraping`);
      
      // Run scrapes sequentially with delay to avoid overwhelming system
      for (const schedule of dueUsers) {
        // Double-check user isn't being scraped (race condition protection)
        if (this.activeScrapingUsers.has(schedule.userId)) {
          console.log(`[Scheduler] Skipping user ${schedule.userId} - scrape started while queued`);
          continue;
        }
        
        try {
          console.log(`[Scheduler] Running scheduled scrape for user ${schedule.userId}`);
          
          await this.runScrapeTask(schedule.userId);
          
          // Longer delay between scrapes to let browser stabilize (2 seconds)
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`[Scheduler] Error scraping for user ${schedule.userId}:`, error);
          // Wait longer after errors (3 seconds)
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // Update next run time
        schedule.nextRunTime = calculateNextRunTime(
          schedule.frequency,
          schedule.window,
          schedule.offsetMinutes,
          now
        );
      }
      
      // Re-sort the schedule queue
      this.userSchedules.sort((a, b) => a.nextRunTime.getTime() - b.nextRunTime.getTime());
    } finally {
      this.isCheckingDueUsers = false;
    }
  }

  /**
   * Catch-up logic: Run overdue scrapes on startup
   * If a user's last scrape was more than their schedule window ago, run immediately
   */
  private async runCatchUpScrapes(): Promise<void> {
    console.log("[SCHEDULER] 🔍 Checking for overdue scrapes...");
    const now = new Date();
    const catchUpUsers: ScheduledUser[] = [];
    
    for (const schedule of this.userSchedules) {
      const settings = await storage.getSettings(schedule.userId);
      if (!settings) continue;
      
      // Skip users without valid tankfarm credentials (they'll just fail anyway)
      if (!settings.tankfarmUsername || !settings.tankfarmPassword) {
        continue; // Silently skip - no credentials configured
      }
      
      const lastScrapedAt = settings.lastScrapedAt;
      if (!lastScrapedAt) {
        // Never scraped before - run immediately
        console.log(`[SCHEDULER] User ${schedule.userId} has never been scraped, adding to catch-up queue`);
        catchUpUsers.push(schedule);
        continue;
      }
      
      // Calculate how long it's been since last scrape
      const hoursSinceLastScrape = (now.getTime() - lastScrapedAt.getTime()) / (1000 * 60 * 60);
      
      // Define "overdue" thresholds based on frequency (tightened for reliability)
      let overdueThresholdHours: number;
      switch (schedule.frequency) {
        case 'hourly':
          overdueThresholdHours = 1.5; // More than 1.5 hours overdue
          break;
        case 'twice-daily':
          overdueThresholdHours = 14; // More than 14 hours overdue (was 18)
          break;
        case 'daily':
          overdueThresholdHours = 26; // More than 26 hours overdue (was 30)
          break;
        case 'weekly':
          overdueThresholdHours = 168 + 12; // More than 7.5 days overdue
          break;
        default:
          overdueThresholdHours = 24;
      }
      
      // Check if scheduled window was missed (nextRunTime is in the past)
      const missedWindow = schedule.nextRunTime < now;
      
      if (hoursSinceLastScrape > overdueThresholdHours) {
        console.log(`[SCHEDULER] User ${schedule.userId} is overdue (${hoursSinceLastScrape.toFixed(1)}h since last scrape, threshold: ${overdueThresholdHours}h)`);
        catchUpUsers.push(schedule);
      } else if (missedWindow) {
        console.log(`[SCHEDULER] User ${schedule.userId} missed their window (scheduled: ${schedule.nextRunTime.toISOString()}, now: ${now.toISOString()})`);
        catchUpUsers.push(schedule);
      } else {
        console.log(`[SCHEDULER] User ${schedule.userId} is on track (${hoursSinceLastScrape.toFixed(1)}h since last scrape, next: ${schedule.nextRunTime.toISOString()})`);
      }
    }
    
    if (catchUpUsers.length === 0) {
      console.log("[SCHEDULER] ✓ No overdue scrapes found");
      return;
    }
    
    console.log(`[SCHEDULER] Found ${catchUpUsers.length} overdue users, running catch-up scrapes...`);
    
    // Run catch-up scrapes with delays
    for (const schedule of catchUpUsers) {
      try {
        console.log(`[SCHEDULER] Running catch-up scrape for user ${schedule.userId}`);
        await this.runScrapeTask(schedule.userId);
        
        // Update next run time after successful catch-up
        schedule.nextRunTime = calculateNextRunTime(
          schedule.frequency,
          schedule.window,
          schedule.offsetMinutes,
          now
        );
        
        // Delay between catch-up scrapes (2 seconds)
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`[SCHEDULER] Error in catch-up scrape for user ${schedule.userId}:`, error);
        
        // Wait longer after errors to allow browser recovery
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // Re-sort the schedule queue after catch-up
    this.userSchedules.sort((a, b) => a.nextRunTime.getTime() - b.nextRunTime.getTime());
    console.log("[SCHEDULER] ✓ Catch-up scrapes complete");
  }

  async rescheduleUser(userId: string): Promise<void> {
    console.log(`[Scheduler] Rescheduling user ${userId}`);
    
    // Remove user from schedule
    this.userSchedules = this.userSchedules.filter(s => s.userId !== userId);
    
    // Get updated settings
    const settings = await storage.getSettings(userId);
    if (!settings || !settings.scrapingFrequency) {
      console.log(`[Scheduler] User ${userId} has no frequency set, removing from schedule`);
      return;
    }
    
    // Sanitize and validate schedule metadata
    let window: ScheduleWindow;
    let offsetMinutes: number;
    let seed: number;
    
    const offsetValue = settings.scheduleOffsetMinutes !== null && settings.scheduleOffsetMinutes !== undefined 
      ? Number(settings.scheduleOffsetMinutes) 
      : NaN;
    const seedValue = settings.scheduleSeed !== null && settings.scheduleSeed !== undefined
      ? Number(settings.scheduleSeed)
      : NaN;
    
    const needsRegeneration = !settings.scheduleWindow 
      || isNaN(offsetValue) 
      || isNaN(seedValue)
      || offsetValue < 0;
    
    if (needsRegeneration) {
      // Generate new deterministic schedule
      const config = generateScheduleConfig(settings.scrapingFrequency, userId);
      window = config.window;
      offsetMinutes = config.offsetMinutes;
      seed = config.seed;
      
      // Save to database for restart safety
      console.log(`[Scheduler] Regenerating schedule metadata for user ${userId}: window=${window}, offset=${offsetMinutes}`);
      await storage.updateSettings(settings.id, userId, {
        scheduleWindow: window,
        scheduleOffsetMinutes: offsetMinutes,
        scheduleSeed: seed,
      });
    } else {
      // Use existing stored values with type coercion
      window = settings.scheduleWindow as ScheduleWindow;
      offsetMinutes = offsetValue;
      seed = seedValue;
    }
    
    // Calculate next run time based on stored/generated schedule
    const nextRunTime = calculateNextRunTime(
      settings.scrapingFrequency,
      window,
      offsetMinutes
    );
    
    // Guard against invalid dates
    if (!nextRunTime || isNaN(nextRunTime.getTime())) {
      console.error(`[Scheduler] Invalid nextRunTime for user ${userId} during reschedule, cannot add to queue`);
      return;
    }
    
    // Add back to schedule
    this.userSchedules.push({
      userId,
      settingsId: settings.id,
      frequency: settings.scrapingFrequency,
      window,
      offsetMinutes,
      nextRunTime,
    });
    
    // Re-sort priority queue
    this.userSchedules.sort((a: ScheduledUser, b: ScheduledUser) => 
      a.nextRunTime.getTime() - b.nextRunTime.getTime()
    );
    
    console.log(`[Scheduler] User ${userId} rescheduled for ${nextRunTime.toISOString()} (window: ${window}, offset: ${offsetMinutes})`);
  }


  async runScrapeTask(userId: string): Promise<void> {
    // Check if this user is already being scraped (prevent concurrent scrapes)
    if (this.activeScrapingUsers.has(userId)) {
      console.log(`[Scheduler] User ${userId}: Scrape already in progress, skipping duplicate request`);
      throw new Error("A scrape is already in progress for this account. Please wait and try again.");
    }
    
    // Mark user as being scraped
    this.activeScrapingUsers.add(userId);
    
    // Get settings outside try block so it's available in catch for failure tracking
    const settings = await storage.getSettings(userId);
    
    try {
      console.log(`[Scheduler] ========== SCRAPE TASK START for user ${userId} ==========`);
      
      // Get user's tankfarm credentials from settings (no global fallback)
      const username = settings?.tankfarmUsername;
      const password = settings?.tankfarmPassword;

      if (!username || !password) {
        console.warn(`[Scheduler] User ${userId}: No tankfarm credentials configured, using mock data`);
      }

      // Get the last reading for timestamp-based deduplication
      const latestReading = await storage.getLatestTankReading(userId);

      if (latestReading) {
        console.log(`[Scheduler] User ${userId}: Last reading from ${latestReading.scrapedAt.toISOString()} with tankfarm update: ${latestReading.tankfarmLastUpdate?.toISOString() || 'null'}`);
      } else {
        console.log(`[Scheduler] User ${userId}: No previous readings found, will save new data`);
      }

      // Always scrape to get fresh data
      console.log(`[Scheduler] User ${userId}: Calling tankFarmScraper.scrapeTankData()...`);
      const data = await tankFarmScraper.scrapeTankData(
        username || "", 
        password || ""
      );
      console.log(`[Scheduler] User ${userId}: Scraper returned:`, data ? 'DATA RECEIVED' : 'NULL');

      // Null check (though scraper should always return data now)
      if (!data) {
        console.error(`[Scheduler] User ${userId}: Scraper returned null (unexpected). Skipping save. THIS IS A BUG!`);
        return;
      }
      
      console.log(`[Scheduler] User ${userId}: Data structure check - tankReading:`, !!data.tankReading, 'deliveries:', data.deliveries?.length || 0, 'payments:', data.payments?.length || 0);

      // Timestamp-only deduplication: skip only if tankfarmLastUpdate is exactly the same
      // This allows capturing market price changes even when tank level is unchanged
      if (latestReading?.tankfarmLastUpdate && data.tankReading.tankfarmLastUpdate) {
        const lastUpdateTime = latestReading.tankfarmLastUpdate.getTime();
        const newUpdateTime = new Date(data.tankReading.tankfarmLastUpdate).getTime();
        
        if (lastUpdateTime === newUpdateTime) {
          console.log(`[Scheduler] User ${userId}: tankfarm_last_update unchanged (${latestReading.tankfarmLastUpdate.toISOString()}). Skipping duplicate.`);
          return;
        } else {
          console.log(`[Scheduler] User ${userId}: tankfarm_last_update changed from ${latestReading.tankfarmLastUpdate.toISOString()} to ${new Date(data.tankReading.tankfarmLastUpdate).toISOString()}`);
        }
      } else {
        console.log(`[Scheduler] User ${userId}: No previous timestamp or missing new timestamp, treating as new data`);
      }

      console.log(`[Scheduler] User ${userId}: ✓ Deduplication passed, proceeding to save...`);
      console.log(`[Scheduler] User ${userId}: Tank reading to save:`, JSON.stringify(data.tankReading, null, 2));
      
      // Save tank reading
      console.log(`[Scheduler] User ${userId}: Calling storage.createTankReading()...`);
      const savedReading = await storage.createTankReading(data.tankReading, userId);
      console.log(`[Scheduler] User ${userId}: ✓ Tank reading saved successfully! ID:`, savedReading.id);

      // Save deliveries if available (handles duplicates via upsert)
      if (data.deliveries && data.deliveries.length > 0) {
        console.log(`[Scheduler] User ${userId}: Saving ${data.deliveries.length} deliveries...`);
        for (const delivery of data.deliveries) {
          await storage.upsertDelivery(delivery, userId);
        }
      }

      // Save payments if available (handles duplicates via upsert)
      if (data.payments && data.payments.length > 0) {
        console.log(`[Scheduler] User ${userId}: Saving ${data.payments.length} payments...`);
        for (const payment of data.payments) {
          await storage.upsertPayment(payment, userId);
        }
      }

      // Update last scraped timestamp only after successful save
      if (settings) {
        await storage.updateLastScrapedAt(settings.id, userId);
        // Reset failure counter on success
        await storage.resetScrapeFailures(settings.id, userId);
      }

      console.log(`[Scheduler] ========== SCRAPE TASK COMPLETE for user ${userId} ==========`);
    } catch (error) {
      console.error(`[Scheduler] ========== SCRAPE TASK FAILED for user ${userId} ==========`);
      
      // Classify the error type
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isInfrastructureError = errorMessage.includes('EIO') || 
                                    errorMessage.includes('spawn') ||
                                    errorMessage.includes('browser') ||
                                    errorMessage.includes('ENOENT') ||
                                    errorMessage.includes('EACCES');
      
      // Record the failure for tracking
      if (settings) {
        await storage.recordScrapeFailure(settings.id, userId, errorMessage);
        
        // Extra loud logging for infrastructure issues
        if (isInfrastructureError) {
          console.error(`[SCHEDULER] ⚠️⚠️⚠️ INFRASTRUCTURE FAILURE for user ${userId} ⚠️⚠️⚠️`);
          console.error(`[SCHEDULER] Error type: ${errorMessage.substring(0, 100)}`);
          console.error(`[SCHEDULER] This usually means the VM needs to be restarted. Consider republishing the app.`);
        }
      }
      
      console.error(`[Scheduler] User ${userId}: Error in scrape task:`, error);
      
      // The forceReset is now guarded by the scrapeInProgress lock in TankFarmScraper
      // It will only reset if no other scrape is in progress
      try {
        await tankFarmScraper.forceReset();
        console.log(`[Scheduler] User ${userId}: Browser reset requested after failure`);
      } catch (resetError) {
        console.warn(`[Scheduler] User ${userId}: Browser reset failed:`, resetError);
      }
      
      throw error;
    } finally {
      // Always clean up the active scraping set
      this.activeScrapingUsers.delete(userId);
    }
  }

  stop(): void {
    const entries = Array.from(this.cronTasks.entries());
    for (const [frequency, task] of entries) {
      task.stop();
      console.log(`[Scheduler] Stopped ${frequency} cron`);
    }
    this.cronTasks.clear();
    this.userSchedules = [];
  }
}

export const taskScheduler = new TaskScheduler();
