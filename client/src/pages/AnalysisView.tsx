import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  FileText,
  Star,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";
import {
  type Analysis,
  type Skill,
  type Improvement,
  editedAnalysisKey,
  rawAnalysisKey,
  formatTime,
} from "@shared/schema";
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
      // Try edited (correct spelling) first, then legacy raw (typo spelling)
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
    // Auto-refetch every 5s while no data yet (background polling)
    refetchInterval: (query) => (query.state.data ? false : 5000),
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
                逐字稿
              </Button>
            </Link>
            <Separator orientation="vertical" className="h-5" />
            <h1 className="text-sm font-semibold text-foreground">分析結果</h1>
            <span className="text-xs text-muted-foreground truncate">{stem}</span>
            <div className="ml-auto flex items-center gap-2">
              {/* Show spinner when auto-polling */}
              {!analysisQuery.data && !analysisQuery.isError && (
                <span className="text-xs text-muted-foreground animate-pulse">
                  分析處理中…
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => analysisQuery.refetch()}
                disabled={analysisQuery.isLoading}
                className="gap-1.5 text-xs"
                data-testid="button-refresh-analysis"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", analysisQuery.isFetching && "animate-spin")} />
                重新整理
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
                    ? "分析尚未生成"
                    : "無法載入分析結果"}
                </p>
                <p className="text-xs text-center max-w-xs">
                  {(analysisQuery.error as Error)?.message === "Analysis not generated yet"
                    ? "請返回逐字稿編輯頁，點擊「儲存並重新分析」"
                    : (analysisQuery.error as Error)?.message}
                </p>
                <Link href={`/videos/${videoId}/${stem}`}>
                  <Button variant="outline" size="sm" className="gap-1.5 mt-2">
                    <FileText className="h-4 w-4" />
                    前往逐字稿編輯
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
  const eval_ = data.professional_evaluation;

  // ── v2 layout (professional_evaluation present) ───────────────────────────
  if (eval_) {
    return (
      <div className="space-y-6 max-w-3xl">
        {/* Meta */}
        {data.generated_at && (
          <p className="text-xs text-muted-foreground">
            生成時間：{new Date(data.generated_at).toLocaleString('zh-HK')}
          </p>
        )}

        {/* Overall performance */}
        {eval_.overall_performance && (
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              整體表現
            </h2>
            <p className="text-sm leading-relaxed text-foreground">{eval_.overall_performance}</p>
          </div>
        )}

        {/* Skills demonstrated */}
        {eval_.skills_demonstrated && eval_.skills_demonstrated.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-green-500" />
              展現的技巧（{eval_.skills_demonstrated.length}）
            </h2>
            <div className="space-y-3">
              {eval_.skills_demonstrated.map((skill, i) => (
                <SkillCard key={i} skill={skill} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Areas for improvement */}
        {eval_.areas_for_improvement && eval_.areas_for_improvement.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-yellow-500" />
              需改善的地方（{eval_.areas_for_improvement.length}）
            </h2>
            <div className="space-y-3">
              {eval_.areas_for_improvement.map((item, i) => (
                <ImprovementCard key={i} item={item} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Action items */}
        {eval_.action_items && eval_.action_items.length > 0 && (
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
              行動項目
            </h2>
            <ol className="space-y-2">
              {eval_.action_items.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-foreground">
                  <span className="text-muted-foreground font-mono text-xs mt-0.5 w-4 shrink-0">{i + 1}.</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  }

  // ── Legacy / unknown structure fallback ───────────────────────────────────
  return (
    <div className="space-y-4 max-w-3xl">
      {data.overall_summary && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            摘要
          </h2>
          <p className="text-sm leading-relaxed">{data.overall_summary}</p>
        </div>
      )}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          原始輸出
        </h2>
        <pre className="bg-muted/50 rounded-lg p-4 text-xs overflow-auto max-h-96 text-muted-foreground">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}

// ─── Skill card ───────────────────────────────────────────────────────────────

function SkillCard({ skill, index }: { skill: Skill; index: number }) {
  const score = skill.score ?? null;
  const max = skill.max_score ?? 5;
  const pct = score !== null ? Math.round((score / max) * 100) : null;

  return (
    <div
      data-testid={`card-skill-${index}`}
      className="bg-card border border-border rounded-lg p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Star className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
          <span className="text-sm font-medium text-foreground">{skill.skill_name}</span>
        </div>
        {score !== null && (
          <Badge variant="secondary" className="text-xs font-mono shrink-0">
            {score}/{max}
          </Badge>
        )}
      </div>

      {pct !== null && (
        <Progress value={pct} className="h-1.5" />
      )}

      {skill.description && (
        <p className="text-xs leading-relaxed text-muted-foreground">{skill.description}</p>
      )}

      {skill.evidence?.quote && (
        <EvidenceQuote
          quote={skill.evidence.quote}
          startMs={skill.evidence.start_ms}
          endMs={skill.evidence.end_ms}
        />
      )}
    </div>
  );
}

// ─── Improvement card ─────────────────────────────────────────────────────────

function ImprovementCard({ item, index }: { item: Improvement; index: number }) {
  return (
    <div
      data-testid={`card-improvement-${index}`}
      className="bg-card border border-border rounded-lg p-4 space-y-3"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />
        <span className="text-sm font-medium text-foreground">{item.issue}</span>
      </div>

      {item.suggestion && (
        <div className="flex items-start gap-2 pl-5">
          <Lightbulb className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-muted-foreground">{item.suggestion}</p>
        </div>
      )}

      {item.evidence?.quote && (
        <EvidenceQuote
          quote={item.evidence.quote}
          startMs={item.evidence.start_ms}
          endMs={item.evidence.end_ms}
        />
      )}
    </div>
  );
}

// ─── Evidence quote ───────────────────────────────────────────────────────────

function EvidenceQuote({
  quote,
  startMs,
  endMs,
}: {
  quote: string;
  startMs?: number;
  endMs?: number;
}) {
  return (
    <blockquote className="border-l-2 border-border pl-3 ml-1">
      <p className="text-xs italic text-muted-foreground leading-relaxed">「{quote}」</p>
      {(startMs !== undefined || endMs !== undefined) && (
        <p className="text-xs font-mono text-muted-foreground/60 mt-1">
          {startMs !== undefined ? formatTime(startMs) : "?"}
          {endMs !== undefined ? ` → ${formatTime(endMs)}` : ""}
        </p>
      )}
    </blockquote>
  );
}
