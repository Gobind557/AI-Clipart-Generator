import cors from "cors";
import express from "express";
import helmet from "helmet";
import jobsRouter from "./routes/jobs";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/v1/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/v1", jobsRouter);

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`API listening on :${port}`);
});
