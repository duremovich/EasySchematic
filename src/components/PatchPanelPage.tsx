import { useSchematicStore } from "../store";
import PatchPanelSidebar from "./PatchPanelSidebar";
import PatchPanelRenderer from "./PatchPanelRenderer";

export default function PatchPanelPage() {
  const activePage = useSchematicStore((s) => s.activePage);
  const pages = useSchematicStore((s) => s.pages);

  const page = pages.find((p) => p.id === activePage);
  if (!page || page.type !== "patch-panel") return null;

  return (
    <div className="flex flex-1 overflow-hidden">
      <PatchPanelSidebar />
      <PatchPanelRenderer />
    </div>
  );
}
