/**
 * Schema migrations for EasySchematic save files.
 *
 * Each migration takes a raw JSON object at version N and returns version N+1.
 * Migrations run sequentially from the file's version up to CURRENT_SCHEMA_VERSION.
 *
 * When bumping the schema version (middle number in 0.x.y):
 *   1. Increment CURRENT_SCHEMA_VERSION
 *   2. Add a migration function: migrations[oldVersion] = (data) => { ... return data; }
 *   3. Update package.json version to 0.<new schema version>.0
 */

import { createDefaultLayout } from "./titleBlockLayout";
import { DEFAULT_CONNECTOR } from "./connectorTypes";

export const CURRENT_SCHEMA_VERSION = 18;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Migration = (data: any) => any;

const migrations: Record<number, Migration> = {
  1: (data) => {
    // v1 → v2: add optional signalColors field (no data transform needed)
    data.version = 2;
    return data;
  },
  2: (data) => {
    // v2 → v3: add date and drawingTitle to titleBlock
    if (data.titleBlock) {
      data.titleBlock.date ??= "";
      data.titleBlock.drawingTitle ??= "";
    }
    data.version = 3;
    return data;
  },
  3: (data) => {
    // v3 → v4: add company, revision, logo to titleBlock
    if (data.titleBlock) {
      data.titleBlock.company ??= "";
      data.titleBlock.revision ??= "";
      data.titleBlock.logo ??= "";
    }
    data.version = 4;
    return data;
  },
  4: (data) => {
    // v4 → v5: add titleBlockLayout with default grid layout
    data.titleBlockLayout ??= createDefaultLayout();
    data.version = 5;
    return data;
  },
  5: (data) => {
    // v5 → v6: titleBlockLayout.widthFraction → widthIn (fixed inches)
    if (data.titleBlockLayout) {
      const frac = data.titleBlockLayout.widthFraction ?? 0.3;
      // Convert fraction to approximate inches (assuming 11" landscape - 0.8" margins)
      data.titleBlockLayout.widthIn = Math.round(frac * 10.2 * 4) / 4; // round to nearest 0.25"
      delete data.titleBlockLayout.widthFraction;
    }
    data.version = 6;
    return data;
  },
  6: (data) => {
    // v6 → v7: add customFields array to titleBlock
    if (data.titleBlock) {
      data.titleBlock.customFields ??= [];
    }
    data.version = 7;
    return data;
  },
  7: (data) => {
    // v7 → v8: add optional hiddenSignalTypes and hideDeviceTypes (both default to empty/false)
    data.version = 8;
    return data;
  },
  8: (data) => {
    // v8 → v9: add permanent `model` field to device nodes (template identity for pack lists)
    // Backfill from baseLabel if present (device still auto-numbered), otherwise from label
    if (data.nodes) {
      for (const node of data.nodes) {
        if (node.type === "device" && node.data) {
          node.data.model ??= node.data.baseLabel ?? node.data.label;
        }
      }
    }
    data.version = 9;
    return data;
  },
  9: (data) => {
    // v9 → v10: add reportLayouts for persisting report print preview settings
    data.reportLayouts ??= {};
    data.version = 10;
    return data;
  },
  10: (data) => {
    // v10 → v11: add connectorType to all ports using DEFAULT_CONNECTOR[signalType]
    if (data.nodes) {
      for (const node of data.nodes) {
        if (node.type === "device" && node.data?.ports) {
          for (const port of node.data.ports) {
            if (!port.connectorType && port.signalType) {
              port.connectorType = DEFAULT_CONNECTOR[port.signalType as keyof typeof DEFAULT_CONNECTOR] ?? "other";
            }
          }
        }
      }
    }
    // Also migrate custom templates stored in the file
    if (data.customTemplates) {
      for (const tmpl of data.customTemplates) {
        if (tmpl.ports) {
          for (const port of tmpl.ports) {
            if (!port.connectorType && port.signalType) {
              port.connectorType = DEFAULT_CONNECTOR[port.signalType as keyof typeof DEFAULT_CONNECTOR] ?? "other";
            }
          }
        }
      }
    }
    data.version = 11;
    return data;
  },
  11: (data) => {
    // v11 → v12: add optional templatePresets (no data transform needed)
    data.version = 12;
    return data;
  },
  13: (data) => {
    // v13 → v14: dhcpServer added as optional field on DeviceData — no transform needed
    data.version = 14;
    return data;
  },
  14: (data) => {
    // v14 → v15: multicable/cable accessory fields — all optional, no transform needed
    data.version = 15;
    return data;
  },
  15: (data) => {
    // v15 → v16: cableLength on connections — optional, no transform needed
    data.version = 16;
    return data;
  },
  16: (data) => {
    // v16 → v17: modular device slots (expansion cards) — optional field, no transform needed
    data.version = 17;
    return data;
  },
  12: (data) => {
    // v12 → v13: add addressable flag to ports
    // Network switch ports are pass-through (non-addressable)
    const NET_SIGNALS = new Set(["ethernet", "ndi", "dante", "srt", "hdbaset"]);
    for (const node of data.nodes ?? []) {
      if (node.type === "device" && node.data?.deviceType === "network-switch") {
        for (const p of node.data.ports ?? []) {
          if (NET_SIGNALS.has(p.signalType)) {
            p.addressable = false;
          }
        }
      }
    }
    data.version = 13;
    return data;
  },
  17: (data) => {
    // v17 → v18: Convert cam-lok ports from generic "power" to phase-specific signal types
    // and rename "Cam-Lok 400A Breakout" → "Lex Hammerhead 400A Splitter"
    const LABEL_MAP: Record<string, string> = {
      // Company Switch 200A
      "Cam-Lok Out A": "power-l1",
      "Cam-Lok Out B": "power-l2",
      "Cam-Lok Out C": "power-l3",
      "Cam-Lok Out N": "power-neutral",
      // Company Switch 400A
      "Cam-Lok Out A1": "power-l1",
      "Cam-Lok Out B1": "power-l2",
      "Cam-Lok Out C1": "power-l3",
      "Cam-Lok Out A2": "power-l1",
      "Cam-Lok Out B2": "power-l2",
      "Cam-Lok Out C2": "power-l3",
      // Company Switch 100A Single Phase
      "Cam-Lok Out 1": "power-l1",
      "Cam-Lok Out 2": "power-neutral",
      // 400A Breakout inputs
      "Cam-Lok In A": "power-l1",
      "Cam-Lok In B": "power-l2",
      "Cam-Lok In C": "power-l3",
    };

    for (const node of data.nodes ?? []) {
      if (node.type !== "device" || !node.data?.ports) continue;

      // Rename 400A Breakout
      if (node.data.label === "Cam-Lok 400A Breakout") {
        node.data.label = "Lex Hammerhead 400A Splitter";
        node.data.manufacturer = "Lex Products";
        node.data.modelNumber = "DB400N1J4AJ2CC-63";
      }

      // Migrate cam-lok port signal types
      for (const p of node.data.ports) {
        if (p.connectorType === "cam-lok" && p.signalType === "power") {
          const mapped = LABEL_MAP[p.label];
          if (mapped) p.signalType = mapped;
        }
      }
    }

    // Update edges whose source port was migrated
    for (const edge of data.edges ?? []) {
      if (edge.data?.signalType !== "power") continue;
      const srcNode = (data.nodes ?? []).find((n: { id: string }) => n.id === edge.source);
      if (!srcNode?.data?.ports) continue;
      const portId = edge.sourceHandle?.replace(/-(in|out)$/, "");
      const srcPort = srcNode.data.ports.find((p: { id: string }) => p.id === portId);
      if (srcPort && srcPort.signalType !== "power") {
        edge.data.signalType = srcPort.signalType;
      }
    }

    data.version = 18;
    return data;
  },
};

/**
 * Migrate a schematic file from its current version to CURRENT_SCHEMA_VERSION.
 * Returns the migrated data (mutated in place).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateSchematic(data: any): any {
  let version = data.version ?? 1;

  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      console.warn(
        `No migration for schema version ${version} → ${version + 1}. Skipping.`,
      );
      version++;
      continue;
    }
    data = migrate(data);
    version = data.version;
  }

  return data;
}
