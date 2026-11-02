import { useRef } from "react";
import type { Gender, Port, PortDirection, SignalType, ConnectorType } from "../../../src/types";
import { CONNECTORS_WITH_GENDER_VARIATION, resolvePortGender } from "../../../src/connectorTypes";
import SearchableSelect from "./SearchableSelect";
import { connectorLabel, defaultConnector, signalLabel } from "../../../src/typeRegistry";
import { signalCssColor } from "../../../src/typeRegistry";
import { usePortPickerGroups } from "../hooks/useCommunityTypes";

const NETWORK_SIGNAL_TYPES = new Set(["ethernet", "ndi", "dante", "avb", "srt", "hdbaset"]);

interface PortRowProps {
  port: Port;
  index: number;
  direction: PortDirection;
  isLast: boolean;
  mime: string;
  isDragging: boolean;
  dropTarget: { direction: PortDirection; index: number } | null;
  setDropTarget: (target: { direction: PortDirection; index: number } | null) => void;
  setDraggedPortId: (id: string | null) => void;
  onDragEnd: () => void;
  selected?: boolean;
  onSelect?: (e: React.MouseEvent) => void;
  onChange: (updates: Partial<Port>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function GenderSelect({ connectorType, value, onChange }: {
  connectorType: ConnectorType | undefined;
  value: Gender | undefined;
  onChange: (g: Gender | undefined) => void;
}) {
  if (!connectorType || !CONNECTORS_WITH_GENDER_VARIATION.has(connectorType)) return null;
  return (
    <select
      value={value ?? ""}
      onChange={(e) => { const v = e.target.value; onChange(v === "" ? undefined : (v as Gender)); }}
      className={`px-2 py-1 rounded border text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
        value
          ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
          : "border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400"
      }`}
    >
      <option value="">Gender</option>
      <option value="male">Male</option>
      <option value="female">Female</option>
    </select>
  );
}

export default function PortRow({ port, index, direction, isLast, mime, isDragging, dropTarget, setDropTarget, setDraggedPortId, onDragEnd, selected, onSelect, onChange, onRemove, onMoveUp, onMoveDown }: PortRowProps) {
  // Built-in + community signals / connectors; re-renders when /types lands.
  const { signals: signalGroupOptions, connectors: connectorGroupOptions } = usePortPickerGroups();
  const isPassthrough = port.direction === "passthrough";
  const rowRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(mime, port.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedPortId(port.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return;
    const midY = rect.top + rect.height / 2;
    const insertIndex = e.clientY < midY ? index : index + 1;
    setDropTarget({ direction, index: insertIndex });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragEnd();
  };

  const showIndicatorBefore =
    dropTarget?.direction === direction && dropTarget.index === index;
  const showIndicatorAfter =
    isLast && dropTarget?.direction === direction && dropTarget.index === index + 1;

  const handleSignalChange = (newSignal: SignalType) => {
    const updates: Partial<Port> = { signalType: newSignal, inheritsSignal: false };
    const currentDefault = defaultConnector(port.signalType);
    const isConnectorDefault = !port.connectorType || port.connectorType === "none" || port.connectorType === currentDefault;
    if (isConnectorDefault) {
      updates.connectorType = defaultConnector(newSignal);
    }
    if (!NETWORK_SIGNAL_TYPES.has(newSignal)) {
      updates.addressable = undefined;
    }
    onChange(updates);
  };

  const selectClass = "px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[100px]";

  // Passthrough rows carry two labelled connector groups ("Rear:" / "Front:").
  // Each one is its own flex item so the whole group moves to the next line
  // together — the label leads its controls instead of trailing the group
  // before it. flex-wrap lets a group fold internally rather than overflow
  // when even one group is wider than the row.
  const faceGroupClass = "flex flex-wrap items-center gap-2 min-w-0";

  return (
    <>
      {showIndicatorBefore && <div className="h-0.5 bg-blue-500 rounded-full my-0.5" />}
      <div
        ref={rowRef}
        onClick={onSelect}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex items-center gap-2 p-2 rounded-lg border transition-colors cursor-pointer ${
          isDragging ? "opacity-30" : ""
        } ${
          selected
            ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 ring-1 ring-indigo-300 dark:ring-indigo-700"
            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
        }`}
      >
      <span
        draggable
        onDragStart={handleDragStart}
        onDragEnd={() => { setDraggedPortId(null); setDropTarget(null); }}
        onClick={(e) => e.stopPropagation()}
        className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 cursor-grab active:cursor-grabbing text-sm leading-none select-none shrink-0"
        title="Drag to reorder"
      >
        &#10303;
      </span>
      <span
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: signalCssColor(port.signalType) }}
      />
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          value={port.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="w-full sm:flex-1 sm:w-auto min-w-0 sm:min-w-[144px] px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Label"
        />

        {isPassthrough ? (
          <>
            {/* Signal: show inherit toggle + optional signal picker */}
            <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap" title="Signal type inherited from connected edge">
              <input
                type="checkbox"
                checked={port.inheritsSignal ?? true}
                onChange={(e) => onChange({ inheritsSignal: e.target.checked, signalType: e.target.checked ? ("custom" as SignalType) : port.signalType })}
                className="cursor-pointer"
              />
              Inherits signal
            </label>
            {!port.inheritsSignal && (
              <SearchableSelect<SignalType>
                value={port.signalType}
                onChange={handleSignalChange}
                groups={signalGroupOptions}
                labels={signalLabel}
                className={selectClass}
              />
            )}
            {/* Rear connector + gender — kept in one group so "Rear:" never
                trails the previous group when the row wraps at narrow widths. */}
            <div className={faceGroupClass}>
              <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">Rear:</span>
              <SearchableSelect<ConnectorType>
                value={(port.rearConnectorType ?? "none") as ConnectorType}
                onChange={(v) => onChange({ rearConnectorType: v === "none" ? undefined : v })}
                groups={connectorGroupOptions}
                labels={connectorLabel}
                className={selectClass}
              />
              <GenderSelect
                connectorType={port.rearConnectorType}
                value={port.rearGender}
                onChange={(g) => onChange({ rearGender: g })}
              />
            </div>
            {/* Front connector + gender */}
            <div className={faceGroupClass}>
              <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">Front:</span>
              <SearchableSelect<ConnectorType>
                value={(port.frontConnectorType ?? "none") as ConnectorType}
                onChange={(v) => onChange({ frontConnectorType: v === "none" ? undefined : v })}
                groups={connectorGroupOptions}
                labels={connectorLabel}
                className={selectClass}
              />
              <GenderSelect
                connectorType={port.frontConnectorType}
                value={port.frontGender}
                onChange={(g) => onChange({ frontGender: g })}
              />
            </div>
          </>
        ) : (
          <>
            <SearchableSelect<SignalType>
              value={port.signalType}
              onChange={handleSignalChange}
              groups={signalGroupOptions}
              labels={signalLabel}
              className={selectClass}
            />
            <SearchableSelect<ConnectorType>
              value={(port.connectorType ?? "none") as ConnectorType}
              onChange={(v) => onChange({ connectorType: v })}
              groups={connectorGroupOptions}
              labels={connectorLabel}
              recommended={defaultConnector(port.signalType)}
              recommendedLabel={`Default for ${signalLabel(port.signalType)}`}
              className={selectClass}
            />
            {port.connectorType && CONNECTORS_WITH_GENDER_VARIATION.has(port.connectorType) && (() => {
              const resolved = resolvePortGender(port);
              return (
                <select
                  value={port.gender ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange({ gender: v === "" ? undefined : (v as Gender) });
                  }}
                  className={`px-2 py-1 rounded border text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    port.gender
                      ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400"
                  }`}
                  title={port.gender ? "Connector gender (overridden)" : `Connector gender (auto: ${resolved ?? "—"})`}
                >
                  <option value="">{resolved ? `${resolved === "male" ? "M" : "F"} (auto)` : "Gender"}</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              );
            })()}
            <input
              type="text"
              value={port.section ?? ""}
              onChange={(e) => onChange({ section: e.target.value || undefined })}
              className="w-full sm:w-24 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Section"
            />
            {NETWORK_SIGNAL_TYPES.has(port.signalType) && (
              <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap" title="Port has an IP address / network stack">
                <input
                  type="checkbox"
                  checked={port.addressable !== false}
                  onChange={(e) => onChange({ addressable: e.target.checked ? undefined : false })}
                  className="cursor-pointer"
                />
                Addr
              </label>
            )}
            <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap" title="Multi-connect — accepts multiple connections (e.g. SRT receiver, wireless RX, custom signals)">
              <input
                type="checkbox"
                checked={port.multiConnect ?? false}
                onChange={(e) => onChange({ multiConnect: e.target.checked || undefined })}
                className="cursor-pointer"
              />
              Multi
            </label>
          </>
        )}

        <div className="flex flex-col">
          <button onClick={onMoveUp} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 text-xs leading-none" title="Move up">&#9650;</button>
          <button onClick={onMoveDown} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 text-xs leading-none" title="Move down">&#9660;</button>
        </div>
        <button
          onClick={onRemove}
          className="text-red-400 hover:text-red-600 text-lg leading-none px-1 transition-colors"
          title="Remove port"
        >
          &times;
        </button>
      </div>
      </div>
      {showIndicatorAfter && <div className="h-0.5 bg-blue-500 rounded-full my-0.5" />}
    </>
  );
}
