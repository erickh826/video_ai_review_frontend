import { useState } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { ArrowRight, Video, FileText, BarChart2 } from "lucide-react";

export default function HomePage() {
  const [, navigate] = useLocation();
  const [videoId, setVideoId] = useState("");
  const [stem, setStem] = useState("");

  const handleOpen = () => {
    if (videoId.trim() && stem.trim()) {
      navigate(`/videos/${videoId.trim()}/${stem.trim()}`);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md space-y-8">
          {/* Hero */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-primary/10 rounded-2xl mb-2">
              <Video className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">Video AI Review</h1>
            <p className="text-sm text-muted-foreground">
              Review and edit AI-generated transcripts, reassign speakers, and trigger re-analysis.
            </p>
          </div>

          {/* Open form */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-medium text-foreground">Open a video</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Video ID</label>
                <input
                  type="text"
                  value={videoId}
                  onChange={(e) => setVideoId(e.target.value)}
                  placeholder="e.g. ep42"
                  data-testid="input-video-id"
                  className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  onKeyDown={(e) => e.key === "Enter" && handleOpen()}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Stem (filename without extension)</label>
                <input
                  type="text"
                  value={stem}
                  onChange={(e) => setStem(e.target.value)}
                  placeholder="e.g. episode-42-raw"
                  data-testid="input-stem"
                  className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  onKeyDown={(e) => e.key === "Enter" && handleOpen()}
                />
              </div>
              <Button
                onClick={handleOpen}
                disabled={!videoId.trim() || !stem.trim()}
                className="w-full gap-2"
                data-testid="button-open-video"
              >
                Open Transcript Editor
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { icon: FileText, label: "Edit Transcript" },
              { icon: Video, label: "Click-to-Play" },
              { icon: BarChart2, label: "AI Analysis" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="bg-muted/40 rounded-lg p-3">
                <Icon className="h-4 w-4 text-primary mx-auto mb-1" />
                <p className="text-[11px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
