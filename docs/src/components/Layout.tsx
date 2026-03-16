import type { ReactNode } from "react";

const navItems = [
  { hash: "overview", label: "Overview" },
  { hash: "getting-started", label: "Getting Started" },
  { label: "Guides", children: [
    { hash: "devices-and-ports", label: "Devices & Ports" },
    { hash: "connections", label: "Connections" },
    { hash: "connection-routing", label: "Connection Routing" },
    { hash: "rooms-and-grouping", label: "Rooms & Grouping" },
    { hash: "notes", label: "Notes" },
    { hash: "device-library", label: "Device Library" },
  ]},
  { hash: "printing", label: "Printing & Title Block" },
  { hash: "import-export", label: "Import / Export" },
];

function NavLink({ hash, label }: { hash: string; label: string }) {
  const current = window.location.hash.replace(/^#\/?/, "") || "overview";
  const isActive = current === hash;
  return (
    <a
      href={`#/${hash}`}
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

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <nav className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto p-4">
        <a href="#/" className="block text-lg font-bold text-gray-900 mb-4 px-3">
          EasySchematic
        </a>
        <div className="flex flex-col gap-0.5">
          {navItems.map((item) =>
            "children" in item && item.children ? (
              <div key={item.label} className="mt-3 mb-1">
                <div className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  {item.label}
                </div>
                {item.children.map((child) => (
                  <NavLink key={child.hash} hash={child.hash} label={child.label} />
                ))}
              </div>
            ) : (
              <NavLink key={item.hash!} hash={item.hash!} label={item.label} />
            )
          )}
        </div>
        <div className="mt-8 px-3">
          <a
            href="https://easyschematic.live/"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-blue-600 hover:text-blue-800"
          >
            Open App &rarr;
          </a>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="prose">
          {children}
        </div>
      </main>
    </div>
  );
}
