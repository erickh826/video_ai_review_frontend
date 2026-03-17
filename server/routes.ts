import type { Express } from "express";
import type { Server } from "http";
import {
  PresignUploadRequestSchema,
  PresignDownloadRequestSchema,
  TriggerAnalysisRequestSchema,
} from "../shared/schema";
import { storage } from "./storage";

// ─── Lazy AWS imports (only used if env vars present) ─────────────────────────

async function getS3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    credentials:
      process.env.AWS_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          }
        : undefined,
  });
}

async function getSQSClient() {
  const { SQSClient } = await import("@aws-sdk/client-sqs");
  return new SQSClient({
    region: process.env.AWS_REGION || "us-east-1",
    credentials:
      process.env.AWS_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          }
        : undefined,
  });
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req: any, res: any, next: any) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    // No token configured — allow all in dev mode
    return next();
  }
  const auth = req.headers["authorization"] ?? "";
  if (auth !== `Bearer ${adminToken}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function registerRoutes(httpServer: Server, app: Express) {
  // Health check
  app.get("/api/health", (_req, res) => {
    const envCheck = {
      AWS_REGION: !!process.env.AWS_REGION,
      AWS_ACCESS_KEY_ID: !!process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: !!process.env.AWS_SECRET_ACCESS_KEY,
      S3_BUCKET: !!process.env.S3_BUCKET,
      SQS_QUEUE_URL: !!process.env.SQS_QUEUE_URL,
      ADMIN_TOKEN: !!process.env.ADMIN_TOKEN,
    };
    res.json({ ok: true, env: envCheck, ts: new Date().toISOString() });
  });

  // ── POST /api/presign-upload ─────────────────────────────────────────────
  app.post("/api/presign-upload", requireAuth, async (req, res) => {
    const parsed = PresignUploadRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { bucket, key, contentType } = parsed.data;

    // Safety: restrict key prefix
    if (!key.startsWith("video-review/")) {
      return res.status(400).json({ error: "Key must start with video-review/" });
    }

    try {
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
      const s3 = await getS3Client();
      const command = new PutObjectCommand({
        Bucket: bucket || process.env.S3_BUCKET,
        Key: key,
        ContentType: contentType,
      });
      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
      res.json({ uploadUrl, headers: { "Content-Type": contentType } });
    } catch (err: any) {
      console.error("[presign-upload]", err);
      res.status(500).json({ error: err.message || "Failed to generate presigned URL" });
    }
  });

  // ── POST /api/presign-download ───────────────────────────────────────────
  app.post("/api/presign-download", requireAuth, async (req, res) => {
    const parsed = PresignDownloadRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { bucket, key } = parsed.data;

    try {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
      const s3 = await getS3Client();
      const command = new GetObjectCommand({
        Bucket: bucket || process.env.S3_BUCKET,
        Key: key,
      });
      const downloadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      res.json({ downloadUrl });
    } catch (err: any) {
      console.error("[presign-download]", err);
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: "Object not found" });
      }
      res.status(500).json({ error: err.message || "Failed to generate presigned URL" });
    }
  });

  // ── POST /api/trigger-analysis ───────────────────────────────────────────
  app.post("/api/trigger-analysis", requireAuth, async (req, res) => {
    const parsed = TriggerAnalysisRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { bucket, key } = parsed.data;

    // Extract videoId + stem from key: video-review/<videoId>/ai/<stem>.transcript.edited.json
    const keyMatch = key.match(/^video-review\/([^/]+)\/ai\/(.+)\.transcript\.edited\.json$/);
    const videoId = keyMatch?.[1] ?? "unknown";
    const stem = keyMatch?.[2] ?? "unknown";

    try {
      const { SendMessageCommand } = await import("@aws-sdk/client-sqs");
      const sqs = await getSQSClient();

      const messageBody = JSON.stringify({
        kind: "analysis_only",
        bucket: bucket || process.env.S3_BUCKET,
        key,
      });

      const result = await sqs.send(
        new SendMessageCommand({
          QueueUrl: process.env.SQS_QUEUE_URL,
          MessageBody: messageBody,
        })
      );

      const messageId = result.MessageId ?? "unknown";
      storage.setJobStatus({
        videoId,
        stem,
        messageId,
        queuedAt: new Date().toISOString(),
        status: "queued",
      });

      res.json({ ok: true, messageId });
    } catch (err: any) {
      console.error("[trigger-analysis]", err);
      res.status(500).json({ error: err.message || "Failed to send SQS message" });
    }
  });

  // ── GET /api/job-status/:videoId/:stem ────────────────────────────────────
  app.get("/api/job-status/:videoId/:stem", requireAuth, (req, res) => {
    const { videoId, stem } = req.params;
    const job = storage.getJobStatus(videoId, stem);
    if (!job) return res.status(404).json({ error: "No job found" });
    res.json(job);
  });

  return httpServer;
}
