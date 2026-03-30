import { useSchematicStore } from "../store";
import RackRenderer from "./RackRenderer";
import RackSidebar from "./RackSidebar";

export default function RackPage() {
  const activePage = useSchematicStore((s) => s.activePage);
  const pages = useSchematicStore((s) => s.pages);

  const page = pages.find((p) => p.id === activePage);
  if (!page) return null;

  return (
    <div className="flex flex-1 overflow-hidden">
      <RackSidebar page={page} />
      <RackRenderer page={page} />
    </div>
  );
}
