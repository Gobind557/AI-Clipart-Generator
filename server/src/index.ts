import "dotenv/config";
import cors from "cors";
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
/** Railway/Docker send traffic to the container interface; localhost-only listen causes 502 + upstream "connection refused". */
const host = process.env.HOST?.trim() || "0.0.0.0";
app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});
