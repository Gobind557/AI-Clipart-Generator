import "dotenv/config";
import cors from "cors";
import http from "http";
import express from "express";
import helmet from "helmet";
import jobsRouter from "./routes/jobs";
import { initGenerationQueue, startGenerationWorker } from "./queue/generationQueue";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));

initGenerationQueue();
if (process.env.START_WORKER === "true") {
  startGenerationWorker();
}

app.get("/v1/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/v1", jobsRouter);

const port = Number(process.env.PORT ?? 8787);
/** Must bind all interfaces or Railway’s proxy gets TCP reset / connection refused (502). */
const host = process.env.HOST?.trim() || "0.0.0.0";

const server = http.createServer(app);
server.on("error", (err) => {
  console.error("HTTP server failed to start:", err);
  process.exit(1);
});
server.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});
