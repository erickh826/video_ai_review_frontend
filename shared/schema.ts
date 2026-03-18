import { z } from "zod";

// ─── Transcript Phrase ────────────────────────────────────────────────────────

export const PhraseSchema = z.object({
  id: z.string(), // stable id for keying
  speaker_id_raw: z.string(), // original speaker (immutable)
  speaker_id: z.string(), // editable speaker
  offset_ms: z.number(),
  duration_ms: z.number(),
  text: z.string(),
});

export type Phrase = z.infer<typeof PhraseSchema>;

// ─── Transcript (raw / edited) ────────────────────────────────────────────────

export const TranscriptMetaSchema = z.object({
  edited: z.boolean().optional(),
  edited_at: z.string().optional(),
  edited_by: z.string().optional(),
  edit_source: z.literal("web_ui").optional(),
  edit_version: z.number().optional(),
});

export const TranscriptSchema = z.object({
  meta: TranscriptMetaSchema.optional(),
  phrases: z.array(PhraseSchema),
});

export type Transcript = z.infer<typeof TranscriptSchema>;
export type TranscriptMeta = z.infer<typeof TranscriptMetaSchema>;

// ─── Analysis ─────────────────────────────────────────────────────────────────

export const AnalysisSegmentSchema = z.object({
  speaker_id: z.string(),
  summary: z.string(),
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  key_phrases: z.array(z.string()).optional(),
  start_ms: z.number().optional(),
  end_ms: z.number().optional(),
});

export const AnalysisSchema = z.object({
  video_id: z.string().optional(),
  stem: z.string().optional(),
  generated_at: z.string().optional(),
  overall_summary: z.string().optional(),
  segments: z.array(AnalysisSegmentSchema).optional(),
  raw: z.record(z.unknown()).optional(), // catch-all for any extra fields
});

export type Analysis = z.infer<typeof AnalysisSchema>;
export type AnalysisSegment = z.infer<typeof AnalysisSegmentSchema>;

// ─── API Payloads ─────────────────────────────────────────────────────────────

export const PresignUploadRequestSchema = z.object({
  bucket: z.string(),
  key: z.string().startsWith("video-review/"),
  contentType: z.string().default("application/json"),
});

export const PresignDownloadRequestSchema = z.object({
  bucket: z.string(),
  key: z.string(),
});

export const TriggerAnalysisRequestSchema = z.object({
  bucket: z.string(),
  key: z.string().startsWith("video-review/"),
});

export type PresignUploadRequest = z.infer<typeof PresignUploadRequestSchema>;
export type PresignDownloadRequest = z.infer<typeof PresignDownloadRequestSchema>;
export type TriggerAnalysisRequest = z.infer<typeof TriggerAnalysisRequestSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format ms to mm:ss.SSS */
export function formatTime(ms: number): string {
  const totalSec = ms / 1000;
  const minutes = Math.floor(totalSec / 60);
  const seconds = (totalSec % 60).toFixed(3).padStart(6, "0");
  return `${String(minutes).padStart(2, "0")}:${seconds}`;
}

/** Detect suspect phrases (too short duration or text) */
export function isSuspect(phrase: Phrase): boolean {
  return phrase.duration_ms <= 600 || phrase.text.length <= 6;
}

/** Build S3 key for edited transcript */
export function editedTranscriptKey(videoId: string, stem: string): string {
  return `video-review/${videoId}/ai/${stem}.transcript.edited.json`;
}

/** Build S3 key for raw transcript */
export function rawTranscriptKey(videoId: string, stem: string): string {
  return `video-review/${videoId}/ai/${stem}.transcript.json`;
}

/** Build S3 key for raw transcript (txt fallback) */
export function rawTranscriptTxtKey(videoId: string, stem: string): string {
  return `video-review/${videoId}/ai/${stem}.transcript.txt`;
}

/** Build S3 key for analysis */
export function rawAnalysisKey(videoId: string, stem: string): string {
  return `video-review/${videoId}/ai/${stem}.anslysis.json`;
}

/** Build S3 key for analysis (edited) */
export function editedAnalysisKey(videoId: string, stem: string): string {
  return `video-review/${videoId}/ai/${stem}.anslysis.edited.json`;
}

/** Build S3 key for raw video — tries <stem>.mp4 under raw/ */
export function rawVideoKey(videoId: string, stem: string): string {
  return `video-review/${videoId}/raw/${stem}.mp4`;
}
