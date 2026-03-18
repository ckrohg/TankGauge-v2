import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { requireAuth, getUserId, getUserEmail } from "./middleware/auth.js";
import { storage } from "./storage.js";
import { tankFarmScraper } from "./services/tankfarm-scraper.js";
import { taskScheduler } from "./services/scheduler.js";
import { calculateConsumptionAnalytics, calculateMonthlyStats, calculateDailyConsumption, calculateDailyConsumptionFilled, calculateLast28DaysStats, calculateWeeklyConsumption } from "./utils/cost-calculator.js";
import { insertSettingsSchema, insertTankShareSchema } from "./schema.js";

// Resolve the effective data owner: the user's own ID, or the shared owner's ID
// if the user has no own settings but is shared on someone's tank.
async function getEffectiveUserId(userId: string): Promise<string> {
  const ownSettings = await storage.getSettings(userId);
  if (ownSettings?.tankfarmUsername) return userId; // has own tank configured
  const sharedOwnerIds = await storage.getActiveShareOwnerIds(userId);
  return sharedOwnerIds.length > 0 ? sharedOwnerIds[0] : userId;
}

export async function registerRoutes(app: Express): Promise<Server> {
  await taskScheduler.initialize();

  // Settings routes
  app.get("/api/settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const userEmail = getUserEmail(req);

      // Activate any pending shares for this user's email
      if (userEmail) {
        await storage.activateShareByEmail(userEmail.toLowerCase(), userId);
      }

      let userSettings = await storage.getSettings(userId);

      if (!userSettings) {
        userSettings = await storage.createSettings({ scrapingFrequency: "twice-daily" }, userId);
        await taskScheduler.rescheduleUser(userId);
      }

      res.json(userSettings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.put("/api/settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const validatedData = insertSettingsSchema.parse(req.body);

      const existing = await storage.getSettings(userId);
      let updated;

      if (existing) {
        updated = await storage.updateSettings(existing.id, userId, validatedData);
        if (validatedData.scrapingFrequency) {
          await taskScheduler.rescheduleUser(userId);
        }
      } else {
        updated = await storage.createSettings(validatedData, userId);
        await taskScheduler.rescheduleUser(userId);
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(400).json({ error: "Failed to update settings" });
    }
  });

  // Tank readings routes
  app.get("/api/readings", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = await getEffectiveUserId(getUserId(req));
      const { startDate, endDate, limit } = req.query;

      const options: any = {};
      if (startDate) options.startDate = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setDate(end.getDate() + 1);
        options.endDate = end;
      }
      if (limit) options.limit = parseInt(limit as string);

      const readings = await storage.getTankReadings(userId, options);
      res.json(readings);
    } catch (error) {
      console.error("Error fetching readings:", error);
      res.status(500).json({ error: "Failed to fetch readings" });
    }
  });

  app.get("/api/readings/latest", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = await getEffectiveUserId(getUserId(req));
      const reading = await storage.getLatestTankReading(userId);
      res.json(reading || null);
    } catch (error) {
      console.error("Error fetching latest reading:", error);
      res.status(500).json({ error: "Failed to fetch latest reading" });
    }
  });

  app.get("/api/readings/max-gallons", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = await getEffectiveUserId(getUserId(req));
      const maxGallons = await storage.getMaxRecordedGallons(userId);
      res.json({ maxGallons });
    } catch (error) {
      console.error("Error fetching max gallons:", error);
      res.status(500).json({ error: "Failed to fetch max gallons" });
    }
  });

  // Deliveries routes
  app.get("/api/deliveries", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = await getEffectiveUserId(getUserId(req));
      const { startDate, endDate, limit } = req.query;

      const options: any = {};
      if (startDate) options.startDate = new Date(startDate as string);
      if (endDate) options.endDate = new Date(endDate as string);
      if (limit) options.limit = parseInt(limit as string);

      const result = await storage.getDeliveries(userId, options);
      res.json(result);
    } catch (error) {
      console.error("Error fetching deliveries:", error);
      res.status(500).json({ error: "Failed to fetch deliveries" });
    }
  });

  app.get("/api/deliveries/latest", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = await getEffectiveUserId(getUserId(req));
      const delivery = await storage.getLatestDelivery(userId);
      res.json(delivery || null);
    } catch (error) {
      console.error("Error fetching latest delivery:", error);
      res.status(500).json({ error: "Failed to fetch latest delivery" });
    }
  });

  // Payments routes
  app.get("/api/payments", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = await getEffectiveUserId(getUserId(req));
      const { startDate, endDate, limit } = req.query;

      const options: any = {};
      if (startDate) options.startDate = new Date(startDate as string);
      if (endDate) options.endDate = new Date(endDate as string);
      if (limit) options.limit = parseInt(limit as string);

      const result = await storage.getPayments(userId, options);
      res.json(result);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  // Analytics routes
  app.get("/api/analytics", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = await getEffectiveUserId(getUserId(req));
      const { startDate, endDate } = req.query;

      const options: any = {};
      if (startDate) options.startDate = new Date(startDate as string);
      if (endDate) options.endDate = new Date(endDate as string);

      const [readings, deliveryList] = await Promise.all([
        storage.getTankReadings(userId, options),
        storage.getDeliveries(userId),
      ]);

      const analytics = calculateConsumptionAnalytics(readings, deliveryList);
      res.json(analytics || {
        dailyAverage: 0, weeklyAverage: 0, monthlyAverage: 0,
        estimatedDaysUntilEmpty: 0, costSinceLastDelivery: 0, avgCostPerDay: 0,
      });
    } catch (error) {
      console.error("Error calculating analytics:", error);
      res.status(500).json({ error: "Failed to calculate analytics" });
    }
  });

  app.get("/api/analytics/monthly", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = await getEffectiveUserId(getUserId(req));
      const { startDate, endDate } = req.query;

      const options: any = {};
      if (startDate) options.startDate = new Date(startDate as string);
      if (endDate) options.endDate = new Date(endDate as string);

      const [readings, deliveryList] = await Promise.all([
        storage.getTankReadings(userId, options),
        storage.getDeliveries(userId),
      ]);

      res.json(calculateMonthlyStats(readings, deliveryList));
    } catch (error) {
      console.error("Error calculating monthly stats:", error);
      res.status(500).json({ error: "Failed to calculate monthly stats" });
    }
  });

  app.get("/api/analytics/daily", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = await getEffectiveUserId(getUserId(req));
      const { startDate, endDate } = req.query;

      const options: any = {};
      if (startDate) options.startDate = new Date(startDate as string);
      if (endDate) options.endDate = new Date(endDate as string);

      const [readings, deliveryList] = await Promise.all([
        storage.getTankReadings(userId, options),
        storage.getDeliveries(userId),
      ]);

      res.json(calculateDailyConsumptionFilled(readings, deliveryList));
    } catch (error) {
      console.error("Error calculating daily consumption:", error);
      res.status(500).json({ error: "Failed to calculate daily consumption" });
    }
  });

  app.get("/api/analytics/last-28-days", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = await getEffectiveUserId(getUserId(req));
      const [readings, deliveryList] = await Promise.all([
        storage.getTankReadings(userId),
        storage.getDeliveries(userId),
      ]);

      res.json(calculateLast28DaysStats(readings, deliveryList));
    } catch (error) {
      console.error("Error calculating last 28 days stats:", error);
      res.status(500).json({ error: "Failed to calculate last 28 days stats" });
    }
  });

  app.get("/api/analytics/weekly", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = await getEffectiveUserId(getUserId(req));
      const { startDate, endDate } = req.query;

      const options: any = {};
      if (startDate) options.startDate = new Date(startDate as string);
      if (endDate) options.endDate = new Date(endDate as string);

      const [readings, deliveryList] = await Promise.all([
        storage.getTankReadings(userId, options),
        storage.getDeliveries(userId),
      ]);

      res.json(calculateWeeklyConsumption(readings, deliveryList));
    } catch (error) {
      console.error("Error calculating weekly consumption:", error);
      res.status(500).json({ error: "Failed to calculate weekly consumption" });
    }
  });

  // Tank sharing routes
  app.get("/api/shares", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const ownShares = await storage.getTankSharesByOwner(userId);
      const sharedWithMe = await storage.getTankSharesForUser(userId);
      res.json({ ownShares, sharedWithMe });
    } catch (error) {
      console.error("Error fetching shares:", error);
      res.status(500).json({ error: "Failed to fetch shares" });
    }
  });

  app.post("/api/shares", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const userEmail = getUserEmail(req);
      const { sharedEmail } = insertTankShareSchema.parse(req.body);

      if (sharedEmail.toLowerCase() === userEmail?.toLowerCase()) {
        return res.status(400).json({ error: "You cannot invite yourself" });
      }

      const share = await storage.createTankShare(userId, sharedEmail.toLowerCase());

      // Send invite email via Supabase Auth
      try {
        const { supabaseAdmin } = await import("./middleware/auth.js");
        await supabaseAdmin.auth.admin.inviteUserByEmail(sharedEmail.toLowerCase(), {
          redirectTo: `${process.env.CORS_ORIGINS?.split(",")[0] || "https://tankguage.vercel.app"}`,
        });
        console.log(`[Shares] Invite email sent to ${sharedEmail}`);
      } catch (emailErr: any) {
        // User may already exist — that's fine, share still works
        console.log(`[Shares] Invite email skipped for ${sharedEmail}: ${emailErr?.message}`);
      }

      res.json(share);
    } catch (error: any) {
      console.error("Error creating share:", error);
      if (error?.code === "23505") {
        return res.status(400).json({ error: "This email has already been invited" });
      }
      res.status(400).json({ error: "Failed to create share" });
    }
  });

  app.delete("/api/shares/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const share = await storage.revokeTankShare(req.params.id, userId);
      if (!share) {
        return res.status(404).json({ error: "Share not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error revoking share:", error);
      res.status(500).json({ error: "Failed to revoke share" });
    }
  });

  // Manual scrape trigger
  app.post("/api/scrape", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      console.log("[API] Manual scrape triggered for user:", userId);
      await taskScheduler.runScrapeTask(userId);
      res.json({ success: true, message: "Scrape completed successfully" });
    } catch (error: any) {
      console.error("Error running scrape task:", error);

      let errorMessage = "Failed to refresh tank data. Please try again.";
      if (error?.message?.includes("browser")) {
        errorMessage = "Browser initialization failed. Our team has been notified.";
      } else if (error?.message?.includes("login") || error?.message?.includes("credentials")) {
        errorMessage = "Login failed. Please check your tankfarm.io credentials in Settings.";
      } else if (error?.message?.includes("timeout")) {
        errorMessage = "Request timed out. The tankfarm.io site may be slow. Please try again.";
      }

      res.status(500).json({ error: errorMessage, details: error?.message || "Unknown error" });
    }
  });

  const httpServer = createServer(app);

  process.on("SIGTERM", async () => {
    console.log("[Server] Shutting down...");
    taskScheduler.stop();
    await tankFarmScraper.close();
    httpServer.close();
  });

  return httpServer;
}
