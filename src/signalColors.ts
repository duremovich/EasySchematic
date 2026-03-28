import type { SignalType } from "./types";

/** Default colors matching index.css :root variables */
export const DEFAULT_SIGNAL_COLORS: Record<SignalType, string> = {
  sdi: "#2563eb",
  hdmi: "#dc2626",
  ndi: "#16a34a",
  dante: "#ea580c",
  "analog-audio": "#854d0e",
  aes: "#7c3aed",
  dmx: "#b91c1c",
  madi: "#059669",
  usb: "#db2777",
  ethernet: "#0891b2",
  fiber: "#d97706",
  displayport: "#0d9488",
  hdbaset: "#9333ea",
  srt: "#15803d",
  genlock: "#475569",
  gpio: "#78716c",
  rs422: "#6d28d9",
  serial: "#525252",
  thunderbolt: "#4f46e5",
  composite: "#ca8a04",
  "s-video": "#b45309",
  vga: "#0369a1",
  dvi: "#1e40af",
  power: "#a16207",
  "power-l1": "#1a1a1a",
  "power-l2": "#cc0000",
  "power-l3": "#0066cc",
  "power-neutral": "#888888",
  "power-ground": "#00aa00",
  midi: "#c026d3",
  tally: "#be185d",
  spdif: "#a855f7",
  adat: "#0e7490",
  ultranet: "#059669",
  aes50: "#7c3aed",
  stageconnect: "#ea580c",
  wordclock: "#475569",
  aes67: "#3730a3",
  ydif: "#0e7490",
  rf: "#a21caf",
  st2110: "#3730a3",
  artnet: "#f59e0b",
  sacn: "#eab308",
  custom: "#64748b",
};

const STORAGE_KEY = "easyschematic-signal-colors";

/** Apply signal colors to CSS custom properties. */
export function applySignalColors(colors: Partial<Record<SignalType, string>>) {
  const root = document.documentElement;
  // Start from defaults, overlay with provided colors
  const merged = { ...DEFAULT_SIGNAL_COLORS, ...colors };
  for (const [type, color] of Object.entries(merged)) {
    root.style.setProperty(`--color-${type}`, color);
  }
}

/** Load saved signal colors from localStorage. */
export function loadSignalColors(): Record<SignalType, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SIGNAL_COLORS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SIGNAL_COLORS };
}

/** Save signal colors to localStorage (only non-default values). */
export function saveSignalColors(colors: Record<SignalType, string>) {
  const diff: Partial<Record<SignalType, string>> = {};
  for (const [type, color] of Object.entries(colors)) {
    if (color !== DEFAULT_SIGNAL_COLORS[type as SignalType]) {
      diff[type as SignalType] = color;
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
export function getSignalColorOverrides(colors: Record<SignalType, string>): Partial<Record<SignalType, string>> | undefined {
  const diff: Partial<Record<SignalType, string>> = {};
  for (const [type, color] of Object.entries(colors)) {
    if (color !== DEFAULT_SIGNAL_COLORS[type as SignalType]) {
      diff[type as SignalType] = color;
    }
  }
  return Object.keys(diff).length > 0 ? diff : undefined;
}

// Apply saved colors on module load
applySignalColors(loadSignalColors());
