import { cn } from "@/lib/utils";

const SPEAKER_COLORS: Record<string, string> = {
  "Guest-1": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/60",
  "Guest-2": "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/60",
  "Guest-3": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/60",
  "Guest-4": "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800/60",
  "Host":    "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/60",
};

function getColor(speaker: string): string {
  return (
    SPEAKER_COLORS[speaker] ??
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200"
  );
}

interface SpeakerBadgeProps {
  speaker: string;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  "data-testid"?: string;
}

export function SpeakerBadge({
  speaker,
  onClick,
  onContextMenu,
  "data-testid": testId,
}: SpeakerBadgeProps) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => e.key === "Enter" && onClick?.(e as any)}
      data-testid={testId}
      className={cn("speaker-badge transition-colors", getColor(speaker))}
      title="Click to cycle speaker / Right-click for menu"
    >
      {speaker}
    </span>
  );
}
