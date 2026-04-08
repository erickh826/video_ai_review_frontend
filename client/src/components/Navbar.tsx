import { Link } from "wouter";
import { Moon, Sun, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";

interface NavbarProps {
  videoId?: string;
  stem?: string;
}

export function Navbar({ videoId, stem }: NavbarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="flex h-12 items-center gap-3 px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-foreground hover:opacity-80 transition-opacity">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            aria-label="Video AI Review"
            className="shrink-0"
          >
            <rect x="2" y="4" width="16" height="12" rx="2" className="fill-primary" />
            <path d="M18 9l4-2.5v7L18 11V9z" className="fill-primary" opacity="0.7" />
            <circle cx="8" cy="10" r="2" fill="white" opacity="0.9" />
            <path d="M12 8l-2 4h4l-2-4z" fill="white" opacity="0.5" />
          </svg>
          <span className="hidden sm:inline">影片 AI 評閱</span>
        </Link>

        {/* Breadcrumb */}
        {videoId && stem && (
          <>
            <span className="text-muted-foreground">/</span>
            <nav className="flex items-center gap-1 text-sm overflow-hidden">
              <span className="text-muted-foreground truncate max-w-[120px]" title={videoId}>{videoId}</span>
              <span className="text-muted-foreground">/</span>
              <Link
                href={`/videos/${videoId}/${stem}`}
                className="font-medium truncate max-w-[140px] hover:text-primary transition-colors"
                title={stem}
              >
                {stem}
              </Link>
              <span className="text-muted-foreground">/</span>
              <Link
                href={`/videos/${videoId}/${stem}/analysis`}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                analysis
              </Link>
            </nav>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Link href="/health">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" data-testid="button-health">
              <Activity className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">狀態</span>
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            data-testid="button-theme-toggle"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
