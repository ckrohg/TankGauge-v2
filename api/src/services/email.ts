import { Resend } from "resend";
import { storage } from "../storage.js";
import { supabaseAdmin } from "../middleware/auth.js";
import {
  calculateRefillEstimate,
  calculateDailyConsumption,
  calculateDailyConsumptionFilled,
  effectivePercent,
  type RefillEstimate,
  type PercentBasis,
} from "../utils/cost-calculator.js";
import { renderTankImages } from "./email-images.js";
import type { Settings, TankReading, Delivery } from "../schema.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Resend's onboarding sender only delivers to the account owner's own address,
// which is exactly what "test to my own inbox first" needs.
const FROM = process.env.RESEND_FROM_EMAIL?.trim() || "TankGauge <onboarding@resend.dev>";

// When set, every email is redirected here regardless of the real recipient.
// Lets us validate the whole flow against one inbox before a domain is verified.
const TEST_TO = process.env.RESEND_TEST_TO?.trim();

const APP_URL = process.env.APP_URL?.trim() || "https://tankguage.vercel.app";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function fmtGal(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)} gal`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  // iso is yyyy-mm-dd; build a local date to avoid TZ drift.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Short label clarifying what a percentage is measured against.
function basisLabel(basis: PercentBasis): string {
  return basis === "relative" ? "of full" : "gauge";
}

async function getAuthEmail(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) return null;
    return data.user.email;
  } catch (err) {
    console.error(`[email] Failed to resolve auth email for ${userId}:`, err);
    return null;
  }
}

// Returns the address to actually send to (honoring the test override) plus the
// real intended recipient for logging / subject tagging.
async function resolveRecipient(
  userId: string,
  settings: Settings
): Promise<{ to: string; real: string } | null> {
  const real = settings.notifyEmail?.trim() || (await getAuthEmail(userId));
  if (!real) return null;
  return { to: TEST_TO || real, real };
}

async function send(opts: {
  userId: string;
  settings: Settings;
  subject: string;
  html: string;
  kind: string;
  recipientUserId?: string;
}): Promise<boolean> {
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY not set — skipping ${opts.kind} email for user ${opts.userId}`
    );
    return false;
  }
  const recipient = await resolveRecipient(opts.recipientUserId || opts.userId, opts.settings);
  if (!recipient) {
    console.warn(`[email] No recipient email for user ${opts.userId} — skipping ${opts.kind}`);
    return false;
  }

  // When redirecting to a test inbox, tag the subject so it's clear who it was for.
  const subject =
    TEST_TO && recipient.to !== recipient.real
      ? `[test→${recipient.real}] ${opts.subject}`
      : opts.subject;

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: recipient.to,
      subject,
      html: opts.html,
    });
    if (error) {
      console.error(`[email] Resend error sending ${opts.kind} to ${recipient.to}:`, error);
      return false;
    }
    console.log(`[email] Sent ${opts.kind} email to ${recipient.to}`);
    return true;
  } catch (err) {
    console.error(`[email] Exception sending ${opts.kind} to ${recipient.to}:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Shared layout
// ---------------------------------------------------------------------------

function layout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
      <div style="font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;margin-bottom:8px;">TankGauge</div>
      <div style="background:#ffffff;border-radius:16px;padding:28px;">
        <h1 style="margin:0 0 20px;font-size:22px;font-weight:600;">${title}</h1>
        ${bodyHtml}
        <div style="margin-top:28px;">
          <a href="${APP_URL}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:11px 20px;border-radius:10px;">Open dashboard →</a>
        </div>
      </div>
      <div style="text-align:center;font-size:11px;color:#a1a1aa;margin-top:16px;">
        You're receiving this from TankGauge. Manage notifications in Settings.
      </div>
    </div>
  </body>
</html>`;
}

function metricRow(label: string, value: string, sub?: string): string {
  return `<tr>
    <td style="padding:12px 0;border-bottom:1px solid #f4f4f5;font-size:14px;color:#71717a;">${label}</td>
    <td style="padding:12px 0;border-bottom:1px solid #f4f4f5;font-size:15px;font-weight:600;text-align:right;">${value}${
      sub ? `<div style="font-size:12px;font-weight:400;color:#a1a1aa;">${sub}</div>` : ""
    }</td>
  </tr>`;
}

// ---------------------------------------------------------------------------
// Weekly summary
// ---------------------------------------------------------------------------

interface WeeklySummary {
  currentPercent: number; // in the chosen basis
  currentGallons: number;
  percentBasis: PercentBasis;
  refill: RefillEstimate | null;
  weekGallons: number;
  weekCost: number;
  currentPrice: number | null;
  priceWeekAgo: number | null;
  price30Low: number | null;
  price30High: number | null;
  deliveriesThisWeek: Delivery[];
  dailyUsage: number[]; // gallons used per day, last 30 days (zero-filled)
}

async function buildWeeklySummary(userId: string, settings: Settings): Promise<WeeklySummary | null> {
  const [readings, deliveryList] = await Promise.all([
    storage.getTankReadings(userId),
    storage.getDeliveries(userId),
  ]);
  if (readings.length === 0) return null;

  const sorted = [...readings].sort(
    (a, b) => new Date(a.scrapedAt).getTime() - new Date(b.scrapedAt).getTime()
  );
  const latest = sorted[sorted.length - 1];
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * MS_PER_DAY);
  const monthAgo = new Date(now.getTime() - 30 * MS_PER_DAY);

  const threshold = settings.refillThresholdPct ? Number(settings.refillThresholdPct) : 30;
  const percentBasis = (settings.percentBasis as PercentBasis) || "relative";
  const maxGallons = Math.max(...sorted.map((r) => parseFloat(r.remainingGallons)));
  const refill = calculateRefillEstimate(readings, deliveryList, {
    refillThresholdPercent: threshold,
    percentBasis,
    maxGallons,
    now,
  });

  // This week's usage
  const daily = calculateDailyConsumption(readings, deliveryList);
  const weekDaily = daily.filter((d) => new Date(d.date) >= weekAgo);
  const weekGallons = weekDaily.reduce((s, d) => s + d.gallonsUsed, 0);
  const weekCost = weekDaily.reduce((s, d) => s + d.cost, 0);

  // Market price now + recent history
  const priced = sorted.filter((r) => r.pricePerGallon !== null && r.pricePerGallon !== undefined);
  const currentPrice = latest.pricePerGallon ? parseFloat(latest.pricePerGallon) : null;
  const weekAgoReading = [...priced]
    .filter((r) => new Date(r.scrapedAt) <= weekAgo)
    .pop();
  const priceWeekAgo = weekAgoReading?.pricePerGallon
    ? parseFloat(weekAgoReading.pricePerGallon)
    : null;
  const last30Prices = priced
    .filter((r) => new Date(r.scrapedAt) >= monthAgo)
    .map((r) => parseFloat(r.pricePerGallon as string));
  const price30Low = last30Prices.length ? Math.min(...last30Prices) : null;
  const price30High = last30Prices.length ? Math.max(...last30Prices) : null;

  const deliveriesThisWeek = deliveryList.filter((d) => new Date(d.deliveryDate) >= weekAgo);

  const dailyUsage = calculateDailyConsumptionFilled(readings, deliveryList)
    .slice(-30)
    .map((d) => d.gallonsUsed);

  return {
    currentPercent: effectivePercent(
      parseFloat(latest.remainingGallons),
      parseFloat(latest.levelPercentage),
      percentBasis,
      maxGallons
    ),
    currentGallons: parseFloat(latest.remainingGallons),
    percentBasis,
    refill,
    weekGallons,
    weekCost,
    currentPrice,
    priceWeekAgo,
    price30Low,
    price30High,
    deliveriesThisWeek,
    dailyUsage,
  };
}

// Renders the core status metrics table (level, refill, weekly usage, price)
// shared by the weekly digest and the staleness alert's "last known" snapshot.
// `levelLabel` lets the staleness alert say "Last known level" vs "Current level".
function renderCoreMetrics(s: WeeklySummary, levelLabel: string): string {
  // Refill line
  let refillValue = "—";
  let refillSub: string | undefined;
  if (s.refill) {
    const thr = `${Number(s.refill.refillThresholdPercent).toFixed(0)}% ${basisLabel(
      s.refill.percentBasis
    )} (~${fmtGal(s.refill.refillThresholdGallons)})`;
    if (s.refill.status === "refill_now") {
      refillValue = "Refill now";
      refillSub = `at or below ${thr}`;
    } else if (s.refill.status === "ok" && s.refill.refillByDate) {
      refillValue = fmtDate(s.refill.refillByDate);
      const band =
        s.refill.refillBySoonest && s.refill.refillByLatest
          ? `${fmtDate(s.refill.refillBySoonest)} – ${fmtDate(s.refill.refillByLatest)}`
          : "";
      refillSub = `to ${thr}${band ? ` · ${band}` : ""} · ${s.refill.confidence} confidence`;
    } else {
      refillValue = "Not enough data";
    }
  }

  // Price line
  let priceValue = s.currentPrice !== null ? `${fmtMoney(s.currentPrice)}/gal` : "—";
  let priceSub: string | undefined;
  if (s.currentPrice !== null && s.priceWeekAgo !== null) {
    const delta = s.currentPrice - s.priceWeekAgo;
    const arrow = delta > 0.0001 ? "▲" : delta < -0.0001 ? "▼" : "▬";
    priceSub = `${arrow} ${fmtMoney(Math.abs(delta))} vs last week`;
  }
  const priceHistory =
    s.price30Low !== null && s.price30High !== null
      ? `<div style="font-size:12px;color:#a1a1aa;margin-top:6px;">30-day range: ${fmtMoney(
          s.price30Low
        )} – ${fmtMoney(s.price30High)}/gal</div>`
      : "";

  return `
    <table style="width:100%;border-collapse:collapse;">
      ${metricRow(
        levelLabel,
        `${s.currentPercent.toFixed(0)}% ${basisLabel(s.percentBasis)}`,
        fmtGal(s.currentGallons)
      )}
      ${metricRow("Refill needed by", refillValue, refillSub)}
      ${metricRow("Used this week", fmtGal(s.weekGallons), fmtMoney(s.weekCost))}
      ${metricRow("Market price", priceValue, priceSub)}
    </table>
    ${priceHistory}`;
}

type TankImages = { gaugeUrl: string; chartUrl: string } | null;

// Visual hero: radial gauge PNG + usage-chart PNG. Falls back to a clean text line
// (never a broken-image box) when rendering/hosting failed. The metric table below
// carries all the same numbers, so images are a pure enhancement.
function heroBlock(s: WeeklySummary, images: TankImages): string {
  if (!images) {
    return `<div style="text-align:center;font-size:16px;color:#18181b;margin:6px 0 14px;"><strong>${s.currentPercent.toFixed(
      0
    )}% of full</strong> · ${s.currentGallons.toFixed(0)} gal</div>`;
  }
  const total30 = s.dailyUsage.reduce((a, b) => a + b, 0);
  return `
    <div style="text-align:center;padding:8px 0;"><img src="${images.gaugeUrl}" width="180" height="180" alt="Tank level: ${s.currentPercent.toFixed(
      0
    )}% of full, ${s.currentGallons.toFixed(0)} gallons" style="display:inline-block;border:0;"/></div>
    <h2 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#71717a;margin:16px 0 6px;">Usage · last 30 days</h2>
    <img src="${images.chartUrl}" width="100%" alt="Daily usage, last 30 days" style="display:block;max-width:100%;border:0;"/>
    <div style="font-size:12px;color:#a1a1aa;margin-top:4px;">30-day total: <strong style="color:#3f3f46;">${total30.toFixed(
      0
    )} gal</strong></div>`;
}

function renderWeeklyEmail(s: WeeklySummary, images: TankImages): { subject: string; html: string } {
  // Deliveries this week
  let deliveriesHtml = `<div style="font-size:14px;color:#71717a;">No refills this week.</div>`;
  if (s.deliveriesThisWeek.length > 0) {
    deliveriesHtml = s.deliveriesThisWeek
      .map((d) => {
        const gallons = parseFloat(d.amountGallons);
        const price = parseFloat(d.pricePerGallon);
        const total = parseFloat(d.totalCost);
        const date = new Date(d.deliveryDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        return `<div style="font-size:14px;padding:8px 0;border-bottom:1px solid #f4f4f5;">
          <strong>${fmtGal(gallons)}</strong> on ${date} · ${fmtMoney(price)}/gal · <strong>${fmtMoney(
          total
        )}</strong>
        </div>`;
      })
      .join("");
  }

  const body = `
    ${heroBlock(s, images)}
    ${renderCoreMetrics(s, "Current level")}
    <h2 style="font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#71717a;margin:24px 0 8px;">Refills this week</h2>
    ${deliveriesHtml}
  `;

  const subject = `Tank update: ${s.currentPercent.toFixed(0)}% · refill ${
    s.refill?.status === "refill_now"
      ? "now"
      : s.refill?.refillByDate
      ? `by ${fmtDate(s.refill.refillByDate)}`
      : "TBD"
  }`;

  return { subject, html: layout("Your weekly tank update", body) };
}

// `userId` is the data owner whose tank the digest summarizes. `recipientUserId`
// (defaults to the owner) is who actually receives it — they differ when a shared
// viewer sends themselves a test digest of the owner's tank.
export async function sendWeeklyUpdate(
  userId: string,
  settings: Settings,
  recipientUserId?: string
): Promise<boolean> {
  const summary = await buildWeeklySummary(userId, settings);
  if (!summary) {
    console.log(`[email] No data for weekly update for user ${userId} — skipping`);
    return false;
  }
  const images = await renderTankImages({
    userId,
    kind: "weekly",
    gallons: summary.currentGallons,
    percent: summary.currentPercent,
    dailyUsage: summary.dailyUsage,
  });
  const { subject, html } = renderWeeklyEmail(summary, images);
  return send({ userId, settings, subject, html, kind: "weekly-update", recipientUserId });
}

// ---------------------------------------------------------------------------
// Low-level alert
// ---------------------------------------------------------------------------

export async function sendLowLevelAlert(
  userId: string,
  settings: Settings,
  reading: TankReading,
  maxGallons?: number
): Promise<boolean> {
  const gallons = parseFloat(reading.remainingGallons);
  const basis = (settings.percentBasis as PercentBasis) || "relative";
  const percent = effectivePercent(gallons, parseFloat(reading.levelPercentage), basis, maxGallons);
  const threshold = settings.lowAlertPct ? Number(settings.lowAlertPct) : 20;
  const label = basisLabel(basis);

  const body = `
    <div style="font-size:15px;line-height:1.5;color:#3f3f46;margin-bottom:20px;">
      Your propane tank has dropped to <strong>${percent.toFixed(0)}% ${label}</strong> (${fmtGal(
    gallons
  )}), at or below your ${threshold.toFixed(0)}% ${label} alert level. It may be time to schedule a delivery.
    </div>
    <table style="width:100%;border-collapse:collapse;">
      ${metricRow("Current level", `${percent.toFixed(0)}% ${label}`, fmtGal(gallons))}
      ${metricRow("Alert threshold", `${threshold.toFixed(0)}% ${label}`)}
    </table>
  `;

  const subject = `⚠️ Propane low: ${percent.toFixed(0)}% ${label} remaining`;
  return send({
    userId,
    settings,
    subject,
    html: layout("Tank running low", body),
    kind: "low-level-alert",
  });
}

// ---------------------------------------------------------------------------
// Staleness watchdog alert
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"
  );
}

// Sent by the scheduler when no new reading has saved for a long time. `broken`
// distinguishes an app-side failure (scraper erroring) from the benign case
// (scraper healthy, tankfarm.io just hasn't published) so the email says the
// right thing.
export async function sendStalenessAlert(
  userId: string,
  settings: Settings,
  info: {
    ageHours: number;
    lastReadingAt: Date;
    broken: boolean;
    failures: number;
    lastFailureReason?: string | null;
  }
): Promise<boolean> {
  const lastSeen =
    info.lastReadingAt.toLocaleString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " UTC";

  const intro = info.broken
    ? `No new tank reading has saved in <strong>${info.ageHours} hours</strong>, and the scraper has <strong>${info.failures} consecutive failure${
        info.failures === 1 ? "" : "s"
      }</strong>${
        info.lastFailureReason ? ` — <em>${escapeHtml(info.lastFailureReason)}</em>` : ""
      }. This looks like an app-side problem; the Railway logs are the place to look.`
    : `No new tank reading has saved in <strong>${info.ageHours} hours</strong>, but the scraper itself is healthy (0 failures). tankfarm.io most likely hasn't published new data — it updates ~once a day and occasionally skips one. No action needed unless this keeps climbing.`;

  // Include a "last known" status snapshot from the same builder the weekly
  // digest uses — clearly labeled as-of the last reading, since the data is stale.
  let statusBlock = "";
  try {
    const summary = await buildWeeklySummary(userId, settings);
    if (summary) {
      const images = await renderTankImages({
        userId,
        kind: "staleness",
        gallons: summary.currentGallons,
        percent: summary.currentPercent,
        dailyUsage: summary.dailyUsage,
      });
      statusBlock = `
    <h2 style="font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#71717a;margin:24px 0 8px;">Last known status · as of ${lastSeen} (${info.ageHours}h ago)</h2>
    ${heroBlock(summary, images)}
    ${renderCoreMetrics(summary, "Last known level")}`;
    }
  } catch (err) {
    console.error(`[email] Failed to build status snapshot for staleness alert (${userId}):`, err);
  }

  const body = `
    <div style="font-size:15px;line-height:1.5;color:#3f3f46;margin-bottom:20px;">${intro}</div>
    <table style="width:100%;border-collapse:collapse;">
      ${metricRow("Last saved reading", lastSeen, `${info.ageHours}h ago`)}
      ${metricRow("Scraper failures", String(info.failures), info.broken ? "check Railway logs" : "healthy")}
    </table>
    ${statusBlock}
  `;

  const subject = info.broken
    ? `⚠️ TankGauge: scraper may be down (no data in ${info.ageHours}h)`
    : `ℹ️ TankGauge: no new tank data in ${info.ageHours}h`;

  return send({
    userId,
    settings,
    subject,
    html: layout(info.broken ? "Scraper may be failing" : "No new tank data", body),
    kind: "staleness-alert",
  });
}

export const emailEnabled = !!resend;
