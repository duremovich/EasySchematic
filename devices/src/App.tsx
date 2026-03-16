import { useState, useEffect } from "react";
import BrowsePage from "./pages/BrowsePage";
import DeviceDetailPage from "./pages/DeviceDetailPage";
import AdminEditorPage from "./pages/AdminEditorPage";

function parseHash(): { page: string; id?: string } {
  const hash = window.location.hash.slice(1) || "/";
  if (hash.startsWith("/admin/")) return { page: "admin", id: hash.slice(7) };
  if (hash === "/admin") return { page: "admin" };
  if (hash.startsWith("/device/")) return { page: "device", id: hash.slice(8) };
  return { page: "browse" };
}

export default function App() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="min-h-full flex flex-col">
      <nav className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between">
        <a href="#/" className="text-lg font-semibold tracking-tight hover:text-slate-300 transition-colors">
          EasySchematic <span className="text-slate-400 font-normal">Devices</span>
        </a>
        <div className="flex items-center gap-4">
          <a href="https://easyschematic.live" className="text-sm text-slate-400 hover:text-white transition-colors">
            Main App
          </a>
          <a href="#/admin" className="text-sm text-slate-400 hover:text-white transition-colors">
            Admin
          </a>
        </div>
      </nav>
      <main className="flex-1">
        {route.page === "browse" && <BrowsePage />}
        {route.page === "device" && route.id && <DeviceDetailPage id={route.id} />}
        {route.page === "admin" && <AdminEditorPage id={route.id} />}
      </main>
    </div>
  );
}
