import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

import authRouter from "./auth/auth";
import groupsRouter from "./groups/groups";
import membershipsRouter from "./memberships/memberships";
import expensesRouter from "./expenses/expenses";
import settlementsRouter from "./settlements/settlements";
import balancesRouter from "./balances/balances";
import importsRouter from "./imports/imports";
import adminRouter from "./admin/admin";

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: "http://localhost:5173", // default Vite react port
  credentials: true
}));
app.use(express.json({ limit: "10mb" })); // support large CSV content payloads
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Basic health check route
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

// Routes
app.use("/auth", authRouter);
app.use("/groups", groupsRouter);
app.use("/", membershipsRouter); // registers /groups/:id/members and /membership/:id
app.use("/expenses", expensesRouter);
app.use("/settlements", settlementsRouter);
app.use("/balances", balancesRouter);
app.use("/imports", importsRouter);
app.use("/admin", adminRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global server error:", err);
  res.status(500).json({ error: err.message || "An unexpected server error occurred." });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Ledgerly Backend running on port ${PORT}`);
});
