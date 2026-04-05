import { useEffect } from "react";
import { sponsors } from "../sponsors";

const features = [
  {
    title: "Drag-and-Drop Device Library",
    description:
      "500+ professional AV device templates — cameras, switchers, routers, audio consoles, media servers, displays, and more. Drag devices onto the canvas and connect them in seconds.",
  },
  {
    title: "Color-Coded Signal Types",
    description:
      "35+ signal types including SDI, HDMI, NDI, Dante, AES67, MADI, DMX, Analog Audio, HDBaseT, ST 2110, and more — each with a distinct color so signal paths are instantly readable.",
  },
  {
    title: "Smart Connection Routing",
    description:
      "Connections route around devices automatically. Shared vertical paths, consistent spacing, and overlap avoidance keep your system diagrams clean and professional.",
  },
  {
    title: "Room Grouping",
    description:
      "Organize devices into rooms, racks, or logical groups. Move and resize groups freely. Nest rooms to represent control rooms, stages, OB trucks, and equipment closets.",
  },
  {
    title: "Pack Lists & Cable Schedules",
    description:
      "Generate paperwork straight from your schematic — pack lists with every device and its details, cable schedules with signal types, source/destination, and cable IDs. No more maintaining separate spreadsheets.",
  },
  {
    title: "Export to DXF, PDF & PNG",
    description:
      "Export your AV schematics as DXF for AutoCAD, PDF for print, or PNG for presentations. Configurable page sizes, title blocks, and print layouts built for AV integration shops.",
  },
  {
    title: "Community Device Database",
    description:
      "Browse and contribute to a growing library of real-world AV device templates. Search by manufacturer, model, or signal type. Every template includes accurate port layouts and connector specs.",
  },
  {
    title: "Free & Browser-Based",
    description:
      "No installs, no accounts, no subscriptions. Your schematics stay in your browser. Share via link, import/export JSON files, or use the public API.",
  },
];

const signalSamples = [
  { name: "SDI", color: "var(--color-sdi)" },
  { name: "HDMI", color: "var(--color-hdmi)" },
  { name: "NDI", color: "var(--color-ndi)" },
  { name: "Dante", color: "var(--color-dante)" },
  { name: "AES67", color: "var(--color-aes)" },
  { name: "MADI", color: "var(--color-madi)" },
  { name: "DMX", color: "var(--color-dmx)" },
  { name: "HDBaseT", color: "var(--color-hdbaset)" },
  { name: "Analog", color: "var(--color-analog-audio)" },
  { name: "ST 2110", color: "var(--color-sdi)" },
  { name: "USB", color: "var(--color-usb)" },
  { name: "Ethernet", color: "var(--color-ethernet)" },
];

function openEditor() {
  localStorage.setItem("easyschematic-skip-landing", "1");
  window.location.href = "/";
}

export default function LandingPage() {
  // Override overflow:hidden from index.css so landing page can scroll
  useEffect(() => {
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    document.getElementById("root")!.style.overflow = "auto";
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.getElementById("root")!.style.overflow = "";
    };
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900" style={{ overflow: "auto", fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      {/* Top bar */}
      <nav className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="w-10 h-10 rounded-lg" />
          <span className="text-xl font-bold tracking-tight text-white">EasySchematic</span>
        </div>
      </nav>

      {/* Hero */}
      <header className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-16 md:py-24">
          <h1 className="text-2xl md:text-3xl font-semibold leading-tight mb-4 text-slate-300">
            AV Signal Flow Diagram Tool
          </h1>
          <p className="text-base md:text-lg text-slate-400 max-w-2xl mb-3">
            Design AV system diagrams, block diagrams, and signal flow schematics for
            broadcast, live production, and AV integration. Free and browser-based.
          </p>
          <p className="text-slate-500 mb-8">
            500+ device templates &middot; 35+ signal types &middot;
            Smart edge routing &middot; DXF/PDF/PNG export
          </p>
          <button
            onClick={openEditor}
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg text-lg transition-colors cursor-pointer"
          >
            Open Editor
          </button>
        </div>
      </header>

      {/* Screenshot / OG image */}
      <section className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <img
            src="/landing-screenshot.png"
            alt="EasySchematic editor showing a signal flow diagram with Thunderbolt, HDMI, SDI, and USB connections between Mac Studios, adapters, video wall controllers, and converters"
            className="w-full rounded-lg shadow-lg border border-slate-200"
            loading="eager"
          />
        </div>
      </section>

      {/* Supported by */}
      <section className="border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
            Supported by
          </p>
          <div className="flex justify-center gap-8">
            {sponsors.map((s) => (
              <a
                key={s.name}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                title={s.name}
              >
                <img
                  src={s.logo}
                  alt={s.name}
                  className="h-16 rounded-lg"
                />
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Signal type badges */}
      <section className="border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <h2 className="text-xl font-semibold text-center mb-6 text-gray-800">
            Built for Every Signal Type in Your AV System
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            {signalSamples.map((s) => (
              <span
                key={s.name}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-sm font-medium text-gray-700"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                {s.name}
              </span>
            ))}
            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-sm text-gray-500">
              + 23 more
            </span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-center mb-12 text-gray-900">
            Everything You Need to Document AV Signal Flow
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            {features.map((f) => (
              <div key={f.title}>
                <h3 className="text-lg font-semibold mb-2 text-gray-900">
                  {f.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases / SEO content */}
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-center mb-4 text-gray-900">
            Built for AV Professionals
          </h2>
          <p className="text-center text-gray-600 max-w-2xl mx-auto mb-10">
            Whether you're drawing a broadcast truck block diagram, documenting a
            corporate AV install, or building hook-up sheets for a live event,
            EasySchematic helps you create clean, readable AV schematics.
          </p>
          <div className="grid md:grid-cols-3 gap-6 text-center">
            {[
              {
                heading: "Broadcast & Live Production",
                text: "Map SDI, NDI, and MADI signal paths through cameras, switchers, multiviewers, and routers. Document entire OB trucks and control rooms.",
              },
              {
                heading: "AV Integration & Install",
                text: "Design hook-up sheets, system block diagrams, and AV schematics for conference rooms, auditoriums, and venues. Export DXF for CAD workflows.",
              },
              {
                heading: "Event & Rental",
                text: "Plan signal flow for live events, rental packages, and temporary installations. Share schematics with your crew via link.",
              },
            ].map((uc) => (
              <div key={uc.heading} className="bg-white rounded-lg p-6 border border-slate-200">
                <h3 className="font-semibold mb-2 text-gray-900">
                  {uc.heading}
                </h3>
                <p className="text-sm text-gray-600">{uc.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-bold mb-4">
            Start Drawing Your Signal Flow
          </h2>
          <p className="text-slate-400 mb-8">
            No signup required. Your work is saved locally in your browser.
          </p>
          <button
            onClick={openEditor}
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg text-lg transition-colors cursor-pointer"
          >
            Open Editor
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-400 text-sm">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-wrap gap-x-8 gap-y-2 justify-center">
          <a href="https://docs.easyschematic.live" className="hover:text-white transition-colors">
            Documentation
          </a>
          <a href="https://devices.easyschematic.live" className="hover:text-white transition-colors">
            Device Database
          </a>
          <a href="https://github.com/duremovich/EasySchematic" className="hover:text-white transition-colors">
            GitHub
          </a>
          <a href="https://discord.gg/dxXn3Jk2a6" className="hover:text-white transition-colors">
            Discord
          </a>
          <a href="mailto:support@easyschematic.live" className="hover:text-white transition-colors">
            Support
          </a>
        </div>
      </footer>
    </div>
  );
}
