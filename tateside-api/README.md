# TateSide API

Small VPS-hosted API for TateSide-owned EasySchematic data.

## Device Library

Implemented endpoints:

```text
GET  /api/tateside/devices/templates
POST /api/tateside/devices/templates
POST /api/tateside/quote-import/extract
POST /api/tateside/quote-import/research
GET  /health
```

The device database uses SQLite with file-based migrations in `tateside-api/migrations`.

Default data path:

```text
/var/lib/tateside-schematic/tateside.db
```

Local Windows fallback:

```text
.tateside-data/tateside.db
```

## Commands

```bash
npm run tateside:api:build
npm run tateside:api
```

`npm run tateside:api` compiles the TypeScript service and then starts:

```bash
node dist-tateside-api/tateside-api/src/server.js
```

## Environment

```text
TATESIDE_DATA_DIR=/var/lib/tateside-schematic
TATESIDE_DB_PATH=/var/lib/tateside-schematic/tateside.db
TATESIDE_API_HOST=127.0.0.1
TATESIDE_API_PORT=8788
TATESIDE_ALLOWED_ORIGIN=https://schematic.tateside.online
TATESIDE_REQUIRE_ACCESS_IDENTITY=1
OPENAI_API_KEY=<required for AI quote import>
OPENAI_QUOTE_EXTRACTION_MODEL=gpt-5.4-nano
OPENAI_DEVICE_RESEARCH_MODEL=gpt-5.4-mini
OPENAI_DEVICE_ESCALATION_MODEL=gpt-5.4
OPENAI_QUOTE_EXTRACTION_REASONING_EFFORT=low
OPENAI_DEVICE_RESEARCH_REASONING_EFFORT=medium
OPENAI_DEVICE_ESCALATION_REASONING_EFFORT=medium
OPENAI_QUOTE_IMPORT_MAX_FILE_BYTES=15728640
```

If `OPENAI_API_KEY` is missing, the rest of the TateSide app still works normally and only the AI quote-import workflow is unavailable.

`TATESIDE_REQUIRE_ACCESS_IDENTITY=1` requires the Cloudflare Access header:

```text
Cf-Access-Authenticated-User-Email
```

Use this only when the service is behind Cloudflare Access or a trusted reverse proxy that preserves the header.

## VPS Shape

Recommended first deployment:

```text
Cloudflare Tunnel / Nginx
  /api/tateside/* -> http://127.0.0.1:8788/api/tateside/*
  /*              -> existing static EasySchematic app
```

The API should bind to localhost only. Do not expose port `8788` publicly.

## SharePoint

SharePoint endpoints are intentionally stubbed for now. The device database lives in this VPS API; SharePoint will be used for schematic JSON and generated exports.
