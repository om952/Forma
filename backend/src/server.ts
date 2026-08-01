import path from "path";

import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import authRoutes from "./routes/auth.routes";
import analyticsRoutes from "./routes/analytics.routes";
import formRoutes from "./routes/form.routes";
import paymentRoutes from "./routes/payment.routes";
import responseRoutes from "./routes/response.routes";
import uploadRoutes from "./routes/upload.routes";
import webhookRoutes from "./routes/webhook.routes";
import "./workers/webhook.worker";
import "./workers/notification.worker";

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
// Uploads arrive as base64 inside JSON, so they need far more headroom than the
// 100kb default. Mounted first; the global parser below then skips these.
app.use("/api/uploads", express.json({ limit: "10mb" }));
app.use(express.json());
app.use(morgan("dev"));

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/responses", responseRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/webhooks", webhookRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen(port, () => {
  console.log(`API running on :${port}`);
});
