import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { requireAuth, getUserId } from "./middleware/auth.js";
import { storage } from "./storage.js";
import { tankFarmScraper } from "./services/tankfarm-scraper.js";
import { taskScheduler } from "./services/scheduler.js";
import { calculateConsumptionAnalytics, calculateMonthlyStats, calculateDailyConsumption, calculateLast28DaysStats, calculateWeeklyConsumption } from "./utils/cost-calculator.js";
import { insertSettingsSchema } from "./schema.js";

export async function registerRoutes(app: Express): Promise<Server> {
  await taskScheduler.initialize();

  // Settings routes
  app.get("/api/settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
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
      const userId = getUserId(req);
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
      const userId = getUserId(req);
      const reading = await storage.getLatestTankReading(userId);
      res.json(reading || null);
    } catch (error) {
      console.error("Error fetching latest reading:", error);
      res.status(500).json({ error: "Failed to fetch latest reading" });
    }
  });

  // Deliveries routes
  app.get("/api/deliveries", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
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
      const userId = getUserId(req);
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
      const userId = getUserId(req);
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
      const userId = getUserId(req);
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
      const userId = getUserId(req);
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
      const userId = getUserId(req);
      const { startDate, endDate } = req.query;

      const options: any = {};
      if (startDate) options.startDate = new Date(startDate as string);
      if (endDate) options.endDate = new Date(endDate as string);

      const [readings, deliveryList] = await Promise.all([
        storage.getTankReadings(userId, options),
        storage.getDeliveries(userId),
      ]);

      res.json(calculateDailyConsumption(readings, deliveryList));
    } catch (error) {
      console.error("Error calculating daily consumption:", error);
      res.status(500).json({ error: "Failed to calculate daily consumption" });
    }
  });

  app.get("/api/analytics/last-28-days", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
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
      const userId = getUserId(req);
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
