import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use temp dir for cache to avoid file-locking issues
const cacheDir = path.join(os.tmpdir(), "vite-easyschematic-docs");

// In dev, Vite's SPA fallback eats /dev/ (no file-extension match → serves the
// docs SPA index instead of the TypeDoc index). Production Cloudflare auto-
// resolves directory indexes via html_handling, but local dev doesn't.
// This middleware rewrites /dev/ → /dev/index.html so both modes match.
function serveDevReferenceIndex() {
  return {
    name: "serve-dev-reference-index",
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, _res: unknown, next: () => void) => void) => void } }) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/dev" || req.url === "/dev/") {
          req.url = "/dev/index.html";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  cacheDir,
  plugins: [react(), serveDevReferenceIndex()],
  // Resolve TypeScript sources before .js so stale emitted .js shadows can't silently win.
  resolve: {
    extensions: [".mjs", ".mts", ".ts", ".tsx", ".js", ".jsx", ".json"],
  },
  define: {
    __APP_VERSION__: JSON.stringify("docs"),
    __BUILD_HASH__: JSON.stringify("docs"),
  },
});
