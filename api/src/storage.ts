import { db } from "./db.js";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import {
  settings,
  tankReadings,
  deliveries,
  payments,
  type Settings,
  type InsertSettings,
  type TankReading,
  type InsertTankReading,
  type Delivery,
  type InsertDelivery,
  type Payment,
  type InsertPayment,
} from "./schema.js";

export class DbStorage {
  // Settings
  async getSettings(userId: string): Promise<Settings | undefined> {
    const result = await db
      .select()
      .from(settings)
      .where(eq(settings.userId, userId))
      .limit(1);
    return result[0];
  }

  async getAllSettings(): Promise<Settings[]> {
    return await db.select().from(settings);
  }

  async createSettings(newSettings: InsertSettings, userId: string): Promise<Settings> {
    const result = await db
      .insert(settings)
      .values({ ...newSettings, userId })
      .returning();
    return result[0];
  }

  async updateSettings(id: string, userId: string, updates: Partial<Record<string, any>>): Promise<Settings | undefined> {
    const result = await db
      .update(settings)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(settings.id, id), eq(settings.userId, userId)))
      .returning();
    return result[0];
  }

  async updateLastScrapedAt(id: string, userId: string): Promise<void> {
    await db
      .update(settings)
      .set({ lastScrapedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(settings.id, id), eq(settings.userId, userId)));
  }

  async recordScrapeFailure(id: string, userId: string, reason: string): Promise<void> {
    const current = await this.getSettings(userId);
    const newCount = (current?.consecutiveFailures || 0) + 1;

    await db
      .update(settings)
      .set({
        consecutiveFailures: newCount,
        lastFailureReason: reason,
        lastFailureAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(settings.id, id), eq(settings.userId, userId)));

    if (reason.includes('EIO') || reason.includes('spawn') || reason.includes('browser')) {
      console.error(`[STORAGE] INFRASTRUCTURE ERROR for user ${userId}: ${reason} (failure #${newCount})`);
    }
  }

  async resetScrapeFailures(id: string, userId: string): Promise<void> {
    await db
      .update(settings)
      .set({
        consecutiveFailures: 0,
        lastFailureReason: null,
        updatedAt: new Date(),
      })
      .where(and(eq(settings.id, id), eq(settings.userId, userId)));
  }

  // Tank Readings
  async getTankReadings(userId: string, options?: { startDate?: Date; endDate?: Date; limit?: number }): Promise<TankReading[]> {
    const conditions = [eq(tankReadings.userId, userId)];
    if (options?.startDate) conditions.push(gte(tankReadings.scrapedAt, options.startDate));
    if (options?.endDate) conditions.push(lte(tankReadings.scrapedAt, options.endDate));

    return await db
      .select()
      .from(tankReadings)
      .where(and(...conditions))
      .orderBy(desc(tankReadings.scrapedAt))
      .limit(options?.limit || 1000);
  }

  async getMaxRecordedGallons(userId: string): Promise<number> {
    const result = await db
      .select()
      .from(tankReadings)
      .where(eq(tankReadings.userId, userId))
      .orderBy(desc(tankReadings.remainingGallons))
      .limit(1);
    return result[0] ? parseFloat(result[0].remainingGallons) : 0;
  }

  async getLatestTankReading(userId: string): Promise<TankReading | undefined> {
    const result = await db
      .select()
      .from(tankReadings)
      .where(eq(tankReadings.userId, userId))
      .orderBy(desc(tankReadings.scrapedAt))
      .limit(1);
    return result[0];
  }

  async createTankReading(reading: InsertTankReading, userId: string): Promise<TankReading> {
    const result = await db
      .insert(tankReadings)
      .values({ ...reading, userId })
      .returning();
    return result[0];
  }

  // Deliveries
  async getDeliveries(userId: string, options?: { startDate?: Date; endDate?: Date; limit?: number }): Promise<Delivery[]> {
    const conditions = [eq(deliveries.userId, userId)];
    if (options?.startDate) conditions.push(gte(deliveries.deliveryDate, options.startDate));
    if (options?.endDate) conditions.push(lte(deliveries.deliveryDate, options.endDate));

    return await db
      .select()
      .from(deliveries)
      .where(and(...conditions))
      .orderBy(desc(deliveries.deliveryDate))
      .limit(options?.limit || 1000);
  }

  async getLatestDelivery(userId: string): Promise<Delivery | undefined> {
    const result = await db
      .select()
      .from(deliveries)
      .where(eq(deliveries.userId, userId))
      .orderBy(desc(deliveries.deliveryDate))
      .limit(1);
    return result[0];
  }

  async createDelivery(delivery: InsertDelivery, userId: string): Promise<Delivery> {
    const result = await db
      .insert(deliveries)
      .values({ ...delivery, userId })
      .returning();
    return result[0];
  }

  async upsertDelivery(delivery: InsertDelivery, userId: string): Promise<Delivery> {
    const existing = await db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.userId, userId),
          eq(deliveries.deliveryDate, delivery.deliveryDate),
          eq(deliveries.amountGallons, delivery.amountGallons)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const result = await db
        .update(deliveries)
        .set(delivery)
        .where(
          and(
            eq(deliveries.userId, userId),
            eq(deliveries.deliveryDate, delivery.deliveryDate),
            eq(deliveries.amountGallons, delivery.amountGallons)
          )
        )
        .returning();
      return result[0];
    }
    return await this.createDelivery(delivery, userId);
  }

  // Payments
  async getPayments(userId: string, options?: { startDate?: Date; endDate?: Date; limit?: number }): Promise<Payment[]> {
    const conditions = [eq(payments.userId, userId)];
    if (options?.startDate) conditions.push(gte(payments.paymentDate, options.startDate));
    if (options?.endDate) conditions.push(lte(payments.paymentDate, options.endDate));

    return await db
      .select()
      .from(payments)
      .where(and(...conditions))
      .orderBy(desc(payments.paymentDate))
      .limit(options?.limit || 1000);
  }

  async createPayment(payment: InsertPayment, userId: string): Promise<Payment> {
    const result = await db
      .insert(payments)
      .values({ ...payment, userId })
      .returning();
    return result[0];
  }

  async upsertPayment(payment: InsertPayment, userId: string): Promise<Payment> {
    const existing = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.userId, userId),
          eq(payments.paymentDate, payment.paymentDate),
          eq(payments.amount, payment.amount)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const result = await db
        .update(payments)
        .set(payment)
        .where(
          and(
            eq(payments.userId, userId),
            eq(payments.paymentDate, payment.paymentDate),
            eq(payments.amount, payment.amount)
          )
        )
        .returning();
      return result[0];
    }
    return await this.createPayment(payment, userId);
  }
}

export const storage = new DbStorage();
