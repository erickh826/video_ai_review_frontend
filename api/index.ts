import type { VercelRequest, VercelResponse } from "@vercel/node";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function checkAuth(req: VercelRequest, res: VercelResponse): boolean {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) return true; // dev: no token = allow all
  const auth = (req.headers["authorization"] as string) ?? "";
  if (auth !== `Bearer ${adminToken}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// ─── AWS helpers ──────────────────────────────────────────────────────────────

function awsCredentials() {
  if (!process.env.AWS_ACCESS_KEY_ID) return undefined;
  return {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  };
}

async function s3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: awsCredentials(),
  });
}

async function sqsClient() {
  const { SQSClient } = await import("@aws-sdk/client-sqs");
  return new SQSClient({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: awsCredentials(),
  });
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleHealth(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
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
}

async function handlePresignUpload(req: VercelRequest, res: VercelResponse) {
  const { bucket, key, contentType = "application/json" } = req.body ?? {};
  if (!key || !key.startsWith("video-review/")) {
    return res.status(400).json({ error: "key must start with video-review/" });
  }
  try {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const s3 = await s3Client();
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucket || process.env.S3_BUCKET,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 900 }
    );
    res.status(200).json({ uploadUrl, headers: { "Content-Type": contentType } });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "presign-upload failed" });
  }
}

async function handlePresignDownload(req: VercelRequest, res: VercelResponse) {
  const { bucket, key } = req.body ?? {};
  if (!key) return res.status(400).json({ error: "key is required" });
  try {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const s3 = await s3Client();
    const downloadUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: bucket || process.env.S3_BUCKET,
        Key: key,
      }),
      { expiresIn: 3600 }
    );
    res.status(200).json({ downloadUrl });
  } catch (err: any) {
    const status = err.$metadata?.httpStatusCode === 404 ? 404 : 500;
    res.status(status).json({ error: err.message || "presign-download failed" });
  }
}

async function handleTriggerAnalysis(req: VercelRequest, res: VercelResponse) {
  const { bucket, key } = req.body ?? {};
  if (!key || !key.startsWith("video-review/")) {
    return res.status(400).json({ error: "key must start with video-review/" });
  }
  // Derive video_id from key: "video-review/<video_id>/ai/<stem>.transcript.edited.json"
  const keyParts = key.split("/");
  const video_id = keyParts[1]; // e.g. "ep01"
  if (!video_id) {
    return res.status(400).json({ error: "Cannot parse video_id from key" });
  }
  try {
    const { SendMessageCommand } = await import("@aws-sdk/client-sqs");
    const sqs = await sqsClient();
    const result = await sqs.send(
      new SendMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        MessageBody: JSON.stringify({
          kind: "analysis_only",
          bucket: bucket || process.env.S3_BUCKET,
          video_id,
          transcript_s3_key: key,
        }),
      })
    );
    res.status(200).json({ ok: true, messageId: result.MessageId ?? "unknown" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "trigger-analysis failed" });
  }
}

// ─── Main router ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Normalise path: strip query string and leading /api prefix
  const rawPath = (req.url ?? "").split("?")[0];
  const path = rawPath.replace(/^\/api/, "") || "/";

  try {
    // GET /api/health
    if (req.method === "GET" && path === "/health") {
      return await handleHealth(req, res);
    }

    // POST routes require auth
    if (!checkAuth(req, res)) return;

    if (req.method === "POST" && path === "/presign-upload") {
      return await handlePresignUpload(req, res);
    }
    if (req.method === "POST" && path === "/presign-download") {
      return await handlePresignDownload(req, res);
    }
    if (req.method === "POST" && path === "/trigger-analysis") {
      return await handleTriggerAnalysis(req, res);
    }

    res.status(404).json({ error: `Route not found: ${req.method} ${rawPath}` });
  } catch (err: any) {
    console.error("[api/index]", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
}
