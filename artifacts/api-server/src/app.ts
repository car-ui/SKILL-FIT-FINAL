import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";
import { securityHeaders, secureLogging, sanitizeInput } from "./middleware/security";

const app: Express = express();

const isProd = process.env["NODE_ENV"] === "production";
if (isProd) {
  app.set("trust proxy", 1);
}

const corsOrigins = process.env["CORS_ORIGIN"]?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors(
    corsOrigins?.length
      ? { origin: corsOrigins, credentials: true }
      : { origin: true, credentials: true },
  ),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(securityHeaders);
app.use(secureLogging);
app.use(sanitizeInput);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(
  "/uploads",
  express.static(path.resolve(process.cwd(), process.env["UPLOAD_DIR"] ?? "uploads"), {
    fallthrough: false,
    maxAge: isProd ? "1d" : 0,
  }),
);

app.use(
  session({
    name: "skillfit.sid",
    secret: process.env["SESSION_SECRET"] ?? "skillfit-dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProd,
      httpOnly: true,
      sameSite: isProd ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

app.use("/api", router);

export default app;
