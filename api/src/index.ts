import express from "express";
import cors from "cors";
import { registerRoutes } from "./routes.js";

const app = express();

// CORS: allow frontend origin
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173").split(",");
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Request logging for API routes
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      const duration = Date.now() - start;
      let logLine = `${req.method} ${req.path} ${res.statusCode} in ${duration}ms`;
      if (logLine.length > 120) logLine = logLine.slice(0, 119) + "...";
      console.log(`[API] ${logLine}`);
    }
  });
  next();
});

(async () => {
  try {
    console.log("[Server] Starting TankGauge API...");

    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
    if (!process.env.SUPABASE_URL) throw new Error("SUPABASE_URL is required");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

    const server = await registerRoutes(app);

    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });

    const port = parseInt(process.env.PORT || "3001", 10);
    server.listen({ port, host: "0.0.0.0" }, () => {
      console.log(`[Server] TankGauge API listening on port ${port}`);
    });
  } catch (error) {
    console.error("[Server] FATAL:", error);
    process.exit(1);
  }
})();
