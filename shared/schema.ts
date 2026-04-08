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
  professional_speaker_id: z.string().optional(),
  client_speaker_ids: z.array(z.string()).optional(),
  phrases: z.array(PhraseSchema),
});

export type Transcript = z.infer<typeof TranscriptSchema>;
export type TranscriptMeta = z.infer<typeof TranscriptMetaSchema>;

// ─── Analysis ─────────────────────────────────────────────────────────────────

// ─── Analysis-v2 schema (matches backend analyze_transcript_azure_openai output) ──

export const EvidenceSchema = z.object({
  phrase_index: z.number().optional(),
  quote: z.string().optional(),
  start_ms: z.number().optional(),
  end_ms: z.number().optional(),
  speaker_id: z.string().optional(),
});

export const SkillSchema = z.object({
  skill_name: z.string(),
  description: z.string().optional(),
  score: z.number().optional(),
  max_score: z.number().optional(),
  evidence: EvidenceSchema.optional(),
});

export const ImprovementSchema = z.object({
  issue: z.string(),
  suggestion: z.string().optional(),
  evidence: EvidenceSchema.optional(),
});

export const ProfessionalEvaluationSchema = z.object({
  overall_performance: z.string().optional(),
  skills_demonstrated: z.array(SkillSchema).optional(),
  areas_for_improvement: z.array(ImprovementSchema).optional(),
  action_items: z.array(z.string()).optional(),
});

export const AnalysisSchema = z.object({
  version: z.string().optional(),
  video_id: z.string().optional(),
  stem: z.string().optional(),
  generated_at: z.string().optional(),
  professional_evaluation: ProfessionalEvaluationSchema.optional(),
  source: z.record(z.unknown()).optional(),
  model: z.record(z.unknown()).optional(),
  // Legacy / fallback fields
  overall_summary: z.string().optional(),
  segments: z.array(z.record(z.unknown())).optional(),
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Improvement = z.infer<typeof ImprovementSchema>;
export type ProfessionalEvaluation = z.infer<typeof ProfessionalEvaluationSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;
// Keep for backwards compat
export type AnalysisSegment = { speaker_id: string; summary: string };

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

/** Build S3 key for analysis (raw — note: legacy bucket files use the 'anslysis' typo) */
export function rawAnalysisKey(videoId: string, stem: string): string {
  return `video-review/${videoId}/ai/${stem}.anslysis.json`; // typo preserved from real S3 files
}

/** Build S3 key for analysis produced by the re-analysis worker (correct spelling) */
export function editedAnalysisKey(videoId: string, stem: string): string {
  return `video-review/${videoId}/ai/${stem}.analysis.edited.json`; // worker uses correct spelling
}

/** Build S3 key for raw video — tries <stem>.mp4 under raw/ */
export function rawVideoKey(videoId: string, stem: string): string {
  return `video-review/${videoId}/raw/${stem}.mp4`;
}
