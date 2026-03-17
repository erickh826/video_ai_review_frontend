import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Navbar } from "@/components/Navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HealthData {
  ok: boolean;
  ts: string;
  env: Record<string, boolean>;
}

export default function HealthPage() {
  const healthQuery = useQuery({
    queryKey: ["/api/health"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/health");
      return res.json() as Promise<HealthData>;
    },
  });

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar />
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-12 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold text-foreground">System Health</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => healthQuery.refetch()}
            className="gap-1.5 text-xs"
            data-testid="button-refresh-health"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {healthQuery.isLoading && (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          )}

          {healthQuery.data && (
            <div>
              <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
                {healthQuery.data.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="text-sm font-medium">
                  {healthQuery.data.ok ? "Server OK" : "Server Error"}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(healthQuery.data.ts).toLocaleTimeString()}
                </span>
              </div>

              <div className="divide-y divide-border">
                {Object.entries(healthQuery.data.env).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between px-5 py-3" data-testid={`status-env-${key}`}>
                    <span className="text-xs font-mono text-foreground">{key}</span>
                    {val ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> set
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <XCircle className="h-3.5 w-3.5" /> not set
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
