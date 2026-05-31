import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary.tsx";

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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>,
);
