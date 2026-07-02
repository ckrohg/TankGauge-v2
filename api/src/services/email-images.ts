import puppeteer, { type Browser } from "puppeteer";
import { supabaseAdmin } from "../middleware/auth.js";

// Renders the email's tank gauge + usage chart as PNGs (email clients don't render
// SVG/canvas reliably), hosts them in a public Supabase Storage bucket, and returns
// their URLs. Images use date-keyed stable paths and are never deleted, so archived
// emails keep resolving. Returns null on any failure so the email still sends,
// degrading to the text/table content.

const BUCKET = "email-assets";
const GREEN = "#16a34a";
const AMBER = "#f59e0b";
const RED = "#dc2626";

export function levelColor(pctFull: number): string {
  return pctFull > 40 ? GREEN : pctFull > 20 ? AMBER : RED;
}

function gaugeSvg(gallons: number, percent: number): string {
  const cx = 100, cy = 100, r = 76, start = 135, sweep = 270;
  const pct = Math.max(0, Math.min(100, percent));
  const P = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [(cx + r * Math.cos(a)).toFixed(1), (cy + r * Math.sin(a)).toFixed(1)];
  };
  const arc = (a1: number, a2: number) => {
    const [x1, y1] = P(a1);
    const [x2, y2] = P(a2);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const color = levelColor(pct);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
    <path d="${arc(start, start + sweep)}" fill="none" stroke="#e5e7eb" stroke-width="18" stroke-linecap="round"/>
    <path d="${arc(start, start + sweep * (pct / 100))}" fill="none" stroke="${color}" stroke-width="18" stroke-linecap="round"/>
    <text x="100" y="94" text-anchor="middle" style="font:700 46px -apple-system,Inter,Arial;fill:${color}">${Math.round(pct)}%</text>
    <text x="100" y="117" text-anchor="middle" style="font:600 15px -apple-system,Inter,Arial;fill:#3f3f46">${Math.round(gallons)} gal</text>
    <text x="100" y="138" text-anchor="middle" style="font:500 12px -apple-system,Inter,Arial;fill:#a1a1aa">of full</text>
  </svg>`;
}

function chartSvg(usage: number[]): string {
  const CW = 560, CH = 150;
  const n = Math.max(usage.length, 1);
  const bw = CW / n;
  const maxU = Math.max(...usage, 1);
  const bars = usage
    .map((u, i) => {
      const h = u <= 0 ? 2 : Math.max(5, (u / maxU) * (CH - 10));
      const x = i * bw + bw * 0.2;
      return `<rect x="${x.toFixed(1)}" y="${(CH - h).toFixed(1)}" width="${(bw * 0.6).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${GREEN}" fill-opacity="${u <= 0 ? 0.2 : 1}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" width="${CW}" height="${CH}">${bars}<line x1="0" y1="${CH - 1}" x2="${CW}" y2="${CH - 1}" stroke="#e5e7eb" stroke-width="1"/></svg>`;
}

let bucketEnsured = false;
async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  try {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
  } catch {
    /* already exists — fine */
  }
  bucketEnsured = true;
}

function launchOptions(): any {
  // On Railway, PUPPETEER_EXECUTABLE_PATH points to the system Chromium the
  // Dockerfile installs; locally it's unset so Puppeteer uses its bundled binary.
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  return {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--no-first-run",
    ],
    ...(execPath ? { executablePath: execPath } : {}),
  };
}

export async function renderTankImages(opts: {
  userId: string;
  kind: string; // "weekly" | "staleness"
  gallons: number;
  percent: number; // relative to max fill (the app's default basis) — matches subject/table
  dailyUsage: number[];
}): Promise<{ gaugeUrl: string; chartUrl: string } | null> {
  let browser: Browser | undefined;
  try {
    await ensureBucket();
    browser = await puppeteer.launch(launchOptions());
    const page = await browser.newPage();
    const render = async (svg: string, w: number, h: number): Promise<Buffer> => {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
      await page.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px">${svg}</body></html>`);
      return Buffer.from(await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } }));
    };
    const gaugePng = await render(gaugeSvg(opts.gallons, opts.percent), 200, 200);
    const chartPng = await render(chartSvg(opts.dailyUsage), 560, 150);

    const day = new Date().toISOString().slice(0, 10);
    const base = `${opts.kind}/${opts.userId}/${day}`;
    const up = async (name: string, buf: Buffer): Promise<string> => {
      const path = `${base}-${name}`;
      const { error } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, buf, { contentType: "image/png", upsert: true });
      if (error) throw error;
      return supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    };
    const gaugeUrl = await up("gauge.png", gaugePng);
    const chartUrl = await up("chart.png", chartPng);
    return { gaugeUrl, chartUrl };
  } catch (err) {
    console.error("[email-images] Failed to render/host tank images:", err);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
