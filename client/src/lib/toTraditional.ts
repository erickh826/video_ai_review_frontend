/**
 * Converts Simplified Chinese text to Traditional Chinese (zh-HK).
 * Uses chinese-conv under the hood — pure JS, no network calls.
 * Returns the original string unchanged for non-Chinese text.
 */
import { tify } from "chinese-conv";

export function toTraditional(text: string | undefined | null): string {
  if (!text) return text ?? "";
  return tify(text);
}
