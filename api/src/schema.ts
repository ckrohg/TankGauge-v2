import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, integer, uuid, index } from "drizzle-orm/pg-core";
import { z } from "zod";

// Users are managed by Supabase Auth (auth.users).
// We reference auth.users.id (uuid) as user_id in our tables.
// No application-level users table needed.

export const settings = pgTable("settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().unique(),
  scrapingFrequency: text("scraping_frequency").notNull().default("twice-daily"),
  scheduleWindow: text("schedule_window"),
  scheduleOffsetMinutes: integer("schedule_offset_minutes"),
  scheduleSeed: integer("schedule_seed"),
  tankfarmUsername: text("tankfarm_username"),
  tankfarmPassword: text("tankfarm_password"),
  lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastFailureReason: text("last_failure_reason"),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tankReadings = pgTable("tank_readings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
  levelPercentage: decimal("level_percentage", { precision: 5, scale: 2 }).notNull(),
  remainingGallons: decimal("remaining_gallons", { precision: 10, scale: 2 }).notNull(),
  tankCapacity: decimal("tank_capacity", { precision: 10, scale: 2 }).notNull(),
  pricePerGallon: decimal("price_per_gallon", { precision: 10, scale: 2 }),
  tankfarmLastUpdate: timestamp("tankfarm_last_update", { withTimezone: true }),
  scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_tank_readings_user_scraped").on(table.userId, table.scrapedAt),
]);

export const deliveries = pgTable("deliveries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
  deliveryDate: timestamp("delivery_date", { withTimezone: true }).notNull(),
  amountGallons: decimal("amount_gallons", { precision: 10, scale: 2 }).notNull(),
  pricePerGallon: decimal("price_per_gallon", { precision: 10, scale: 2 }).notNull(),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }).notNull(),
  scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_deliveries_user_date").on(table.userId, table.deliveryDate),
]);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
  paymentDate: timestamp("payment_date", { withTimezone: true }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method"),
  status: text("status").notNull().default("paid"),
  scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_payments_user_date").on(table.userId, table.paymentDate),
]);

export const tankShares = pgTable("tank_shares", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: uuid("owner_id").notNull(),
  sharedEmail: text("shared_email").notNull(),
  sharedUserId: uuid("shared_user_id"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_tank_shares_owner").on(table.ownerId),
]);

// Insert schemas (for validation)
export const insertSettingsSchema = z.object({
  scrapingFrequency: z.string().optional(),
  tankfarmUsername: z.string().nullable().optional(),
  tankfarmPassword: z.string().nullable().optional(),
});

export const insertTankReadingSchema = z.object({
  levelPercentage: z.string(),
  remainingGallons: z.string(),
  tankCapacity: z.string(),
  pricePerGallon: z.string().nullable().optional(),
  tankfarmLastUpdate: z.date().nullable().optional(),
});

export const insertDeliverySchema = z.object({
  deliveryDate: z.date(),
  amountGallons: z.string(),
  pricePerGallon: z.string(),
  totalCost: z.string(),
});

export const insertPaymentSchema = z.object({
  paymentDate: z.date(),
  amount: z.string(),
  paymentMethod: z.string().nullable().optional(),
  status: z.string().optional(),
});

export const insertTankShareSchema = z.object({
  sharedEmail: z.string().email(),
});

// Types
export type TankShare = typeof tankShares.$inferSelect;
export type InsertTankShare = z.infer<typeof insertTankShareSchema>;

export type Settings = typeof settings.$inferSelect;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;

export type TankReading = typeof tankReadings.$inferSelect;
export type InsertTankReading = z.infer<typeof insertTankReadingSchema>;

export type Delivery = typeof deliveries.$inferSelect;
export type InsertDelivery = z.infer<typeof insertDeliverySchema>;

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
