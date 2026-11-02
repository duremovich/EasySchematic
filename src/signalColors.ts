import type { BuiltinSignalType, SignalType } from "./types";
import { DEFAULT_SIGNAL_COLORS } from "./builtinTypeTables";
import { signalColor } from "./typeRegistry";

/** The built-in palette: each built-in signal has a `--color-<id>` CSS variable with this
 *  default. Non-built-in signals have no variable; their color is a literal hex. */
export { DEFAULT_SIGNAL_COLORS };

/** Every built-in's color, plus any overrides. */
export type SignalColorMap = Record<BuiltinSignalType, string> & Partial<Record<SignalType, string>>;

const STORAGE_KEY = "easyschematic-signal-colors";

/** Apply signal colors to CSS custom properties. */
export function applySignalColors(colors: Partial<Record<SignalType, string>>) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // Start from defaults, overlay with provided colors
  const merged = { ...DEFAULT_SIGNAL_COLORS, ...colors };
  for (const [type, color] of Object.entries(merged)) {
    root.style.setProperty(`--color-${type}`, color);
  }
}

/** Load saved signal colors from localStorage. */
export function loadSignalColors(): SignalColorMap {
  if (typeof localStorage === "undefined") return { ...DEFAULT_SIGNAL_COLORS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SIGNAL_COLORS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SIGNAL_COLORS };
}

/** Save signal colors to localStorage (only non-default values). */
export function saveSignalColors(colors: Partial<Record<SignalType, string>>) {
  const diff: Partial<Record<SignalType, string>> = {};
  for (const [type, color] of Object.entries(colors)) {
    if (color !== signalColor(type)) {
      diff[type] = color;
    }
  }
  if (Object.keys(diff).length > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diff));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Get non-default signal colors for saving to a schematic file.
 * Returns undefined if all colors are defaults (keeps file clean).
 */
export function getSignalColorOverrides(colors: Partial<Record<SignalType, string>>): Partial<Record<SignalType, string>> | undefined {
  const diff: Partial<Record<SignalType, string>> = {};
  for (const [type, color] of Object.entries(colors)) {
    if (color !== signalColor(type)) {
      diff[type] = color;
    }
  }
  return Object.keys(diff).length > 0 ? diff : undefined;
}

// Apply saved colors on module load
applySignalColors(loadSignalColors());
