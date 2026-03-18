import express from "express";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  PresignUploadRequestSchema,
  PresignDownloadRequestSchema,
  TriggerAnalysisRequestSchema,
} from "../shared/schema";

const app = express();
app.use(express.json());

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) return next(); // dev: no token configured = allow all
  const auth = req.headers["authorization"] ?? "";
  if (auth !== `Bearer ${adminToken}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ─── AWS helpers ──────────────────────────────────────────────────────────────

async function getS3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: process.env.AWS_ACCESS_KEY_ID
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
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        }
      : undefined,
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/health
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    env: {
      AWS_REGION: !!process.env.AWS_REGION,
      AWS_ACCESS_KEY_ID: !!process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: !!process.env.AWS_SECRET_ACCESS_KEY,
      S3_BUCKET: !!process.env.S3_BUCKET,
      SQS_QUEUE_URL: !!process.env.SQS_QUEUE_URL,
      ADMIN_TOKEN: !!process.env.ADMIN_TOKEN,
    },
  });
});

// POST /api/presign-upload
app.post("/api/presign-upload", requireAuth, async (req, res) => {
  const parsed = PresignUploadRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { bucket, key, contentType } = parsed.data;
  if (!key.startsWith("video-review/")) {
    res.status(400).json({ error: "Key must start with video-review/" });
    return;
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
    res.status(500).json({ error: err.message || "Failed to generate presigned URL" });
  }
});

// POST /api/presign-download
app.post("/api/presign-download", requireAuth, async (req, res) => {
  const parsed = PresignDownloadRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
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
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    res.status(500).json({ error: err.message || "Failed to generate presigned URL" });
  }
});

// POST /api/trigger-analysis
app.post("/api/trigger-analysis", requireAuth, async (req, res) => {
  const parsed = TriggerAnalysisRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { bucket, key } = parsed.data;
  try {
    const { SendMessageCommand } = await import("@aws-sdk/client-sqs");
    const sqs = await getSQSClient();
    const result = await sqs.send(
      new SendMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        MessageBody: JSON.stringify({
          kind: "analysis_only",
          bucket: bucket || process.env.S3_BUCKET,
          key,
        }),
      })
    );
    res.json({ ok: true, messageId: result.MessageId ?? "unknown" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to send SQS message" });
  }
});

// ─── Vercel handler ───────────────────────────────────────────────────────────

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Let Express handle the request
  return app(req as any, res as any);
}
