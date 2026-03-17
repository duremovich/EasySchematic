import { useState, useEffect } from "react";
import Layout from "./components/Layout";
import OverviewPage from "./pages/Overview";
import GettingStartedPage from "./pages/GettingStarted";
import DevicesAndPortsPage from "./pages/DevicesAndPorts";
import ConnectionsPage from "./pages/Connections";
import EdgeRoutingPage from "./pages/EdgeRouting";
import RoomsAndGroupingPage from "./pages/RoomsAndGrouping";
import DeviceLibraryPage from "./pages/DeviceLibrary";
import ImportExportPage from "./pages/ImportExport";
import NotesPage from "./pages/Notes";
import PrintingPage from "./pages/Printing";
import PackListPage from "./pages/PackList";
import ApiPage from "./pages/Api";

const routes: Record<string, { title: string; component: React.FC }> = {
  "": { title: "Overview", component: OverviewPage },
  overview: { title: "Overview", component: OverviewPage },
  "getting-started": { title: "Getting Started", component: GettingStartedPage },
  "devices-and-ports": { title: "Devices & Ports", component: DevicesAndPortsPage },
  connections: { title: "Connections", component: ConnectionsPage },
  "connection-routing": { title: "Connection Routing", component: EdgeRoutingPage },
  "rooms-and-grouping": { title: "Rooms & Grouping", component: RoomsAndGroupingPage },
  notes: { title: "Notes", component: NotesPage },
  "device-library": { title: "Device Library", component: DeviceLibraryPage },
  "pack-list": { title: "Pack List & Reports", component: PackListPage },
  printing: { title: "Printing & Title Block", component: PrintingPage },
  "import-export": { title: "Import / Export", component: ImportExportPage },
  api: { title: "Public API", component: ApiPage },
};

function getHash() {
  return window.location.hash.replace(/^#\/?/, "");
}

export default function DocsApp() {
  const [hash, setHash] = useState(getHash);

  useEffect(() => {
    const onHashChange = () => setHash(getHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const route = routes[hash] ?? routes[""];
  const Page = route.component;

  useEffect(() => {
    document.title = `${route.title} — EasySchematic Docs`;
  }, [route.title]);

  return (
    <Layout>
      <Page />
    </Layout>
  );
}
