import { useMemo } from "react";
import type { Port } from "../../../src/types";
import { portSide } from "../../../src/types";
import { signalCssColor, signalLabel } from "../../../src/typeRegistry";
import { useCommunityTypes } from "../hooks/useCommunityTypes";

/**
 * Standalone, presentational replica of the main app's DeviceNode (src/components/DeviceNode.tsx).
 * No React Flow — plain divs — so it can live in the community devices site and update live as the
 * submission form changes. It mirrors DeviceNode's layout decisions: 144px-wide white "paper" card,
 * a header band, ports split left/right by direction (+ flip), bidirectional and passthrough rows,
 * and section dividers grouping ports under labels.
 *
 * Chrome colors are hardcoded to theme.css `:root` (light) values so the white card stays legible
 * even when the devices site is in dark mode. Signal colors use the `var(--color-<signal>)` custom
 * properties (from ../../src/theme.css, imported by index.css) — the exact same source the real node
 * and SignalBadge read, so port colors always match what the user will see on the canvas.
 */

const NODE_WIDTH = 144;
const BORDER = "#a3a3a3"; // --color-border (light)
const BORDER_FAINT = "rgba(163, 163, 163, 0.3)"; // --color-border at /30, used for section rules
const HEADING = "#111827"; // --color-text-heading (light)
const MUTED = "#6b7280"; // --color-text-muted (light)
const SURFACE = "#f8f8f8"; // --color-surface (light)

const signalColorVar = (t: string) => signalCssColor(t || "custom");

/** Pretty-print a kebab-case device type, matching auxiliaryData.ts prettyDeviceType. */
const prettyDeviceType = (v: string): string =>
  v ? v.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";

type ColumnItem =
  | { type: "port"; port: Port }
  | { type: "section"; name: string }
  | { type: "divider" };

/** Interleave ports with section headers / closing dividers — mirrors DeviceNode.buildColumnItems. */
function buildColumnItems(ports: Port[]): ColumnItem[] {
  const items: ColumnItem[] = [];
  let lastSection: string | undefined;
  for (const port of ports) {
    if (port.section && port.section !== lastSection) {
      items.push({ type: "section", name: port.section });
    } else if (!port.section && lastSection) {
      items.push({ type: "divider" });
    }
    items.push({ type: "port", port });
    lastSection = port.section;
  }
  return items;
}

/** A signal-colored port dot pinned to the left or right edge of its (relative) row. */
function PortDot({ color, side }: { color: string; side: "left" | "right" }) {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        [side]: -5,
        top: "50%",
        transform: "translateY(-50%)",
        width: 10,
        height: 10,
        borderRadius: 9999,
        background: color,
        border: `2px solid ${BORDER}`,
        boxSizing: "border-box",
      }}
    />
  );
}

const portLabelStyle = (color: string) =>
  ({ color, fontSize: 10, lineHeight: "16px" }) as const;

function SectionHeader({ name, align }: { name: string; align: "left" | "right" | "center" }) {
  return (
    <div
      className={`h-4 flex items-end ${align === "left" ? "pl-2" : align === "right" ? "pr-2 justify-end" : "px-1 justify-center"}`}
    >
      <span
        className="truncate w-full"
        style={{
          fontSize: 9,
          color: MUTED,
          borderBottom: `1px solid ${BORDER_FAINT}`,
          paddingBottom: 2,
          textAlign: align,
        }}
      >
        {name}
      </span>
    </div>
  );
}

function Divider() {
  return (
    <div className="h-1.5 flex items-center px-2" aria-hidden>
      <div style={{ width: "100%", borderBottom: `1px solid ${BORDER_FAINT}` }} />
    </div>
  );
}

interface DevicePreviewProps {
  label: string;
  deviceType: string;
  ports: Port[];
}

export default function DevicePreview({ label, deviceType, ports }: DevicePreviewProps) {
  useCommunityTypes(); // community signal colours resolve once /types lands
  const { leftPorts, rightPorts, bidirectional, passthroughPorts } = useMemo(() => {
    const leftPorts: Port[] = [];
    const rightPorts: Port[] = [];
    const bidirectional: Port[] = [];
    const passthroughPorts: Port[] = [];
    for (const p of ports) {
      if (p.direction === "passthrough") passthroughPorts.push(p);
      else if (p.direction === "bidirectional") bidirectional.push(p);
      else if (portSide(p) === "left") leftPorts.push(p);
      else rightPorts.push(p);
    }
    return { leftPorts, rightPorts, bidirectional, passthroughPorts };
  }, [ports]);

  const isPatchPanel = deviceType === "patch-panel";
  const leftItems = useMemo(() => {
    const items = buildColumnItems(leftPorts);
    return isPatchPanel && leftPorts.length > 0
      ? [{ type: "section" as const, name: "Rear" }, ...items]
      : items;
  }, [leftPorts, isPatchPanel]);
  const rightItems = useMemo(() => {
    const items = buildColumnItems(rightPorts);
    return isPatchPanel && rightPorts.length > 0
      ? [{ type: "section" as const, name: "Front" }, ...items]
      : items;
  }, [rightPorts, isPatchPanel]);
  const bidirItems = useMemo(() => buildColumnItems(bidirectional), [bidirectional]);
  const passthroughItems = useMemo(() => buildColumnItems(passthroughPorts), [passthroughPorts]);

  const hasSections =
    leftItems.some((i) => i.type === "section") || rightItems.some((i) => i.type === "section");
  const prettyType = prettyDeviceType(deviceType);
  const hasAnyPorts = ports.length > 0;

  const renderColumnPort = (port: Port, side: "left" | "right") => {
    const color = signalColorVar(port.signalType);
    const isLeft = side === "left";
    return (
      <div
        key={port.id}
        className={`relative flex items-center gap-1 h-4 ${isLeft ? "pl-3" : "pr-3 justify-end"}`}
      >
        {isLeft && <PortDot color={color} side="left" />}
        <span
          className="truncate"
          style={portLabelStyle(color)}
          title={`${port.label} (${signalLabel(port.signalType)})`}
        >
          {port.label}
        </span>
        {!isLeft && <PortDot color={color} side="right" />}
      </div>
    );
  };

  return (
    <div
      className="rounded-lg border bg-white"
      style={{ width: NODE_WIDTH, borderColor: BORDER }}
    >
      {/* Header band — device label + pretty device type (the default {{deviceType}} aux row). */}
      <div
        className="px-3 rounded-t-lg flex flex-col items-center"
        style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}`, paddingTop: 6, paddingBottom: 6 }}
      >
        <span
          className="text-xs font-semibold truncate max-w-full leading-tight"
          style={{ color: HEADING }}
          title={label}
        >
          {label.trim() || "Untitled device"}
        </span>
        {prettyType && (
          <span className="truncate max-w-full" style={{ fontSize: 9, color: MUTED, lineHeight: "12px" }}>
            {prettyType}
          </span>
        )}
      </div>

      <div style={{ paddingTop: 6, paddingBottom: 7 }}>
        {!hasAnyPorts && (
          <div className="flex items-center justify-center h-6 px-2">
            <span className="italic truncate" style={{ fontSize: 9, color: MUTED, opacity: 0.6 }}>
              No ports yet
            </span>
          </div>
        )}

        {/* Left / right port columns */}
        {(leftPorts.length > 0 || rightPorts.length > 0) &&
          (hasSections ? (
            <div className="flex">
              <div className="flex-1 min-w-0">
                {leftItems.map((item, i) =>
                  item.type === "section" ? (
                    <SectionHeader key={`ls-${i}`} name={item.name} align="left" />
                  ) : item.type === "divider" ? (
                    <Divider key={`ld-${i}`} />
                  ) : (
                    renderColumnPort(item.port, "left")
                  ),
                )}
              </div>
              <div className="flex-1 min-w-0">
                {rightItems.map((item, i) =>
                  item.type === "section" ? (
                    <SectionHeader key={`rs-${i}`} name={item.name} align="right" />
                  ) : item.type === "divider" ? (
                    <Divider key={`rd-${i}`} />
                  ) : (
                    renderColumnPort(item.port, "right")
                  ),
                )}
              </div>
            </div>
          ) : (
            <div>
              {Array.from({ length: Math.max(leftPorts.length, rightPorts.length) }, (_, i) => {
                const left = leftPorts[i];
                const right = rightPorts[i];
                const leftColor = left ? signalColorVar(left.signalType) : "";
                const rightColor = right ? signalColorVar(right.signalType) : "";
                return (
                  <div key={i} className="relative flex items-center h-4">
                    {left && <PortDot color={leftColor} side="left" />}
                    <div className="flex-1 min-w-0 pl-3">
                      {left && (
                        <span
                          className="block truncate"
                          style={portLabelStyle(leftColor)}
                          title={`${left.label} (${signalLabel(left.signalType)})`}
                        >
                          {left.label}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pr-3 text-right">
                      {right && (
                        <span
                          className="block truncate"
                          style={portLabelStyle(rightColor)}
                          title={`${right.label} (${signalLabel(right.signalType)})`}
                        >
                          {right.label}
                        </span>
                      )}
                    </div>
                    {right && <PortDot color={rightColor} side="right" />}
                  </div>
                );
              })}
            </div>
          ))}

        {/* Passthrough ports — full-width rows with rear (left) + front (right) edges. */}
        {passthroughPorts.length > 0 && (
          <div>
            <div className="flex h-4">
              <div className="flex-1">
                <SectionHeader name="Rear" align="left" />
              </div>
              <div className="flex-1">
                <SectionHeader name="Front" align="right" />
              </div>
            </div>
            {passthroughItems.map((item, i) => {
              if (item.type === "section") return <SectionHeader key={`ps-${i}`} name={item.name} align="center" />;
              if (item.type === "divider") return <Divider key={`pd-${i}`} />;
              const color = signalColorVar(item.port.signalType);
              return (
                <div key={item.port.id} className="relative flex justify-center items-center h-4">
                  <PortDot color={color} side="left" />
                  <span
                    className="truncate px-3 text-center"
                    style={{ ...portLabelStyle(color), flex: 1 }}
                    title={`${item.port.label} (${signalLabel(item.port.signalType)}) — passthrough`}
                  >
                    {"⇔"} {item.port.label}
                  </span>
                  <PortDot color={color} side="right" />
                </div>
              );
            })}
          </div>
        )}

        {/* Bidirectional ports — centered rows with a dot on each edge. */}
        {bidirectional.length > 0 && (
          <div>
            {bidirItems.map((item, i) => {
              if (item.type === "section") return <SectionHeader key={`bs-${i}`} name={item.name} align="center" />;
              if (item.type === "divider") return <Divider key={`bd-${i}`} />;
              const color = signalColorVar(item.port.signalType);
              return (
                <div key={item.port.id} className="relative flex justify-center items-center h-4">
                  <PortDot color={color} side="left" />
                  <span
                    className="truncate"
                    style={portLabelStyle(color)}
                    title={`${item.port.label} (${signalLabel(item.port.signalType)}) — bidirectional`}
                  >
                    {"↔"} {item.port.label}
                  </span>
                  <PortDot color={color} side="right" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
