import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import os from "os";

const cacheDir = path.join(os.tmpdir(), "vite-easyschematic-devices");

export default defineConfig({
  cacheDir,
  plugins: [react()],
});
