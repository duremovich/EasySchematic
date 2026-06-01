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
import { defaultStubPlacement } from "./stubPlacement";
import { getPortAbsolutePositions } from "./snapUtils";
import type { SchematicNode } from "./types";

export const CURRENT_SCHEMA_VERSION = 40;

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
    const NET_SIGNALS = new Set(["ethernet", "ndi", "dante", "avb", "srt", "hdbaset"]);
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
      const portId = edge.sourceHandle?.replace(/-(in|out|rear|front)$/, "");
      const srcPort = srcNode.data.ports.find((p: { id: string }) => p.id === portId);
      if (srcPort && srcPort.signalType !== "power") {
        edge.data.signalType = srcPort.signalType;
      }
    }

    data.version = 18;
    return data;
  },
  18: (data) => {
    // v18 → v19: adapter visibility fields — all optional, no transform needed
    data.version = 19;
    return data;
  },
  19: (data) => {
    // v19 → v20: hostname moved from PortNetworkConfig to DeviceData, notes on Port
    // Migrate any port-level hostname to device-level
    for (const node of data.nodes ?? []) {
      if (node.type !== "device" || !node.data?.ports) continue;
      for (const p of node.data.ports) {
        if (p.networkConfig?.hostname) {
          if (!node.data.hostname) node.data.hostname = p.networkConfig.hostname;
          delete p.networkConfig.hostname;
        }
      }
    }
    data.version = 20;
    return data;
  },
  20: (data) => {
    // v20 → v21: poeDrawW/linkSpeed on Port, poeBudgetW on DeviceData, aes67 signal type — all optional
    data.version = 21;
    return data;
  },
  21: (data) => {
    // v21 → v22: flipped on Port — optional, no transform needed
    data.version = 22;
    return data;
  },
  22: (data) => {
    // v22 → v23: autoRoute on SchematicFile — optional, defaults to true
    data.version = 23;
    return data;
  },
  23: (data) => {
    // v23 → v24: nested subrooms — rooms may now have a parentId pointing to
    // another room. No data transform needed; parentId is already a valid
    // React Flow node field and existing rooms simply have none.
    data.version = 24;
    return data;
  },

  24: (data) => {
    // v24 → v25: Split label visibility into cable ID / custom label controls (#61)
    // Migrate top-level showConnectionLabels → showCableIdLabels
    if (data.showConnectionLabels !== undefined) {
      data.showCableIdLabels = data.showConnectionLabels;
      delete data.showConnectionLabels;
    }
    // Migrate per-edge hideLabel → hideCableId + hideCustomLabel
    if (data.edges) {
      for (const edge of data.edges) {
        if (edge.data?.hideLabel !== undefined) {
          edge.data.hideCableId = edge.data.hideLabel;
          edge.data.hideCustomLabel = edge.data.hideLabel;
          delete edge.data.hideLabel;
        }
      }
    }
    data.version = 25;
    return data;
  },
  25: (data) => {
    // v25 → v26: introduce "avb" signal type. Historical templates (L'Acoustics LA7.16,
    // LA-RAK II AVB) carried AVB ports mislabeled as "dante". Convert any port whose
    // label starts with "AVB" and signalType is "dante" to the new "avb" type.
    for (const node of data.nodes ?? []) {
      if (node.type === "device") {
        for (const p of node.data?.ports ?? []) {
          if (p.signalType === "dante" && typeof p.label === "string" && /^avb\b/i.test(p.label)) {
            p.signalType = "avb";
          }
        }
      }
    }
    data.version = 26;
    return data;
  },
  26: (data) => {
    // v26 → v27: unify the hardcoded deviceType line under the device name into the
    // auxiliaryData pipeline and switch each row to carrying its own header/footer slot.
    //
    // Migration steps per device:
    //   1. If auxiliaryData is already a string[] (pre-v27 shape), convert each entry to
    //      an AuxRow using the device's top-level auxPosition (if any) as the default slot.
    //      Empty auxPosition falls back to "footer" — matches today's rendering.
    //   2. Remove the now-stale top-level auxPosition field.
    //   3. If the device has no aux data and wasn't explicitly suppressed via the legacy
    //      top-level hideDeviceTypes flag, seed a single header row with {{deviceType}}
    //      so new and old schematics look identical after the hardcoded line goes away.
    const legacySuppressed = data.hideDeviceTypes === true;
    for (const node of data.nodes ?? []) {
      if (node.type !== "device" || !node.data) continue;
      const raw = node.data.auxiliaryData;
      const legacySlot: "header" | "footer" =
        node.data.auxPosition === "header" ? "header" : "footer";
      if (Array.isArray(raw) && raw.length > 0) {
        node.data.auxiliaryData = raw.map((line: unknown) =>
          typeof line === "string"
            ? { text: line, position: legacySlot }
            : (line as { text: string; position?: "header" | "footer" }),
        );
      } else if (!legacySuppressed) {
        node.data.auxiliaryData = [{ text: "{{deviceType}}", position: "header" }];
      }
      delete node.data.auxPosition;
    }
    delete data.hideDeviceTypes;
    data.version = 27;
    return data;
  },
  27: (data) => {
    // v27 → v28: add optional roomDistances + distanceSettings for inter-room
    // cable-length estimation (#146). No data transform needed — fields default
    // to undefined and are populated on-demand when the user opens the new
    // Room Distances dialog.
    data.version = 28;
    return data;
  },
  28: (data) => {
    // v28 → v29: add optional currency field for multi-currency cost reports (#158).
    // No data transform needed — field defaults to "USD" on load.
    data.version = 29;
    return data;
  },
  29: (data) => {
    // v29 → v30: add stub label customization (port name + page-mode controls).
    // Behavior change: same-page stubs in print view stop showing "Pg N" by default
    // (new pageMode default is "cross-page"). Old saves get the new default.
    data.stubLabelShowPort ??= false;
    data.stubLabelPageMode ??= "cross-page";
    data.version = 30;
    return data;
  },
  30: (data) => {
    // v30 → v31: stub labels become first-class React Flow nodes. Each stubbed edge is
    // replaced by 2 stub-label nodes + 2 stub-leg edges sharing a linkedConnectionId.
    // Removes the parallel "stub renderer" infrastructure — stub legs are now routed
    // by the same A* the rest of the system uses.
    if (Array.isArray(data.edges) && Array.isArray(data.nodes)) {
      migrateStubsToNodes(data);
    }
    data.version = 31;
    return data;
  },
  31: (data) => {
    // v31 → v32: manual edge waypoints become first-class React Flow nodes (selectable,
    // box-drag-able alongside devices). The edge's manualWaypoints array stays as the
    // canonical position store; waypoint nodes mirror it 1:1 and a sync layer keeps
    // the two in step. This migration spawns the initial waypoint nodes.
    if (Array.isArray(data.edges) && Array.isArray(data.nodes)) {
      spawnWaypointNodes(data);
    }
    data.version = 32;
    return data;
  },
  32: (data) => {
    // v32 → v33: normalize edge handles to match the current bidirectional convention.
    // Bidirectional ports render two handles (`${id}-in` / `${id}-out`); unidirectional
    // ports render one (`${id}`). Template syncs that flip a port's direction preserve
    // the port id (so edges don't dangle) but leave the edge's handle id stale, so
    // React Flow logs "Couldn't create edge for target handle id" warnings. This walks
    // every edge and rewrites its sourceHandle / targetHandle to the right form.
    if (Array.isArray(data.edges) && Array.isArray(data.nodes)) {
      normalizeEdgeHandles(data);
    }
    data.version = 33;
    return data;
  },
  34: (data) => {
    // v34 → v35: no-op — introduces passthrough port direction + normalling fields.
    // Existing patch panel ports keep their input/output directions; passthrough is opt-in
    // for new templates only. No data transform needed.
    data.version = 35;
    return data;
  },
  35: (data) => {
    // v35 → v36: rescue waypoint nodes that an older reparentAllDevices swept
    // under a room. Those waypoints have parentId set and position relative to
    // the room, which syncEdgesFromWaypointNodes wrote back into manualWaypoints
    // as if they were absolute — producing spaghetti routes.
    if (Array.isArray(data.nodes) && Array.isArray(data.edges)) {
      healOrphanedWaypoints(data);
    }
    data.version = 36;
    return data;
  },
  36: (data) => {
    // v36 → v37: shift stub-label position.y +1 to match the (briefly-shipped)
    // "port Y = device.y + 1 + headerBand + 1 + 9 + …" rendering where ports
    // lived at gridY+1. v38 reverts the rendering (DeviceNode `pt-9` → `pt-8`)
    // so ports are back on gridY; the v37 → v38 migration below cancels this
    // shift. Kept here so v36 saves load through both steps with zero net shift.
    if (Array.isArray(data.nodes)) {
      for (const n of data.nodes) {
        if (n?.type === "stub-label" && n.position && typeof n.position.y === "number") {
          n.position.y = n.position.y + 1;
        }
      }
    }
    data.version = 37;
    return data;
  },
  37: (data) => {
    // v37 → v38: undo the v36 → v37 shift now that pt-8 in DeviceNode puts ports
    // exactly on gridY again. Two-step round-trip for v36 saves nets out to zero;
    // v37 saves (auto-saved by anyone running the v37 build with shifted stubs)
    // get the correction here so reload heals them.
    if (Array.isArray(data.nodes)) {
      for (const n of data.nodes) {
        if (n?.type === "stub-label" && n.position && typeof n.position.y === "number") {
          n.position.y = n.position.y - 1;
        }
      }
    }
    data.version = 38;
    return data;
  },
  38: (data) => {
    // v38 → v39: custom-label rework. `label` is now midpoint-only. Per-end labels
    // live in `sourceLabel` / `targetLabel`. The customLabelMode / customLabelGap /
    // customLabelMidOffset / hideCustomLabel knobs all go away — visibility is
    // determined by whether each slot's text is non-empty.
    const fileMode = data.customLabelMode === "midpoint" ? "midpoint" : "endpoint";
    if (Array.isArray(data.edges)) {
      for (const e of data.edges) {
        const d = e?.data;
        if (!d) continue;
        const effMode = d.customLabelMode === "midpoint"
          ? "midpoint"
          : d.customLabelMode === "endpoint"
            ? "endpoint"
            : fileMode;
        const labelText = typeof d.label === "string" ? d.label : "";
        const wasHidden = d.hideCustomLabel === true;
        if (wasHidden) {
          // Preserve hidden state: drop the text. Users can re-enter to make visible.
          delete d.label;
          delete d.sourceLabel;
          delete d.targetLabel;
        } else if (labelText) {
          if (effMode === "endpoint") {
            if (!d.sourceLabel) d.sourceLabel = labelText;
            if (!d.targetLabel) d.targetLabel = labelText;
            delete d.label;
          }
          // midpoint mode: leave d.label as-is.
        }
        delete d.customLabelMode;
        delete d.customLabelGap;
        delete d.customLabelMidOffset;
        delete d.hideCustomLabel;
      }
    }
    delete data.customLabelMode;
    delete data.customLabelGap;
    delete data.customLabelMidOffset;
    data.version = 39;
    return data;
  },

  39: (data) => {
    // v39 → v40: reserve manual cable-ID placement fields. Clamp imported manual
    // positions to the normalized 0-1 range so malformed files don't place labels
    // off-route.
    if (Array.isArray(data.edges)) {
      for (const e of data.edges) {
        const d = e?.data;
        if (!d || typeof d.cableIdManualPosition !== "number") continue;
        d.cableIdManualPosition = Math.max(0, Math.min(1, d.cableIdManualPosition));
      }
    }
    data.version = 40;
    return data;
  },

  33: (data) => {
    // v33 → v34: stamp placed=true on every existing stub-label node. The auto-place
    // effect in StubLabelNode used to fire on every mount and snap Y back to the
    // device port, clobbering any position the user had dragged the stub to. The
    // effect now bails when data.placed is true; legacy stubs are flipped wholesale
    // here so user-dragged positions survive the upgrade. New stubs created post-
    // upgrade get auto-placed once and then flipped true by the effect itself.
    if (Array.isArray(data.nodes)) {
      for (const n of data.nodes) {
        if (n?.type === "stub-label") {
          n.data ??= {};
          n.data.placed = true;
        }
      }
    }
    data.version = 34;
    return data;
  },
};

// ---------- v35 → v36 helpers ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
function healOrphanedWaypoints(data: any): void {
  const nodeMap = new Map<string, any>(data.nodes.map((n: any) => [n.id, n]));
  const absPos = (n: any): { x: number; y: number } => {
    let x = n.position?.x ?? 0;
    let y = n.position?.y ?? 0;
    let p = n.parentId;
    while (p) {
      const parent = nodeMap.get(p);
      if (!parent) break;
      x += parent.position?.x ?? 0;
      y += parent.position?.y ?? 0;
      p = parent.parentId;
    }
    return { x, y };
  };

  // Step 1: any waypoint with a parentId — recover its absolute position
  // and unparent it. Other top-level types could in principle be similarly
  // miscreparented, but stub-labels/notes/annotations *intentionally* live
  // inside rooms, so we only normalize waypoints here.
  for (const n of data.nodes) {
    if (n?.type !== "waypoint") continue;
    if (!n.parentId) continue;
    const { x, y } = absPos(n);
    n.position = { x, y };
    delete n.parentId;
  }

  // Step 2: rebuild edge.data.manualWaypoints from the now-absolute waypoint
  // node positions, sorted by data.index. This overwrites any corrupted
  // manualWaypoints the bad-sync pass had written.
  const byEdge = new Map<string, { x: number; y: number; index: number }[]>();
  for (const n of data.nodes) {
    if (n?.type !== "waypoint") continue;
    const edgeId = n.data?.edgeId;
    const index = n.data?.index;
    if (typeof edgeId !== "string" || typeof index !== "number") continue;
    const list = byEdge.get(edgeId) ?? [];
    list.push({ x: n.position.x, y: n.position.y, index });
    byEdge.set(edgeId, list);
  }
  for (const edge of data.edges) {
    const list = byEdge.get(edge.id);
    if (!list || list.length === 0) continue;
    list.sort((a, b) => a.index - b.index);
    edge.data ??= {};
    edge.data.manualWaypoints = list.map((p) => ({ x: p.x, y: p.y }));
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- v32 → v33 helpers ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizeEdgeHandles(data: any): void {
  const nodeMap = new Map<string, any>(data.nodes.map((n: any) => [n.id, n]));

  const fix = (
    nodeId: string | undefined,
    handle: string | undefined,
    end: "source" | "target",
  ): string | undefined => {
    if (!nodeId || !handle) return handle;
    const node = nodeMap.get(nodeId);
    if (!node || node.type !== "device") return handle;
    const ports: any[] = node.data?.ports ?? [];
    const baseId = handle.replace(/-(in|out|rear|front)$/, "");
    const port = ports.find((p) => p.id === baseId);
    if (!port) return handle;
    if (port.direction === "bidirectional") {
      return end === "source" ? `${baseId}-out` : `${baseId}-in`;
    }
    return baseId;
  };

  for (const edge of data.edges) {
    const newSource = fix(edge.source, edge.sourceHandle, "source");
    const newTarget = fix(edge.target, edge.targetHandle, "target");
    if (newSource !== edge.sourceHandle) edge.sourceHandle = newSource;
    if (newTarget !== edge.targetHandle) edge.targetHandle = newTarget;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- v31 → v32 helpers ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
function spawnWaypointNodes(data: any): void {
  const newNodes: any[] = [];
  for (const edge of data.edges) {
    const wps = edge.data?.manualWaypoints;
    if (!Array.isArray(wps) || wps.length === 0) continue;
    for (let i = 0; i < wps.length; i++) {
      const p = wps[i];
      newNodes.push({
        id: `wp-${edge.id}-${i}`,
        type: "waypoint",
        position: { x: p.x, y: p.y },
        data: { edgeId: edge.id, index: i },
        zIndex: 100,
      });
    }
  }
  if (newNodes.length > 0) data.nodes = [...data.nodes, ...newNodes];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- v30 → v31 helpers ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
function migrateStubsToNodes(data: any): void {
  const nodes: any[] = data.nodes;
  const edges: any[] = data.edges;
  const nodeMap = new Map<string, any>(nodes.map((n) => [n.id, n]));

  const newNodes: any[] = [];
  const newEdges: any[] = [];

  // Approximate absolute position by walking parent chain.
  const absPos = (n: any): { x: number; y: number } => {
    let x = n.position?.x ?? 0;
    let y = n.position?.y ?? 0;
    let parentId = n.parentId;
    while (parentId) {
      const parent = nodeMap.get(parentId);
      if (!parent) break;
      x += parent.position?.x ?? 0;
      y += parent.position?.y ?? 0;
      parentId = parent.parentId;
    }
    return { x, y };
  };

  // nodeMap typed as SchematicNode — the v30 device shape is structurally
  // compatible with what getPortAbsolutePositions reads (data.ports / data.slots
  // / data.deviceType / data.auxiliaryData all predate v31).
  const schematicNodeMap = nodeMap as unknown as Map<string, SchematicNode>;

  // Resolve a handle's absolute position by mirroring DeviceNode's render layout.
  // Falls back to a device-center approximation if the handle id is unknown.
  const handlePosFor = (
    deviceNode: any,
    handleId: string | undefined,
  ): { x: number; y: number; side: "left" | "right" } => {
    const positions = getPortAbsolutePositions(
      deviceNode as SchematicNode,
      schematicNodeMap,
    );
    const match = positions.find((p) => p.handleId === handleId);
    if (match) return { x: match.absX, y: match.absY, side: match.side };
    // Fallback for malformed handle ids.
    const dPos = absPos(deviceNode);
    const w = deviceNode.measured?.width ?? deviceNode.width ?? 180;
    const h = deviceNode.measured?.height ?? deviceNode.height ?? 60;
    const ports = deviceNode.data?.ports ?? [];
    const baseId = (handleId ?? "").replace(/-(in|out|rear|front)$/, "");
    const port = ports.find((p: any) => p.id === baseId);
    let side: "left" | "right" = "right";
    if (port) {
      if (port.direction === "input") side = port.flipped ? "right" : "left";
      else if (port.direction === "output") side = port.flipped ? "left" : "right";
      else side = port.flipped ? "right" : "left";
    }
    return { x: side === "right" ? dPos.x + w : dPos.x, y: dPos.y + h / 2, side };
  };

  // Stubs always connect via left or right — top/bottom would produce visually awkward
  // perpendicular runs into the label box. Pick whichever side faces the device.
  const pickStubSide = (stubAbs: { x: number; y: number }, deviceHandleAbs: { x: number; y: number }): "l" | "r" => {
    return deviceHandleAbs.x >= stubAbs.x ? "r" : "l";
  };

  let nextStubSeq = 0;
  const newStubId = (edgeId: string, side: "src" | "tgt") => `stub-${edgeId}-${side}-${nextStubSeq++}`;

  for (const edge of edges) {
    if (!edge.data?.stubbed) {
      newEdges.push(edge);
      continue;
    }

    const srcDevice = nodeMap.get(edge.source);
    const tgtDevice = nodeMap.get(edge.target);
    if (!srcDevice || !tgtDevice) {
      // Dangling edge — skip stubification, drop the stubbed flag
      const cleaned = { ...edge, data: { ...edge.data } };
      delete cleaned.data.stubbed;
      delete cleaned.data.stubSourceEnd;
      delete cleaned.data.stubTargetEnd;
      delete cleaned.data.stubSourceWaypoints;
      delete cleaned.data.stubTargetWaypoints;
      delete cleaned.data.stubLabelShowPort;
      delete cleaned.data.stubLabelPageMode;
      newEdges.push(cleaned);
      continue;
    }

    const linkedConnectionId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `link-${edge.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const srcHandle = handlePosFor(srcDevice, edge.sourceHandle);
    const tgtHandle = handlePosFor(tgtDevice, edge.targetHandle);
    const srcHandlePos = { x: srcHandle.x, y: srcHandle.y };
    const tgtHandlePos = { x: tgtHandle.x, y: tgtHandle.y };

    let srcStubAbs: { x: number; y: number };
    let srcSide: "t" | "r" | "b" | "l";
    if (edge.data.stubSourceEnd) {
      // Legacy file: keep the user's saved position and pick handle from geometry.
      srcStubAbs = { x: edge.data.stubSourceEnd.x, y: edge.data.stubSourceEnd.y };
      srcSide = pickStubSide(srcStubAbs, srcHandlePos);
    } else {
      const place = defaultStubPlacement(srcHandlePos, srcHandle.side);
      srcStubAbs = place.pos;
      srcSide = place.handle;
    }

    let tgtStubAbs: { x: number; y: number };
    let tgtSide: "t" | "r" | "b" | "l";
    if (edge.data.stubTargetEnd) {
      tgtStubAbs = { x: edge.data.stubTargetEnd.x, y: edge.data.stubTargetEnd.y };
      tgtSide = pickStubSide(tgtStubAbs, tgtHandlePos);
    } else {
      const place = defaultStubPlacement(tgtHandlePos, tgtHandle.side);
      tgtStubAbs = place.pos;
      tgtSide = place.handle;
    }

    const srcParentId = srcDevice.parentId;
    const tgtParentId = tgtDevice.parentId;
    const srcParentAbs = srcParentId
      ? absPos(nodeMap.get(srcParentId))
      : { x: 0, y: 0 };
    const tgtParentAbs = tgtParentId
      ? absPos(nodeMap.get(tgtParentId))
      : { x: 0, y: 0 };

    const srcStubId = newStubId(edge.id, "src");
    const tgtStubId = newStubId(edge.id, "tgt");

    const baseStubData = {
      signalType: edge.data.signalType,
      linkedConnectionId,
      showPort: edge.data.stubLabelShowPort,
      pageMode: edge.data.stubLabelPageMode,
    };
    // Stamp placed:true only when honoring a user-saved end position. For
    // default-placed stubs, leave placed undefined so StubLabelNode's tryPlace
    // can correct X-overlap after the real label width is measured.
    const srcPlaced = !!edge.data.stubSourceEnd;
    const tgtPlaced = !!edge.data.stubTargetEnd;

    newNodes.push({
      id: srcStubId,
      type: "stub-label",
      position: { x: srcStubAbs.x - srcParentAbs.x, y: srcStubAbs.y - srcParentAbs.y },
      ...(srcParentId ? { parentId: srcParentId } : {}),
      data: { ...baseStubData, side: "source", ...(srcPlaced ? { placed: true } : {}) },
    });
    newNodes.push({
      id: tgtStubId,
      type: "stub-label",
      position: { x: tgtStubAbs.x - tgtParentAbs.x, y: tgtStubAbs.y - tgtParentAbs.y },
      ...(tgtParentId ? { parentId: tgtParentId } : {}),
      data: { ...baseStubData, side: "target", ...(tgtPlaced ? { placed: true } : {}) },
    });

    // Carry-over edge data, dropping the stub-specific fields and keeping cable ID
    // on the source-leg edge only (so cableSchedule sees one canonical record).
    const baseData: any = { ...edge.data };
    delete baseData.stubbed;
    delete baseData.stubSourceEnd;
    delete baseData.stubTargetEnd;
    delete baseData.stubSourceWaypoints;
    delete baseData.stubTargetWaypoints;
    delete baseData.stubLabelShowPort;
    delete baseData.stubLabelPageMode;
    // manualWaypoints on a stubbed edge applied to the unused full path — discard.
    delete baseData.manualWaypoints;
    delete baseData.autoRouteWaypoints;

    const srcLegData: any = { ...baseData, linkedConnectionId };
    if (Array.isArray(edge.data.stubSourceWaypoints) && edge.data.stubSourceWaypoints.length > 0) {
      srcLegData.manualWaypoints = edge.data.stubSourceWaypoints.map((p: any) => ({ x: p.x, y: p.y }));
    }
    const tgtLegData: any = { ...baseData, linkedConnectionId };
    delete tgtLegData.cableId;
    delete tgtLegData.label;
    delete tgtLegData.cableLength;
    delete tgtLegData.multicableLabel;
    if (Array.isArray(edge.data.stubTargetWaypoints) && edge.data.stubTargetWaypoints.length > 0) {
      tgtLegData.manualWaypoints = edge.data.stubTargetWaypoints.map((p: any) => ({ x: p.x, y: p.y }));
    }

    newEdges.push({
      id: `${edge.id}-src`,
      source: edge.source,
      target: srcStubId,
      sourceHandle: edge.sourceHandle,
      targetHandle: srcSide,
      data: srcLegData,
      style: edge.style,
    });
    newEdges.push({
      id: `${edge.id}-tgt`,
      source: tgtStubId,
      target: edge.target,
      sourceHandle: tgtSide,
      targetHandle: edge.targetHandle,
      data: tgtLegData,
      style: edge.style,
    });
  }

  data.nodes = [...nodes, ...newNodes];
  data.edges = newEdges;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
