import { useState, useEffect } from "react";
import type { ReactNode } from "react";

const navItems = [
  { hash: "overview", label: "Overview" },
  { hash: "getting-started", label: "Getting Started" },
  { label: "Guides", children: [
    { hash: "devices-and-ports", label: "Devices & Ports" },
    { hash: "connections", label: "Connections" },
    { hash: "connection-routing", label: "Connection Routing" },
    { hash: "rooms-and-grouping", label: "Rooms & Grouping" },
    { hash: "notes", label: "Notes & Annotations" },
    { hash: "device-library", label: "Device Library" },
  ]},
  { hash: "pack-list", label: "Pack List & Reports" },
  { hash: "printing", label: "Printing & Title Block" },
  { hash: "import-export", label: "Import / Export" },
  { hash: "api", label: "Public API" },
];

function NavLink({ hash, label, onClick }: { hash: string; label: string; onClick?: () => void }) {
  const current = window.location.hash.replace(/^#\/?/, "") || "overview";
  const isActive = current === hash;
  return (
    <a
      href={`#/${hash}`}
      onClick={onClick}
      className={`block px-3 py-1.5 rounded text-sm transition-colors ${
        isActive
          ? "bg-blue-100 text-blue-800 font-medium"
          : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
      }`}
    >
      {label}
    </a>
  );
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex flex-col gap-0.5">
        {navItems.map((item) =>
          "children" in item && item.children ? (
            <div key={item.label} className="mt-3 mb-1">
              <div className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                {item.label}
              </div>
              {item.children.map((child) => (
                <NavLink key={child.hash} hash={child.hash} label={child.label} onClick={onNavigate} />
              ))}
            </div>
          ) : (
            <NavLink key={item.hash!} hash={item.hash!} label={item.label} onClick={onNavigate} />
          )
        )}
      </div>
      <div className="mt-8 px-3 flex flex-col gap-2">
        <a
          href="https://easyschematic.live/"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm text-blue-600 hover:text-blue-800"
        >
          Open App &rarr;
        </a>
        <a
          href="https://devices.easyschematic.live/"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm text-blue-600 hover:text-blue-800"
        >
          Device Database &rarr;
        </a>
        <a
          href="mailto:support@easyschematic.live"
          className="block text-sm text-blue-600 hover:text-blue-800"
        >
          Support &rarr;
        </a>
      </div>
    </>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu on hash change (navigation)
  useEffect(() => {
    const onHashChange = () => setMenuOpen(false);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <nav className="hidden md:flex w-64 shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto p-4 flex-col">
        <a href="#/" className="flex items-center gap-2 text-lg font-bold text-gray-900 mb-4 px-3">
          <img src="/favicon.svg" alt="" className="w-6 h-6" />
          EasySchematic
        </a>
        <NavContent />
      </nav>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 flex items-center h-12 px-3">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-700"
          aria-label="Toggle navigation"
        >
          {menuOpen ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
        <a href="#/" className="flex items-center gap-2 text-base font-bold text-gray-900 ml-2">
          <img src="/favicon.svg" alt="" className="w-5 h-5" />
          EasySchematic
        </a>
      </div>

      {/* Mobile nav overlay */}
      {menuOpen && (
        <>
          <div className="md:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setMenuOpen(false)} />
          <nav className="md:hidden fixed top-12 left-0 bottom-0 z-50 w-64 bg-gray-50 border-r border-gray-200 overflow-y-auto p-4">
            <NavContent onNavigate={() => setMenuOpen(false)} />
          </nav>
        </>
      )}

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 pt-16 md:pt-8">
        <div className="prose">
          {children}
        </div>
      </main>
    </div>
  );
}
