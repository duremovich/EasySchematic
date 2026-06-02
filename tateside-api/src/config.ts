import { mkdirSync } from "node:fs";
import path from "node:path";

export interface ApiConfig {
  dbPath: string;
  host: string;
  port: number;
  allowedOrigin: string;
  requireAccessIdentity: boolean;
  quoteImportMaxFileBytes: number;
  jetbuiltApiBaseUrl: string;
}

const defaultDataDir =
  process.platform === "win32"
    ? path.resolve(".tateside-data")
    : "/var/lib/tateside-schematic";

export function getConfig(): ApiConfig {
  const dataDir = process.env.TATESIDE_DATA_DIR || defaultDataDir;
  mkdirSync(dataDir, { recursive: true });

  return {
    dbPath: process.env.TATESIDE_DB_PATH || path.join(dataDir, "tateside.db"),
    host: process.env.TATESIDE_API_HOST || "127.0.0.1",
    port: Number(process.env.TATESIDE_API_PORT || "8788"),
    allowedOrigin: process.env.TATESIDE_ALLOWED_ORIGIN || "https://schematic.tateside.online",
    requireAccessIdentity: process.env.TATESIDE_REQUIRE_ACCESS_IDENTITY === "1",
    quoteImportMaxFileBytes: Number(process.env.OPENAI_QUOTE_IMPORT_MAX_FILE_BYTES || `${15 * 1024 * 1024}`),
    jetbuiltApiBaseUrl: process.env.JETBUILT_API_BASE_URL || "https://app.jetbuilt.com/api",
  };
}
