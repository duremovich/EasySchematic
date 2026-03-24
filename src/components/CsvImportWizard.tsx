import { useState, useCallback, useEffect, useMemo } from "react";
import { useSchematicStore } from "../store";
import {
  parseCsv,
  detectColumns,
  extractConnections,
  matchDevices,
  buildImportResult,
  type CsvParseResult,
  type ColumnMapping,
  type ParsedConnection,
  type DeviceMatch,
} from "../csvImport";
import { fetchTemplates, getBundledTemplates } from "../templateApi";
import { scoreTemplate } from "../templateSearch";
import type { DeviceTemplate } from "../types";

const MAPPING_ROLES = [
  { key: "sourceDevice", label: "Source Device" },
  { key: "sourcePort", label: "Source Port" },
  { key: "destDevice", label: "Dest Device" },
  { key: "destPort", label: "Dest Port" },
  { key: "signalType", label: "Signal Type" },
  { key: "sourceRoom", label: "Source Room" },
  { key: "destRoom", label: "Dest Room" },
] as const;

export default function CsvImportWizard({ onClose }: { onClose: () => void }) {
  const importCsvData = useSchematicStore((s) => s.importCsvData);

  // Step state
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 state
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Step 2 state
  const [templates, setTemplates] = useState<DeviceTemplate[]>([]);
  const [connections, setConnections] = useState<ParsedConnection[]>([]);
  const [deviceMatches, setDeviceMatches] = useState<Map<string, DeviceMatch>>(new Map());
  const [searchingDevice, setSearchingDevice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Load templates on mount
  useEffect(() => {
    fetchTemplates().then(setTemplates).catch(() => setTemplates(getBundledTemplates()));
  }, []);

  // ---------- Step 1: Parse + Column Mapping ----------

  const handleText = useCallback((text: string) => {
    try {
      const result = parseCsv(text);
      if (result.rows.length === 0) {
        setError("No data rows found. Make sure the first row contains headers.");
        setParseResult(null);
        return;
      }
      setParseResult(result);
      setMapping(detectColumns(result.headers));
      setError(null);
    } catch {
      setError("Failed to parse CSV data.");
      setParseResult(null);
    }
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handleText(reader.result as string);
    reader.readAsText(file);
  }, [handleText]);

  const handlePaste = useCallback((text: string) => {
    if (text.trim()) handleText(text);
  }, [handleText]);

  const updateMapping = useCallback((role: keyof ColumnMapping, col: number) => {
    if (!mapping) return;
    setMapping({ ...mapping, [role]: col });
  }, [mapping]);

  const canProceed = mapping && mapping.sourceDevice >= 0 && mapping.destDevice >= 0;

  const goToStep2 = useCallback(() => {
    if (!parseResult || !mapping) return;
    const conns = extractConnections(parseResult.rows, mapping);
    if (conns.length === 0) {
      setError("No valid connections found. Check your column mapping.");
      return;
    }
    setConnections(conns);
    const matches = matchDevices(conns, templates);
    setDeviceMatches(matches);
    setStep(2);
  }, [parseResult, mapping, templates]);

  // ---------- Step 2: Device Matching ----------

  const deviceList = useMemo(() => {
    return [...deviceMatches.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [deviceMatches]);

  const matchedCount = useMemo(() =>
    deviceList.filter(([, m]) => m.template !== null).length,
  [deviceList]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return templates
      .filter((t) => t.deviceType !== "expansion-card" && t.deviceType !== "cable-accessory")
      .map((t) => ({ template: t, score: scoreTemplate(t, searchQuery) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [templates, searchQuery]);

  const setMatch = useCallback((csvName: string, template: DeviceTemplate | null) => {
    const existing = deviceMatches.get(csvName);
    if (!existing) return;
    const updated = new Map(deviceMatches);
    updated.set(csvName, {
      ...existing,
      template,
      score: template ? scoreTemplate(template, csvName) : 0,
    });
    setDeviceMatches(updated);
    setSearchingDevice(null);
    setSearchQuery("");
  }, [deviceMatches]);

  const handleImport = useCallback(() => {
    const result = buildImportResult(connections, deviceMatches);
    importCsvData(result.nodes, result.edges);
    onClose();
  }, [connections, deviceMatches, importCsvData, onClose]);

  // ---------- Render ----------

  const btnClass = "px-3 py-1.5 text-xs font-medium rounded border transition-colors";
  const btnPrimary = `${btnClass} bg-blue-500 text-white border-blue-500 hover:bg-blue-600`;
  const btnSecondary = `${btnClass} bg-white text-[var(--color-text)] border-[var(--color-border)] hover:bg-gray-50`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-[700px] max-w-[90vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">
            Import Cable Schedule {step === 2 ? "— Match Devices" : ""}
          </h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none">
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 1 ? (
            <Step1
              parseResult={parseResult}
              mapping={mapping}
              error={error}
              onFileUpload={handleFileUpload}
              onPaste={handlePaste}
              onUpdateMapping={updateMapping}
            />
          ) : (
            <Step2
              deviceList={deviceList}
              matchedCount={matchedCount}
              connectionCount={connections.length}
              searchingDevice={searchingDevice}
              searchQuery={searchQuery}
              searchResults={searchResults}
              onSearch={(name) => { setSearchingDevice(name); setSearchQuery(name); }}
              onSearchQueryChange={setSearchQuery}
              onSetMatch={setMatch}
              onCancelSearch={() => { setSearchingDevice(null); setSearchQuery(""); }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--color-border)]">
          {step === 2 && (
            <button className={btnSecondary} onClick={() => setStep(1)}>
              &larr; Back
            </button>
          )}
          <button className={btnSecondary} onClick={onClose}>Cancel</button>
          {step === 1 ? (
            <button className={btnPrimary} disabled={!canProceed} onClick={goToStep2}>
              Next &rarr;
            </button>
          ) : (
            <button className={btnPrimary} onClick={handleImport}>
              Import {deviceList.length} Devices, {connections.length} Connections
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Step 1 Component ----------

function Step1({
  parseResult,
  mapping,
  error,
  onFileUpload,
  onPaste,
  onUpdateMapping,
}: {
  parseResult: CsvParseResult | null;
  mapping: ColumnMapping | null;
  error: string | null;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPaste: (text: string) => void;
  onUpdateMapping: (role: keyof ColumnMapping, col: number) => void;
}) {
  const [pasteText, setPasteText] = useState("");

  return (
    <div className="space-y-4">
      {/* Upload / Paste */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <label className={`px-3 py-1.5 text-xs font-medium rounded border border-[var(--color-border)] bg-white hover:bg-gray-50 cursor-pointer transition-colors`}>
            Choose CSV File
            <input type="file" accept=".csv,.tsv,.txt" onChange={onFileUpload} className="hidden" />
          </label>
          <span className="text-[10px] text-[var(--color-text-muted)]">or paste below</span>
        </div>
        <textarea
          className="w-full h-24 text-xs font-mono border border-[var(--color-border)] rounded p-2 resize-none focus:outline-none focus:border-blue-500"
          placeholder="Paste CSV data here..."
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          onBlur={() => onPaste(pasteText)}
        />
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
      )}

      {/* Preview Table */}
      {parseResult && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">
            Preview ({parseResult.rows.length} rows)
          </div>
          <div className="overflow-x-auto border border-[var(--color-border)] rounded">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-gray-50">
                  {parseResult.headers.map((h, i) => (
                    <th key={i} className="px-2 py-1 text-left font-medium text-[var(--color-text-muted)] border-b border-[var(--color-border)] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parseResult.rows.slice(0, 5).map((row, ri) => (
                  <tr key={ri} className="border-b border-[var(--color-border)] last:border-0">
                    {parseResult.headers.map((_, ci) => (
                      <td key={ci} className="px-2 py-1 whitespace-nowrap text-[var(--color-text)]">
                        {row[ci] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Column Mapping */}
      {mapping && parseResult && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">
            Column Mapping
          </div>
          <div className="grid grid-cols-2 gap-2">
            {MAPPING_ROLES.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <span className={`text-xs w-28 ${key === "sourceDevice" || key === "destDevice" ? "font-medium" : "text-[var(--color-text-muted)]"}`}>
                  {label}{(key === "sourceDevice" || key === "destDevice") ? " *" : ""}
                </span>
                <select
                  value={mapping[key]}
                  onChange={(e) => onUpdateMapping(key, Number(e.target.value))}
                  className="flex-1 text-xs border border-[var(--color-border)] rounded px-1.5 py-1 focus:outline-none focus:border-blue-500"
                >
                  <option value={-1}>(ignore)</option>
                  {parseResult.headers.map((h, i) => (
                    <option key={i} value={i}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Step 2 Component ----------

function Step2({
  deviceList,
  matchedCount,
  connectionCount,
  searchingDevice,
  searchQuery,
  searchResults,
  onSearch,
  onSearchQueryChange,
  onSetMatch,
  onCancelSearch,
}: {
  deviceList: [string, DeviceMatch][];
  matchedCount: number;
  connectionCount: number;
  searchingDevice: string | null;
  searchQuery: string;
  searchResults: { template: DeviceTemplate; score: number }[];
  onSearch: (name: string) => void;
  onSearchQueryChange: (q: string) => void;
  onSetMatch: (csvName: string, template: DeviceTemplate | null) => void;
  onCancelSearch: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">
          Device Matching
        </div>
        <div className="text-[10px] text-[var(--color-text-muted)]">
          {matchedCount}/{deviceList.length} matched &middot; {connectionCount} connections
        </div>
      </div>

      <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
        {deviceList.map(([csvName, match]) => (
          <div key={csvName} className="border border-[var(--color-border)] rounded px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium">{csvName}</div>
              <div className="flex items-center gap-1.5">
                {match.template ? (
                  <>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${match.score > 100 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {match.score}
                    </span>
                    <button
                      className="text-[10px] text-blue-500 hover:underline"
                      onClick={() => onSearch(csvName)}
                    >
                      Change
                    </button>
                    <button
                      className="text-[10px] text-[var(--color-text-muted)] hover:underline"
                      onClick={() => onSetMatch(csvName, null)}
                    >
                      Generic
                    </button>
                  </>
                ) : (
                  <button
                    className="text-[10px] text-blue-500 hover:underline"
                    onClick={() => onSearch(csvName)}
                  >
                    Search Template
                  </button>
                )}
              </div>
            </div>

            {/* Match info */}
            <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
              {match.template ? (
                <>
                  &rarr; {match.template.label}
                  {match.template.manufacturer && <span className="ml-1">({match.template.manufacturer})</span>}
                  <span className="ml-1">&middot; {match.template.ports.length} ports</span>
                </>
              ) : (
                <>
                  &rarr; Generic device
                  <span className="ml-1">
                    ({match.inferredPorts.filter((p) => p.direction === "input").length} in,{" "}
                    {match.inferredPorts.filter((p) => p.direction === "output").length} out)
                  </span>
                </>
              )}
            </div>

            {/* Inline search */}
            {searchingDevice === csvName && (
              <div className="mt-2 space-y-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                  placeholder="Search templates..."
                  autoFocus
                />
                {searchResults.length > 0 && (
                  <div className="border border-[var(--color-border)] rounded max-h-[150px] overflow-y-auto">
                    {searchResults.map((r) => (
                      <button
                        key={r.template.id ?? r.template.label}
                        className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 border-b border-[var(--color-border)] last:border-0 flex items-center justify-between"
                        onClick={() => onSetMatch(csvName, r.template)}
                      >
                        <span>
                          {r.template.label}
                          {r.template.manufacturer && (
                            <span className="text-[var(--color-text-muted)] ml-1">({r.template.manufacturer})</span>
                          )}
                        </span>
                        <span className="text-[10px] text-[var(--color-text-muted)]">{r.score}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-1">
                  <button
                    className="text-[10px] text-[var(--color-text-muted)] hover:underline"
                    onClick={onCancelSearch}
                  >
                    Cancel
                  </button>
                  <button
                    className="text-[10px] text-[var(--color-text-muted)] hover:underline"
                    onClick={() => onSetMatch(csvName, null)}
                  >
                    Use Generic
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
