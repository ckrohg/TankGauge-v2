import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export default defineConfig({
  out: "./migrations",
  schema: "./src/schema.ts",
  dialect: "postgresql",
  // The Supabase project is shared: `public` also holds 6bb-water's tables (devices,
  // webauthn_credentials, push_subscriptions, valve_events, valve_state, enroll_tokens) and schema
  // `bb` is 6bb-master's. Without these filters `drizzle-kit push` would offer to DROP them.
  schemaFilter: ["public"],
  tablesFilter: ["settings", "tank_readings", "deliveries", "payments", "tank_shares"],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
