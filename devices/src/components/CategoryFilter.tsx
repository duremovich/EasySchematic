const CATEGORIES: { label: string; types: string[] }[] = [
  { label: "Sources", types: ["camera", "ptz-camera", "graphics", "computer", "media-player"] },
  { label: "Peripherals", types: ["mouse", "keyboard"] },
  { label: "Switching", types: ["switcher", "router"] },
  { label: "Processing", types: ["converter", "scaler", "adapter", "frame-sync", "multiviewer"] },
  { label: "Distribution", types: ["da", "video-wall-controller"] },
  { label: "Monitoring", types: ["monitor", "tv"] },
  { label: "Projection", types: ["projector"] },
  { label: "Audio", types: ["audio-mixer", "audio-processor", "speaker", "headphones", "microphone", "wireless-mic"] },
  { label: "Recording", types: ["recorder"] },
  { label: "Streaming", types: ["encoder", "decoder"] },
  { label: "Network", types: ["network-switch"] },
  { label: "Infrastructure", types: ["patch-panel", "power-conditioner", "ups"] },
  { label: "Control", types: ["control-surface"] },
];

interface CategoryFilterProps {
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}

export default function CategoryFilter({ selected, onChange }: CategoryFilterProps) {
  const toggle = (label: string) => {
    const next = new Set(selected);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    onChange(next);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onChange(new Set())}
        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
          selected.size === 0
            ? "bg-slate-900 text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        All
      </button>
      {CATEGORIES.map((cat) => (
        <button
          key={cat.label}
          onClick={() => toggle(cat.label)}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            selected.has(cat.label)
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}

export { CATEGORIES };
