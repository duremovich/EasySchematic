import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { ensureLatestBuild } from "./buildVersion";

const App = lazy(() => import("./App.tsx"));

function Root() {
  return (
    <ReactFlowProvider>
      <Suspense fallback={null}>
        <App />
      </Suspense>
    </ReactFlowProvider>
  );
}

async function bootstrap() {
  const shouldRender = await ensureLatestBuild();
  if (!shouldRender) return;

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <Root />
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
