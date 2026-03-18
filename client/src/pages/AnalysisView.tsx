import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Navbar } from "@/components/Navbar";
import { SpeakerBadge } from "@/components/SpeakerBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { type Analysis, editedAnalysisKey, rawAnalysisKey, formatTime } from "@shared/schema";
import { cn } from "@/lib/utils";

const DEFAULT_BUCKET = import.meta.env.VITE_S3_BUCKET || "";

async function presignDownload(bucket: string, key: string): Promise<string> {
  const res = await apiRequest("POST", "/api/presign-download", { bucket, key });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Presign failed");
  return data.downloadUrl;
}

export default function AnalysisView() {
  const { videoId, stem } = useParams<{ videoId: string; stem: string }>();
  const bucket = DEFAULT_BUCKET || "—";

  const analysisQuery = useQuery({
    queryKey: ["/api/presign-download", videoId, stem, "analysis"],
    queryFn: async () => {
      // Try edited first, then raw analysis
      const candidates = [
        editedAnalysisKey(videoId!, stem!),
        rawAnalysisKey(videoId!, stem!),
      ];
      for (const key of candidates) {
        try {
          const url = await presignDownload(bucket, key);
          const res = await fetch(url);
          if (res.ok) return res.json() as Promise<Analysis>;
        } catch { /* try next */ }
      }
      throw new Error("Analysis not generated yet");
    },
    enabled: !!videoId && !!stem && bucket !== "—",
    retry: false,
  });

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <Navbar videoId={videoId} stem={stem} />

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Link href={`/videos/${videoId}/${stem}`}>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <ArrowLeft className="h-4 w-4" />
                Transcript
              </Button>
            </Link>
            <Separator orientation="vertical" className="h-5" />
            <h1 className="text-sm font-semibold text-foreground">Analysis Results</h1>
            <span className="text-xs text-muted-foreground truncate">{stem}</span>
            <div className="ml-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => analysisQuery.refetch()}
                disabled={analysisQuery.isLoading}
                className="gap-1.5 text-xs"
                data-testid="button-refresh-analysis"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", analysisQuery.isLoading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 px-6 py-6">
            {analysisQuery.isLoading && (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-40 w-full rounded-lg" />
                <Skeleton className="h-40 w-full rounded-lg" />
              </div>
            )}

            {analysisQuery.isError && (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 text-yellow-500/70" />
                <p className="text-sm font-medium">
                  {(analysisQuery.error as Error)?.message === "Analysis not generated yet"
                    ? "Analysis hasn't been generated yet"
                    : "Failed to load analysis"}
                </p>
                <p className="text-xs text-center max-w-xs">
                  {(analysisQuery.error as Error)?.message === "Analysis not generated yet"
                    ? "Go back to the Transcript editor and click \"Save & Run Analysis\""
                    : (analysisQuery.error as Error)?.message}
                </p>
                <Link href={`/videos/${videoId}/${stem}`}>
                  <Button variant="outline" size="sm" className="gap-1.5 mt-2">
                    <FileText className="h-4 w-4" />
                    Go to Transcript Editor
                  </Button>
                </Link>
              </div>
            )}

            {analysisQuery.data && <AnalysisContent data={analysisQuery.data} />}

            <div className="h-8" />
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}

// ─── Analysis content ─────────────────────────────────────────────────────────

function AnalysisContent({ data }: { data: Analysis }) {
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Meta */}
      {data.generated_at && (
        <p className="text-xs text-muted-foreground">
          Generated: {new Date(data.generated_at).toLocaleString()}
        </p>
      )}

      {/* Overall summary */}
      {data.overall_summary && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Overall Summary
          </h2>
          <p className="text-sm leading-relaxed text-foreground">{data.overall_summary}</p>
        </div>
      )}

      {/* Segments */}
      {data.segments && data.segments.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Segments ({data.segments.length})
          </h2>
          <div className="space-y-3">
            {data.segments.map((seg, i) => (
              <div
                key={i}
                data-testid={`card-segment-${i}`}
                className="bg-card border border-border rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <SpeakerBadge speaker={seg.speaker_id} />
                  {seg.sentiment && (
                    <SentimentBadge sentiment={seg.sentiment} />
                  )}
                  {seg.start_ms !== undefined && seg.end_ms !== undefined && (
                    <span className="text-xs font-mono text-muted-foreground ml-auto">
                      {formatTime(seg.start_ms)} → {formatTime(seg.end_ms)}
                    </span>
                  )}
                </div>

                <p className="text-sm leading-relaxed text-foreground">{seg.summary}</p>

                {seg.key_phrases && seg.key_phrases.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {seg.key_phrases.map((kp, ki) => (
                      <Badge key={ki} variant="secondary" className="text-xs font-normal">
                        {kp}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw JSON fallback */}
      {data.raw && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Raw Output
          </h2>
          <pre className="bg-muted/50 rounded-lg p-4 text-xs overflow-auto max-h-64 text-muted-foreground">
            {JSON.stringify(data.raw, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function SentimentBadge({ sentiment }: { sentiment: "positive" | "neutral" | "negative" }) {
  const config = {
    positive: { icon: TrendingUp, label: "Positive", color: "text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20" },
    neutral: { icon: Minus, label: "Neutral", color: "text-muted-foreground bg-muted/50 border-border" },
    negative: { icon: TrendingDown, label: "Negative", color: "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20" },
  };
  const { icon: Icon, label, color } = config[sentiment];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border", color)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
