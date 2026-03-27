import { Router } from "express";
import { z } from "zod";
import { createJobSchema } from "../schemas/jobs";
import { createJob, getJob, getJobResults } from "../services/jobs/jobStore";

const router = Router();
const dailyUsage = new Map<string, number>();

const getClientKey = (requestHeader: string | undefined, ip: string): string => {
  if (requestHeader && requestHeader.trim().length > 0) {
    return `header:${requestHeader.trim()}`;
  }
  return `ip:${ip}`;
};

router.post("/jobs", (req, res) => {
  const clientId = getClientKey(
    req.header("x-device-id") || req.header("x-client-id"),
    req.ip ?? "unknown"
  );

  const usedToday = dailyUsage.get(clientId) ?? 0;
  if (usedToday >= 25) {
    return res.status(429).json({
      error: "Daily quota exceeded."
    });
  }

  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request payload.",
      issues: parsed.error.issues
    });
  }

  const job = createJob(parsed.data);
  dailyUsage.set(clientId, usedToday + 1);

  return res.status(202).json({
    jobId: job.id,
    status: job.status
  });
});

router.get("/jobs/:id", (req, res) => {
  const idSchema = z.string().uuid();
  const idCheck = idSchema.safeParse(req.params.id);
  if (!idCheck.success) {
    return res.status(400).json({ error: "Invalid job id." });
  }

  const job = getJob(idCheck.data);
  if (!job) {
    return res.status(404).json({ error: "Job not found." });
  }

  return res.json({
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    perStyle: job.results.map((item) => ({
      style: item.style,
      status: item.status,
      error: item.error
    }))
  });
});

router.get("/jobs/:id/results", (req, res) => {
  const idSchema = z.string().uuid();
  const idCheck = idSchema.safeParse(req.params.id);
  if (!idCheck.success) {
    return res.status(400).json({ error: "Invalid job id." });
  }

  const results = getJobResults(idCheck.data);
  if (!results) {
    return res.status(404).json({ error: "Job not found." });
  }

  return res.json({
    items: results
  });
});

export default router;
