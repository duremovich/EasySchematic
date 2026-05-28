import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { initServiceWorkerUpdates } from "./sw-register";

initServiceWorkerUpdates();

const App = lazy(() => import("./App.tsx"));
const LandingPage = lazy(() => import("./components/LandingPage.tsx"));

/** Show landing page at "/" for first-time visitors (no skip pref and no special path). */
function shouldShowLanding(): boolean {
  const path = window.location.pathname;
  // Shared schematic links, or any non-root path — go straight to editor
  if (path !== "/") return false;
  // Returning user who opted to skip the landing page
  if (localStorage.getItem("easyschematic-skip-landing")) return false;
  return true;
}

function Root() {
  if (shouldShowLanding()) {
    return (
      <Suspense fallback={null}>
        <LandingPage />
      </Suspense>
    );
  }
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
