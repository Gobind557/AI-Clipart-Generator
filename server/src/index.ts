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

app.get("/v1/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/v1", jobsRouter);

const port = Number(process.env.PORT ?? 8787);

const main = async (): Promise<void> => {
  await initGenerationQueue();

  if (process.env.START_WORKER === "true") {
    startGenerationWorker();
  } else if (process.env.REDIS_URL?.trim()) {
    console.warn(
      "[queue] REDIS_URL is set but START_WORKER is not true — jobs will enqueue and stall until a worker runs."
    );
  }

  app.listen(port, () => {
    const provider = (process.env.IMAGE_PROVIDER ?? "openai").toLowerCase();
    const redis = Boolean(process.env.REDIS_URL?.trim());
    const worker = process.env.START_WORKER === "true";
    console.log(`API listening on :${port} (IMAGE_PROVIDER=${provider}, redis=${redis}, worker=${worker})`);
  });
};

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
