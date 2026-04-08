import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/Navbar";
import { SpeakerBadge } from "@/components/SpeakerBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Save,
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  ChevronRight,
  Loader2,
  CheckCircle2,
  BarChart2,
} from "lucide-react";
import {
  type Phrase,
  type Transcript,
  formatTime,
  isSuspect,
  editedTranscriptKey,
  rawVideoKey,
  editedAnalysisKey,
  rawTranscriptKey,
  rawAnalysisKey,
} from "@shared/schema";
import { cn } from "@/lib/utils";

const DEFAULT_BUCKET = import.meta.env.VITE_S3_BUCKET || "";
const SPEAKERS = ["Guest-1", "Guest-2", "Guest-3", "Guest-4", "Host"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function presignDownload(bucket: string, key: string): Promise<string> {
  const res = await apiRequest("POST", "/api/presign-download", { bucket, key });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Presign failed");
  return data.downloadUrl;
}

async function presignUpload(bucket: string, key: string): Promise<string> {
  const res = await apiRequest("POST", "/api/presign-upload", {
    bucket,
    key,
    contentType: "application/json",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Presign upload failed");
  return data.uploadUrl;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved" | "error";
type AnalysisStatus = "idle" | "queued" | "polling" | "done" | "timeout";

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TranscriptEditor() {
  const { videoId, stem } = useParams<{ videoId: string; stem: string }>();
  const { toast } = useToast();

  // ── State ─────────────────────────────────────────────────────────────────
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [bucket, setBucket] = useState(DEFAULT_BUCKET);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [showSuspectOnly, setShowSuspectOnly] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ idx: number; x: number; y: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);

  // ── Load transcript ───────────────────────────────────────────────────────
  const transcriptQuery = useQuery({
    queryKey: ["/api/presign-download", videoId, stem, "transcript"],
    queryFn: async () => {
      if (!bucket || !videoId || !stem) throw new Error("Missing params");
      // Priority: edited → raw transcription.json
      const candidates = [
        editedTranscriptKey(videoId, stem),
        rawTranscriptKey(videoId, stem),
      ];
      for (const key of candidates) {
        try {
          const url = await presignDownload(bucket, key);
          const res = await fetch(url);
          if (res.ok) return res.json() as Promise<Transcript>;
        } catch { /* try next */ }
      }
      throw new Error("Transcript not found in S3. Check bucket/videoId/stem.");
    },
    enabled: !!bucket && !!videoId && !!stem,
    retry: false,
  });

  // ── Load video URL ────────────────────────────────────────────────────────
  const videoUrlQuery = useQuery({
    queryKey: ["/api/presign-download", videoId, stem, "video"],
    queryFn: async () => {
      if (!bucket || !videoId || !stem) throw new Error("Missing params");
      // Try <stem>.mp4 and <videoId>.mp4 under raw/
      const candidates = [
        rawVideoKey(videoId, stem),
        `video-review/${videoId}/raw/${videoId}.mp4`,
      ];
      for (const key of candidates) {
        try {
          return await presignDownload(bucket, key);
        } catch { /* try next */ }
      }
      throw new Error("Video not found in S3");
    },
    enabled: !!bucket && !!videoId && !!stem,
    retry: false,
    staleTime: 1000 * 60 * 50, // ~50 min (near S3 expiry)
  });

  // Populate phrases from transcript
  useEffect(() => {
    if (!transcriptQuery.data) return;
    const loaded = transcriptQuery.data.phrases.map((p, i) => ({
      ...p,
      id: p.id || `phrase-${i}`,
      speaker_id_raw: p.speaker_id_raw || p.speaker_id,
    }));
    setPhrases(loaded);
  }, [transcriptQuery.data]);

  // ── Click-to-play ─────────────────────────────────────────────────────────
  const playPhrase = useCallback((idx: number) => {
    const video = videoRef.current;
    if (!video || !phrases[idx]) return;

    const { offset_ms, duration_ms } = phrases[idx];
    const maxTime = video.duration * 1000;
    const safeOffset = Math.min(offset_ms, maxTime - 50);

    // Cancel previous timer
    if (playTimerRef.current) clearTimeout(playTimerRef.current);

    video.currentTime = safeOffset / 1000;
    video.play().catch(() => {});
    setIsPlaying(true);
    setActiveIdx(idx);

    const playDuration = Math.min(duration_ms + 200, maxTime - safeOffset);
    playTimerRef.current = setTimeout(() => {
      video.pause();
      setIsPlaying(false);
    }, playDuration);
  }, [phrases]);

  // ── Speaker toggle ────────────────────────────────────────────────────────
  const cycleSpeaker = useCallback((idx: number) => {
    setPhrases((prev) => {
      const next = [...prev];
      const current = next[idx].speaker_id;
      const allSpeakers = [...new Set(prev.map((p) => p.speaker_id))].sort();
      const pos = allSpeakers.indexOf(current);
      next[idx] = {
        ...next[idx],
        speaker_id: allSpeakers[(pos + 1) % allSpeakers.length],
      };
      return next;
    });
  }, []);

  const setSpeaker = useCallback((idx: number, speaker: string) => {
    setPhrases((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], speaker_id: speaker };
      return next;
    });
    setContextMenu(null);
  }, []);

  // ── Save & Trigger ────────────────────────────────────────────────────────
  const handleSaveAndRun = useCallback(async () => {
    if (!bucket || !videoId || !stem) {
      toast({ title: "Missing configuration", description: "No bucket / videoId / stem", variant: "destructive" });
      return;
    }
    setSaveStatus("saving");
    const key = editedTranscriptKey(videoId, stem);

    const editedTranscript = {
      meta: {
        edited: true,
        edited_at: new Date().toISOString(),
        edited_by: "web_ui",
        edit_source: "web_ui",
      },
      phrases,
    };

    try {
      // 1. Presign upload
      const uploadUrl = await presignUpload(bucket, key);
      // 2. PUT to S3
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editedTranscript),
      });
      if (!putRes.ok) throw new Error("S3 upload failed");

      setSaveStatus("saved");
      toast({ title: "已儲存至 S3", description: key });

      // 3. Trigger analysis
      setAnalysisStatus("queued");
      const triggerRes = await apiRequest("POST", "/api/trigger-analysis", { bucket, key });
      const triggerData = await triggerRes.json();
      if (!triggerRes.ok) throw new Error(triggerData.error);

      toast({ title: "分析已排入佇列", description: `messageId: ${triggerData.messageId}` });
      startPolling();
    } catch (err: any) {
      setSaveStatus("error");
      toast({ title: "儲存失敗", description: err.message, variant: "destructive" });
    }
  }, [bucket, videoId, stem, phrases, toast]);

  // ── Polling for analysis ──────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    setAnalysisStatus("polling");
    pollCountRef.current = 0;

    const poll = async () => {
      pollCountRef.current++;
      if (pollCountRef.current > 40) {
        setAnalysisStatus("timeout");
        toast({ title: "分析逾時", description: "請稍後重新整理" });
        return;
      }
      try {
        const url = await presignDownload(bucket, editedAnalysisKey(videoId!, stem!));
        const res = await fetch(url);
        if (res.ok) {
          setAnalysisStatus("done");
          toast({ title: "分析完成", description: "可在分析頁查看結果" });
          return;
        }
      } catch {
        // 404 = not ready yet
      }
      pollTimerRef.current = setTimeout(poll, 4000);
    };
    poll();
  }, [bucket, videoId, stem, toast]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  // ── Context menu ──────────────────────────────────────────────────────────
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const allSpeakers = [...new Set(phrases.map((p) => p.speaker_id))].sort();
  const displayPhrases = showSuspectOnly ? phrases.filter(isSuspect) : phrases;
  const suspectCount = phrases.filter(isSuspect).length;

  // ── Config banner ─────────────────────────────────────────────────────────
  const showConfigBanner = !bucket;

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <Navbar videoId={videoId} stem={stem} />

      {showConfigBanner && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Set <code className="bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">VITE_S3_BUCKET</code> in <code>.env</code> to connect to S3, or enter the bucket below.</span>
        </div>
      )}

      {/* 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Media + Config ─────────────────────────────────────── */}
        <aside className="w-72 xl:w-80 flex-shrink-0 border-r border-border flex flex-col bg-card">
          <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1">
            {/* Bucket config */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">S3 Bucket</label>
              <input
                type="text"
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                placeholder="video-review-ai-useast"
                data-testid="input-bucket"
                className="w-full px-3 py-1.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Media player */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Video</label>
              {videoUrlQuery.isLoading && (
                <Skeleton className="w-full aspect-video rounded-md" />
              )}
              {videoUrlQuery.isError && (
                <div className="w-full aspect-video rounded-md bg-muted flex items-center justify-center">
                  <p className="text-xs text-muted-foreground text-center px-2">
                    Video unavailable<br />(check S3 config)
                  </p>
                </div>
              )}
              {videoUrlQuery.data && (
                <video
                  ref={videoRef}
                  src={videoUrlQuery.data}
                  controls
                  data-testid="video-player"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              )}
              {!videoUrlQuery.data && !videoUrlQuery.isLoading && !videoUrlQuery.isError && (
                <div className="w-full aspect-video rounded-md bg-muted flex items-center justify-center">
                  <p className="text-xs text-muted-foreground">Configure S3 to load video</p>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-muted/50 rounded-md px-3 py-2">
                <div className="text-muted-foreground">句數</div>
                <div className="font-semibold text-foreground text-sm" data-testid="text-phrase-count">{phrases.length}</div>
              </div>
              <div className="bg-muted/50 rounded-md px-3 py-2">
                <div className="text-muted-foreground">疑似錯誤</div>
                <div className="font-semibold text-destructive text-sm" data-testid="text-suspect-count">{suspectCount}</div>
              </div>
              <div className="bg-muted/50 rounded-md px-3 py-2 col-span-2">
                <div className="text-muted-foreground mb-1">說話者</div>
                <div className="flex flex-wrap gap-1">
                  {allSpeakers.map((s) => (
                    <SpeakerBadge key={s} speaker={s} />
                  ))}
                </div>
              </div>
            </div>

            <Separator />

            {/* Save panel */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">儲存並重新分析</span>
                {analysisStatus === "done" && (
                  <Link href={`/videos/${videoId}/${stem}/analysis`}>
                    <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-primary">
                      View <ChevronRight className="h-3 w-3" />
                    </Button>
                  </Link>
                )}
              </div>

              <Button
                onClick={handleSaveAndRun}
                disabled={saveStatus === "saving" || phrases.length === 0}
                className="w-full gap-2"
                data-testid="button-save-run"
              >
                {saveStatus === "saving" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                ) : saveStatus === "saved" ? (
                  <><CheckCircle2 className="h-4 w-4" /> Saved & Queued</>
                ) : (
                  <><Save className="h-4 w-4" /> Save & Run Analysis</>
                )}
              </Button>

              {/* Analysis status */}
              <AnalysisStatusBadge status={analysisStatus} />
            </div>

            {/* View analysis link */}
            <Link href={`/videos/${videoId}/${stem}/analysis`}>
              <Button variant="outline" size="sm" className="w-full gap-2 text-xs">
                <BarChart2 className="h-3.5 w-3.5" />
                查看分析
              </Button>
            </Link>
          </div>
        </aside>

        {/* ── Center: Transcript list ─────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-background/80 backdrop-blur-sm">
            <span className="text-sm font-medium text-foreground truncate">{stem}</span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant={showSuspectOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowSuspectOnly((v) => !v)}
                className="gap-1.5 text-xs"
                data-testid="button-filter-suspect"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Suspects {suspectCount > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{suspectCount}</Badge>}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (transcriptQuery.data) {
                    const loaded = transcriptQuery.data.phrases.map((p, i) => ({
                      ...p,
                      id: p.id || `phrase-${i}`,
                      speaker_id_raw: p.speaker_id_raw || p.speaker_id,
                    }));
                    setPhrases(loaded);
                    toast({ title: "逐字稿已重置" });
                  }
                }}
                className="gap-1.5 text-xs text-muted-foreground"
                data-testid="button-reset"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重置
              </Button>
            </div>
          </div>

          {/* Phrase list */}
          <ScrollArea className="flex-1 px-2 py-2">
            {transcriptQuery.isLoading && (
              <div className="space-y-2 px-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
              </div>
            )}

            {transcriptQuery.isError && (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
                <AlertTriangle className="h-6 w-6 text-destructive/60" />
                <p className="text-sm">無法載入逐字稿</p>
                <p className="text-xs">{(transcriptQuery.error as Error)?.message}</p>
              </div>
            )}

            {!transcriptQuery.isLoading && !transcriptQuery.isError && phrases.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
                <p className="text-sm">No transcript loaded.</p>
                <p className="text-xs">Configure the S3 bucket and videoId/stem to load.</p>
              </div>
            )}

            {displayPhrases.map((phrase, displayIdx) => {
              const realIdx = phrases.findIndex((p) => p.id === phrase.id);
              const isActive = activeIdx === realIdx;
              const suspect = isSuspect(phrase);

              return (
                <div
                  key={phrase.id}
                  data-testid={`row-phrase-${phrase.id}`}
                  onClick={() => playPhrase(realIdx)}
                  className={cn(
                    "transcript-row",
                    isActive && "active",
                    suspect && "suspect"
                  )}
                >
                  {/* Speaker badge */}
                  <SpeakerBadge
                    speaker={phrase.speaker_id}
                    data-testid={`badge-speaker-${phrase.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      cycleSpeaker(realIdx);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ idx: realIdx, x: e.clientX, y: e.clientY });
                    }}
                  />

                  {/* Text — click row to play, double-click text to edit */}
                  <div className="flex-1 flex items-start gap-1 min-w-0">
                    <textarea
                      value={phrase.text}
                      rows={Math.max(1, Math.ceil(phrase.text.length / 60))}
                      data-testid={`textarea-phrase-${phrase.id}`}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        const val = e.target.value;
                        setPhrases((prev) => {
                          const next = [...prev];
                          next[realIdx] = { ...next[realIdx], text: val };
                          return next;
                        });
                      }}
                      className="flex-1 w-full text-sm leading-relaxed bg-transparent border-0 outline-none resize-none focus:bg-muted/40 focus:ring-1 focus:ring-ring rounded px-1 -mx-1 text-foreground transition-colors"
                    />
                    {suspect && (
                      <AlertTriangle className="shrink-0 h-3 w-3 mt-1 text-destructive/60" />
                    )}
                  </div>

                  {/* Time */}
                  <span className="time-label">{formatTime(phrase.offset_ms)}</span>

                  {/* Play indicator */}
                  {isActive && (
                    <span className="shrink-0">
                      {isPlaying ? (
                        <Pause className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Play className="h-3.5 w-3.5 text-primary" />
                      )}
                    </span>
                  )}
                </div>
              );
            })}
            <div className="h-8" />
          </ScrollArea>
        </main>

        {/* ── Right: Side panel (save / analysis summary) ─────────────── */}
        <aside className="w-64 xl:w-72 flex-shrink-0 border-l border-border bg-card flex flex-col">
          <div className="p-4 border-b border-border">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Speaker Overview
            </h2>
          </div>
          <ScrollArea className="flex-1 p-4">
            {allSpeakers.length === 0 ? (
              <p className="text-xs text-muted-foreground">載入逐字稿後可查看說話者</p>
            ) : (
              <div className="space-y-3">
                {allSpeakers.map((speaker) => {
                  const speakerPhrases = phrases.filter((p) => p.speaker_id === speaker);
                  const totalMs = speakerPhrases.reduce((acc, p) => acc + p.duration_ms, 0);
                  const totalPhraseDuration = phrases.reduce((acc, p) => acc + p.duration_ms, 0);
                  const pct = totalPhraseDuration > 0
                    ? Math.round((totalMs / totalPhraseDuration) * 100)
                    : 0;

                  return (
                    <div key={speaker} data-testid={`card-speaker-${speaker}`}>
                      <div className="flex items-center justify-between mb-1">
                        <SpeakerBadge speaker={speaker} />
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {speakerPhrases.length} 句 · {formatTime(totalMs)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </aside>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover text-popover-foreground border border-border rounded-md shadow-md py-1 min-w-[120px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-3 py-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            Set Speaker
          </p>
          {SPEAKERS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeaker(contextMenu.idx, s)}
              data-testid={`menu-speaker-${s}`}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Analysis status badge ────────────────────────────────────────────────────

function AnalysisStatusBadge({ status }: { status: AnalysisStatus }) {
  if (status === "idle") return null;

  const config: Record<AnalysisStatus, { label: string; color: string }> = {
    idle: { label: "", color: "" },
    queued: { label: "排隊中", color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" },
    polling: { label: "處理中…", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
    done: { label: "分析完成", color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" },
    timeout: { label: "逾時 — 請稍後重新整理", color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20" },
  };

  const { label, color } = config[status];
  return (
    <div className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-xs", color)}>
      {(status === "polling" || status === "queued") && (
        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
      )}
      {status === "done" && <CheckCircle2 className="h-3 w-3 shrink-0" />}
      {label}
    </div>
  );
}
