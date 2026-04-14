import { useState, useEffect } from "react";
import Layout from "./components/Layout";
import { getPath, onNavigate } from "./navigate";
import OverviewPage from "./pages/Overview";
import GettingStartedPage from "./pages/GettingStarted";
import DevicesAndPortsPage from "./pages/DevicesAndPorts";
import ConnectionsPage from "./pages/Connections";
import EdgeRoutingPage from "./pages/EdgeRouting";
import RoomsAndGroupingPage from "./pages/RoomsAndGrouping";
import DeviceLibraryPage from "./pages/DeviceLibrary";
import ImportExportPage from "./pages/ImportExport";
import DeviceTemplateSchemaPage from "./pages/DeviceTemplateSchema";
import NotesPage from "./pages/Notes";
import PrintingPage from "./pages/Printing";
import PackListPage from "./pages/PackList";
import ApiPage from "./pages/Api";
import SelfHostingPage from "./pages/SelfHosting";

const routes: Record<string, { title: string; component: React.FC }> = {
  "": { title: "Overview", component: OverviewPage },
  overview: { title: "Overview", component: OverviewPage },
  "getting-started": { title: "Getting Started", component: GettingStartedPage },
  "devices-and-ports": { title: "Devices & Ports", component: DevicesAndPortsPage },
  connections: { title: "Connections", component: ConnectionsPage },
  "connection-routing": { title: "Connection Routing", component: EdgeRoutingPage },
  "rooms-and-grouping": { title: "Rooms & Grouping", component: RoomsAndGroupingPage },
  notes: { title: "Notes & Annotations", component: NotesPage },
  "device-library": { title: "Device Library", component: DeviceLibraryPage },
  "pack-list": { title: "Pack List & Reports", component: PackListPage },
  printing: { title: "Printing & Title Block", component: PrintingPage },
  "import-export": { title: "Import / Export", component: ImportExportPage },
  "device-template-schema": { title: "Device Template Schema", component: DeviceTemplateSchemaPage },
  "self-hosting": { title: "Self-Hosting", component: SelfHostingPage },
  api: { title: "Public API", component: ApiPage },
};

function initPath(): string {
  // Redirect legacy hash-based URLs to path equivalents
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash && hash in routes) {
    window.history.replaceState({}, "", "/" + hash);
    return hash;
  }
  return getPath();
}

export default function DocsApp() {
  const [path, setPath] = useState(initPath);

  useEffect(() => {
    return onNavigate(() => setPath(getPath()));
  }, []);

  const route = routes[path] ?? routes[""];
  const Page = route.component;

  useEffect(() => {
    document.title = `${route.title} — EasySchematic Docs`;
    document.querySelector("main")?.scrollTo(0, 0);

    // Update JSON-LD structured data per page
    const slug = path || "overview";
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      "headline": `${route.title} — EasySchematic Docs`,
      "url": `https://docs.easyschematic.live/${slug}`,
      "isPartOf": { "@type": "WebSite", "name": "EasySchematic Docs", "url": "https://docs.easyschematic.live" },
    };
    let script = document.querySelector<HTMLScriptElement>('script[data-jsonld]');
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute("data-jsonld", "");
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(jsonLd);
  }, [path, route.title]);

  return (
    <Layout>
      <Page />
    </Layout>
  );
}
