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
import "./workers/webhook.worker";

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(morgan("dev"));

app.use("/api/auth", authRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/responses", responseRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen(port, () => {
  console.log(`API running on :${port}`);
});
