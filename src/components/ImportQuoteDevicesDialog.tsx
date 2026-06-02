import { useEffect, useMemo, useRef, useState } from "react";
import { useSchematicStore } from "../store";
import type { DeviceTemplate } from "../types";
import type {
  ExtractedQuoteDevice,
  QuoteImportCandidateMatch,
  JetbuiltClientSearchResult,
  JetbuiltIndexStatus,
  JetbuiltProjectSearchResult,
  LibraryMatchStatus,
  QuoteImportDraftReview,
  QuoteImportExtractionResponse,
  QuoteImportResultItem,
} from "../quoteImportTypes";
import {
  fetchTatesideDeviceTemplates,
  fetchJetbuiltIndexStatus,
  importDevicesFromJetbuiltProject,
  importDevicesFromQuote,
  listJetbuiltProjectsForClient,
  researchQuoteDevices,
  saveTatesideDeviceTemplates,
  searchJetbuiltClients,
  searchJetbuiltProjects,
  TatesideApiError,
} from "../tatesideApi";
import { validateTemplate } from "../import/validate";
import ManageTatesideTemplateDialog from "./ManageTatesideTemplateDialog";

interface Props {
  open: boolean;
  onClose: () => void;
  onLibraryChanged?: () => void | Promise<void>;
}

interface EditingDraftState {
  key: string;
  template: DeviceTemplate;
}

type PossibleMatchDecision = "use_library_match" | "research_missing";

const STATUS_LABELS: Record<LibraryMatchStatus, string> = {
  already_in_library: "Already in library",
  possible_match: "Possible match",
  missing: "Missing",
};

const STATUS_CLASSES: Record<LibraryMatchStatus, string> = {
  already_in_library: "bg-emerald-100 text-emerald-800 border-emerald-200",
  possible_match: "bg-amber-100 text-amber-800 border-amber-200",
  missing: "bg-red-100 text-red-800 border-red-200",
};

export default function ImportQuoteDevicesDialog({ open, onClose, onLibraryChanged }: Props) {
  const addToast = useSchematicStore((s) => s.addToast);
  const importCustomTemplates = useSchematicStore((s) => s.importCustomTemplates);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importSourceLabel, setImportSourceLabel] = useState<string | null>(null);
  const [jetbuiltQuery, setJetbuiltQuery] = useState("");
  const [jetbuiltClientQuery, setJetbuiltClientQuery] = useState("");
  const [jetbuiltSearching, setJetbuiltSearching] = useState(false);
  const [jetbuiltClientSearching, setJetbuiltClientSearching] = useState(false);
  const [jetbuiltImporting, setJetbuiltImporting] = useState(false);
  const [jetbuiltProjects, setJetbuiltProjects] = useState<JetbuiltProjectSearchResult[]>([]);
  const [jetbuiltClients, setJetbuiltClients] = useState<JetbuiltClientSearchResult[]>([]);
  const [selectedJetbuiltClient, setSelectedJetbuiltClient] = useState<JetbuiltClientSearchResult | null>(null);
  const [clientProjects, setClientProjects] = useState<JetbuiltProjectSearchResult[]>([]);
  const [jetbuiltStatus, setJetbuiltStatus] = useState<JetbuiltIndexStatus | null>(null);
  const [libraryTemplatesById, setLibraryTemplatesById] = useState<Record<string, DeviceTemplate>>({});
  const [extracting, setExtracting] = useState(false);
  const [researching, setResearching] = useState(false);
  const [researchProgress, setResearchProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<QuoteImportExtractionResponse | null>(null);
  const [researchResults, setResearchResults] = useState<QuoteImportDraftReview[]>([]);
  const [possibleMatchDecisions, setPossibleMatchDecisions] = useState<Record<string, PossibleMatchDecision>>({});
  const [selectedDraftKeys, setSelectedDraftKeys] = useState<Set<string>>(new Set());
  const [excludedExtractedKeys, setExcludedExtractedKeys] = useState<Set<string>>(new Set());
  const [ignoredDraftKeys, setIgnoredDraftKeys] = useState<Set<string>>(new Set());
  const [editingDraft, setEditingDraft] = useState<EditingDraftState | null>(null);

  const keyForExtractedDevice = (device: ExtractedQuoteDevice) => `${device.normalizedLookupKey || "device"}:${device.model}`;

  const reset = () => {
    setSelectedFile(null);
    setImportSourceLabel(null);
    setJetbuiltQuery("");
    setJetbuiltClientQuery("");
    setJetbuiltSearching(false);
    setJetbuiltClientSearching(false);
    setJetbuiltImporting(false);
    setJetbuiltProjects([]);
    setJetbuiltClients([]);
    setSelectedJetbuiltClient(null);
    setClientProjects([]);
    setJetbuiltStatus(null);
    setLibraryTemplatesById({});
    setExtracting(false);
    setResearching(false);
    setResearchProgress(null);
    setSaving(false);
    setError(null);
    setExtraction(null);
    setResearchResults([]);
    setPossibleMatchDecisions({});
    setSelectedDraftKeys(new Set());
    setExcludedExtractedKeys(new Set());
    setIgnoredDraftKeys(new Set());
    setEditingDraft(null);
    onClose();
  };

  const unresolvedPossibleMatches = useMemo(
    () => (extraction?.results ?? []).filter((item) => item.status === "possible_match" && !possibleMatchDecisions[keyForExtractedDevice(item)]),
    [extraction, possibleMatchDecisions],
  );

  const missingDevices = useMemo(() => {
    if (!extraction) return [];
    return extraction.results.filter((item) => {
      const key = keyForExtractedDevice(item);
      if (item.status === "missing") return true;
      if (item.status === "possible_match") return possibleMatchDecisions[key] === "research_missing";
      return false;
    });
  }, [extraction, possibleMatchDecisions]);

  const devicesNeedingResearch = useMemo(
    () => missingDevices.filter((item) => !excludedExtractedKeys.has(keyForExtractedDevice(item))),
    [missingDevices, excludedExtractedKeys],
  );

  const alreadyInLibraryItems = useMemo(() => {
    if (!extraction) return [];
    return extraction.results.filter((item) => {
      const key = keyForExtractedDevice(item);
      return item.status === "already_in_library" || possibleMatchDecisions[key] === "use_library_match";
    });
  }, [extraction, possibleMatchDecisions]);

  const readyDrafts = useMemo(
    () => researchResults.filter((item) => item.reviewStatus === "draft_ready" && item.template && !ignoredDraftKeys.has(keyForExtractedDevice(item.extractedDevice))),
    [researchResults, ignoredDraftKeys],
  );

  const manualReviewItems = useMemo(
    () => researchResults.filter((item) => item.reviewStatus === "manual_review_required" && !ignoredDraftKeys.has(keyForExtractedDevice(item.extractedDevice))),
    [researchResults, ignoredDraftKeys],
  );

  const selectedDraftTemplates = useMemo(
    () => readyDrafts
      .filter((item) => selectedDraftKeys.has(keyForExtractedDevice(item.extractedDevice)))
      .map((item) => item.template)
      .filter((template): template is DeviceTemplate => !!template),
    [readyDrafts, selectedDraftKeys],
  );

  const handleFileSelected = (file: File | null) => {
    setSelectedFile(file);
    setImportSourceLabel(file?.name ?? null);
    setError(null);
    setExtraction(null);
    setResearchResults([]);
    setPossibleMatchDecisions({});
    setSelectedDraftKeys(new Set());
    setExcludedExtractedKeys(new Set());
    setIgnoredDraftKeys(new Set());
    setResearchProgress(null);
  };

  const refreshJetbuiltStatus = async () => {
    try {
      const status = await fetchJetbuiltIndexStatus();
      setJetbuiltStatus(status);
    } catch {
      setJetbuiltStatus(null);
    }
  };

  const handleExtract = async () => {
    if (!selectedFile) return;
    setExtracting(true);
    setError(null);
    try {
      const response = await importDevicesFromQuote(selectedFile);
      setExtraction(response);
      setImportSourceLabel(selectedFile.name);
      setResearchResults([]);
      addToast(`Extracted ${response.extractedCount} quote device candidate${response.extractedCount === 1 ? "" : "s"}`, "success");
    } catch (err) {
      const message = err instanceof TatesideApiError ? err.message : err instanceof Error ? err.message : "Quote import failed";
      setError(message);
    } finally {
      setExtracting(false);
    }
  };

  const handleSearchJetbuilt = async () => {
    const query = jetbuiltQuery.trim();
    if (!query) return;
    setJetbuiltSearching(true);
    setError(null);
    try {
      await refreshJetbuiltStatus();
      const projects = await searchJetbuiltProjects(query);
      setJetbuiltProjects(projects);
      if (projects.length === 0) {
        addToast(`No Jetbuilt projects matched ${query}. Try a P number, project name, or Jetbuilt project id.`, "info");
      }
    } catch (err) {
      const message = err instanceof TatesideApiError ? err.message : err instanceof Error ? err.message : "Jetbuilt project search failed";
      setError(message);
      setJetbuiltProjects([]);
    } finally {
      setJetbuiltSearching(false);
    }
  };

  const handleSearchJetbuiltClients = async () => {
    const query = jetbuiltClientQuery.trim();
    if (!query) return;
    setJetbuiltClientSearching(true);
    setError(null);
    try {
      await refreshJetbuiltStatus();
      const clients = await searchJetbuiltClients(query);
      setJetbuiltClients(clients);
      setSelectedJetbuiltClient(null);
      setClientProjects([]);
      if (clients.length === 0) {
        addToast(`No Jetbuilt clients matched ${query}`, "info");
      }
    } catch (err) {
      const message = err instanceof TatesideApiError ? err.message : err instanceof Error ? err.message : "Jetbuilt client search failed";
      setError(message);
      setJetbuiltClients([]);
    } finally {
      setJetbuiltClientSearching(false);
    }
  };

  const handleSelectJetbuiltClient = async (client: JetbuiltClientSearchResult) => {
    setSelectedJetbuiltClient(client);
    setJetbuiltImporting(true);
    setError(null);
    try {
      const projects = await listJetbuiltProjectsForClient(client.id);
      setClientProjects(projects);
    } catch (err) {
      const message = err instanceof TatesideApiError ? err.message : err instanceof Error ? err.message : "Jetbuilt client projects could not be loaded";
      setError(message);
      setClientProjects([]);
    } finally {
      setJetbuiltImporting(false);
    }
  };

  const handleImportJetbuiltProject = async (project: JetbuiltProjectSearchResult) => {
    setJetbuiltImporting(true);
    setError(null);
    try {
      const response = await importDevicesFromJetbuiltProject(project.id);
      setExtraction(response);
      setImportSourceLabel(project.customId ? `${project.customId} ${project.name}` : project.name);
      setResearchResults([]);
      setPossibleMatchDecisions({});
      setSelectedDraftKeys(new Set());
      setExcludedExtractedKeys(new Set());
      setIgnoredDraftKeys(new Set());
      addToast(`Imported ${response.extractedCount} Jetbuilt device candidate${response.extractedCount === 1 ? "" : "s"}`, "success");
    } catch (err) {
      const message = err instanceof TatesideApiError ? err.message : err instanceof Error ? err.message : "Jetbuilt project import failed";
      setError(message);
    } finally {
      setJetbuiltImporting(false);
    }
  };

  const handleResearchMissing = async () => {
    if (!extraction || devicesNeedingResearch.length === 0) return;
    if (unresolvedPossibleMatches.length > 0) {
      setError("Review each possible library match before researching missing devices.");
      return;
    }
    setResearching(true);
    setResearchProgress({ current: 0, total: devicesNeedingResearch.length, label: "Starting research..." });
    setError(null);
    try {
      const aggregatedResults: QuoteImportDraftReview[] = [];
      const warnings = new Set<string>();

      for (let index = 0; index < devicesNeedingResearch.length; index += 1) {
        const item = devicesNeedingResearch[index];
        setResearchProgress({
          current: index + 1,
          total: devicesNeedingResearch.length,
          label: `Researching ${item.manufacturer ? `${item.manufacturer} ` : ""}${item.model}`.trim(),
        });

        const response = await researchQuoteDevices(extraction.fileName, [{
          manufacturer: item.manufacturer,
          model: item.model,
          description: item.description,
          quantity: item.quantity,
          sourceLineText: item.sourceLineText,
          normalizedLookupKey: item.normalizedLookupKey,
        }]);

        aggregatedResults.push(...response.results);
        response.warnings.forEach((warning) => warnings.add(warning));
        setResearchResults([...aggregatedResults]);
        setSelectedDraftKeys((current) => {
          const next = new Set(current);
          response.results.forEach((result) => {
            if (result.reviewStatus === "draft_ready" && result.template) {
              next.add(keyForExtractedDevice(result.extractedDevice));
            }
          });
          return next;
        });
      }

      if (warnings.size > 0) {
        addToast([...warnings].join(" "), "info");
      } else {
        addToast(`Researched ${aggregatedResults.length} missing device candidate${aggregatedResults.length === 1 ? "" : "s"}`, "success");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Missing-device research failed");
    } finally {
      setResearching(false);
      setResearchProgress(null);
    }
  };

  const handleManualStrongerRetry = async (item: QuoteImportDraftReview) => {
    setResearching(true);
    setResearchProgress({ current: 1, total: 1, label: `Retrying ${item.extractedDevice.model}` });
    setError(null);
    try {
      const response = await researchQuoteDevices(extraction?.fileName ?? selectedFile?.name ?? "quote.pdf", [item.extractedDevice], {
        forceEscalation: true,
      });
      const replacement = response.results[0];
      if (!replacement) return;
      setResearchResults((current) => current.map((entry) => (
        keyForExtractedDevice(entry.extractedDevice) === keyForExtractedDevice(item.extractedDevice) ? replacement : entry
      )));
      if (replacement.reviewStatus === "draft_ready") {
        setSelectedDraftKeys((current) => new Set([...current, keyForExtractedDevice(replacement.extractedDevice)]));
      }
      addToast(`Retried ${item.extractedDevice.model} with the stronger research model`, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setResearching(false);
      setResearchProgress(null);
    }
  };

  const handleSaveSelectedToLibrary = async () => {
    if (selectedDraftTemplates.length === 0 || !extraction) return;
    setSaving(true);
    setError(null);
    try {
      const templatesToSave = selectedDraftTemplates.map((template) => {
        const { id, version, ...rest } = template;
        void id;
        void version;
        return {
          ...rest,
          aiMetadata: rest.aiMetadata
            ? {
              ...rest.aiMetadata,
              approvedAt: new Date().toISOString(),
            }
            : rest.aiMetadata,
        };
      });
      const result = await saveTatesideDeviceTemplates(templatesToSave, {
        source: "import-workflow-approval",
        note: `Approved from import workflow: ${importSourceLabel ?? extraction.fileName}`,
      });
      await onLibraryChanged?.();
      addToast(`Saved ${result.templates.length} reviewed device draft${result.templates.length === 1 ? "" : "s"} to the TateSide library`, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save selected devices");
    } finally {
      setSaving(false);
    }
  };

  const handleAddSelectedLocally = () => {
    if (selectedDraftTemplates.length === 0) return;
    importCustomTemplates(selectedDraftTemplates);
    addToast(`Added ${selectedDraftTemplates.length} reviewed device draft${selectedDraftTemplates.length === 1 ? "" : "s"} locally`, "success");
  };

  const setPossibleDecision = (item: QuoteImportResultItem, decision: PossibleMatchDecision) => {
    const key = keyForExtractedDevice(item);
    setPossibleMatchDecisions((current) => ({ ...current, [key]: decision }));
  };

  const toggleDraftSelected = (item: QuoteImportDraftReview) => {
    const key = keyForExtractedDevice(item.extractedDevice);
    setSelectedDraftKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleIgnored = (item: QuoteImportDraftReview) => {
    const key = keyForExtractedDevice(item.extractedDevice);
    setIgnoredDraftKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleExcludedExtracted = (item: QuoteImportResultItem) => {
    const key = keyForExtractedDevice(item);
    setExcludedExtractedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDraftEdited = (updatedTemplate: DeviceTemplate) => {
    if (!editingDraft) return;
    setResearchResults((current) => current.map((item) => (
      keyForExtractedDevice(item.extractedDevice) === editingDraft.key
        ? { ...item, template: updatedTemplate }
        : item
    )));
    setEditingDraft(null);
  };

  const ensureLibraryTemplatesLoaded = async (): Promise<Record<string, DeviceTemplate>> => {
    if (Object.keys(libraryTemplatesById).length > 0) return libraryTemplatesById;
    const templates = await fetchTatesideDeviceTemplates();
    const byId = Object.fromEntries(
      templates
        .filter((template): template is DeviceTemplate & { id: string } => typeof template.id === "string" && template.id.length > 0)
        .map((template) => [template.id, template]),
    );
    setLibraryTemplatesById(byId);
    return byId;
  };

  const handleCopyPortsFromLibraryCandidate = async (item: QuoteImportResultItem, candidate: QuoteImportCandidateMatch) => {
    setError(null);
    try {
      const templatesById = await ensureLibraryTemplatesLoaded();
      const sourceTemplate = templatesById[candidate.id];
      if (!sourceTemplate) {
        throw new Error("The selected TateSide library device could not be loaded");
      }

      const copiedTemplate: DeviceTemplate = {
        ...sourceTemplate,
        label: [item.manufacturer ?? sourceTemplate.manufacturer, item.model].filter(Boolean).join(" "),
        shortName: item.model,
        manufacturer: item.manufacturer ?? sourceTemplate.manufacturer,
        modelNumber: item.model,
        ports: sourceTemplate.ports.map((port, index) => ({
          ...port,
          id: `port-copy-${index + 1}`,
        })),
      };
      const validation = validateTemplate(copiedTemplate);
      const draftKey = keyForExtractedDevice(item);
      const review: QuoteImportDraftReview = {
        extractedDevice: {
          manufacturer: item.manufacturer,
          model: item.model,
          description: item.description,
          quantity: item.quantity,
          sourceLineText: item.sourceLineText,
          normalizedLookupKey: item.normalizedLookupKey,
        },
        template: copiedTemplate,
        metadata: null,
        draftSource: "library_port_copy",
        validation,
        reviewStatus: validation.ok ? "draft_ready" : "manual_review_required",
        error: null,
        portSummary: copiedTemplate.ports.slice(0, 8).map((port) => `${port.label} - ${port.signalType} ${port.direction}`),
      };

      setResearchResults((current) => {
        const remaining = current.filter((entry) => keyForExtractedDevice(entry.extractedDevice) !== draftKey);
        return [...remaining, review];
      });
      setExcludedExtractedKeys((current) => new Set([...current, draftKey]));
      if (validation.ok) {
        setSelectedDraftKeys((current) => new Set([...current, draftKey]));
      }
      addToast(`Copied ports from ${candidate.label} into a draft for ${item.model}`, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy ports from the TateSide library device");
    }
  };

  useEffect(() => {
    if (!open) return;
    void refreshJetbuiltStatus();
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={reset}
      >
        <div
          className="rounded-lg shadow-xl w-[1100px] max-w-[97vw] max-h-[94vh] flex flex-col"
          style={{
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-heading)" }}>
                  Import Devices
                </h2>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                  Import directly from a Jetbuilt project first, then fall back to quote PDF upload only when needed.
                </p>
              </div>
              <button onClick={reset} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer">✕</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="rounded border p-3 space-y-3" style={{ borderColor: "var(--color-border)" }}>
              <div>
                <div className="text-xs font-medium text-[var(--color-text-heading)]">Import from Jetbuilt Project</div>
                <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
                  Preferred route. Search by P number, project name, or Jetbuilt project id.
                </div>
              </div>

              <div className="text-[11px] text-[var(--color-text-muted)]">
                {jetbuiltStatus
                  ? `Jetbuilt index: ${jetbuiltStatus.projectCount} projects, ${jetbuiltStatus.clientCount} clients${jetbuiltStatus.syncedAt ? `, last synced ${new Date(jetbuiltStatus.syncedAt).toLocaleString()}` : ""}${jetbuiltStatus.refreshing ? " (refreshing)" : ""}`
                  : "Jetbuilt index status loads when you search."}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={jetbuiltQuery}
                  onChange={(e) => setJetbuiltQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSearchJetbuilt();
                    }
                  }}
                  placeholder="Search P number or project name, for example P-5844 or O2 Meeting Rooms"
                  className="flex-1 min-w-[240px] bg-white border border-[var(--color-border)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 placeholder:text-[var(--color-text-muted)]"
                />
                <button
                  onClick={handleSearchJetbuilt}
                  disabled={!jetbuiltQuery.trim() || jetbuiltSearching}
                  className="px-4 py-1.5 rounded bg-blue-500 text-white text-xs hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {jetbuiltSearching ? "Searching..." : "Search Jetbuilt"}
                </button>
              </div>

              {jetbuiltProjects.length > 0 && (
                <div className="rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
                  <div className="max-h-56 overflow-y-auto">
                    {jetbuiltProjects.map((project) => (
                      <div
                        key={project.id}
                        className="px-3 py-2 border-b flex items-center gap-3"
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        <div className="flex-1 min-w-0 text-xs">
                          <div className="font-medium text-[var(--color-text-heading)] truncate">
                            {project.customId ? `${project.customId} - ${project.name}` : project.name}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-muted)] truncate">
                            Jetbuilt #{project.id}
                            {project.stage ? ` · ${project.stage}` : ""}
                            {typeof project.itemCount === "number" ? ` · ${project.itemCount} items` : ""}
                            {project.updatedAt ? ` · updated ${new Date(project.updatedAt).toLocaleDateString()}` : ""}
                          </div>
                        </div>
                        <button
                          onClick={() => void handleImportJetbuiltProject(project)}
                          disabled={jetbuiltImporting}
                          className="px-3 py-1.5 rounded border border-[var(--color-border)] bg-white text-xs hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {jetbuiltImporting ? "Importing..." : "Import"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
                <div className="text-xs font-medium text-[var(--color-text-heading)]">Browse by Client</div>
                <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
                  Search for a client, then choose one of their Jetbuilt projects from the list.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={jetbuiltClientQuery}
                  onChange={(e) => setJetbuiltClientQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSearchJetbuiltClients();
                    }
                  }}
                  placeholder="Search Jetbuilt client"
                  className="flex-1 min-w-[240px] bg-white border border-[var(--color-border)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 placeholder:text-[var(--color-text-muted)]"
                />
                <button
                  onClick={handleSearchJetbuiltClients}
                  disabled={!jetbuiltClientQuery.trim() || jetbuiltClientSearching}
                  className="px-4 py-1.5 rounded border border-[var(--color-border)] bg-white text-xs hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {jetbuiltClientSearching ? "Searching..." : "Search Clients"}
                </button>
              </div>

              {jetbuiltClients.length > 0 && (
                <div className="rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
                  <div className="max-h-40 overflow-y-auto">
                    {jetbuiltClients.map((client) => (
                      <button
                        key={client.id}
                        onClick={() => void handleSelectJetbuiltClient(client)}
                        className={`w-full text-left px-3 py-2 border-b cursor-pointer hover:bg-[var(--color-surface-hover)] ${
                          selectedJetbuiltClient?.id === client.id ? "bg-blue-50" : ""
                        }`}
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        <div className="text-xs font-medium text-[var(--color-text-heading)]">{client.companyName}</div>
                        <div className="text-[11px] text-[var(--color-text-muted)]">
                          Client #{client.id}
                          {client.primaryContactName ? ` · ${client.primaryContactName}` : ""}
                          {typeof client.projectCount === "number" ? ` · ${client.projectCount} projects` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedJetbuiltClient && (
                <div className="rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
                  <div className="px-3 py-2 border-b text-xs font-medium text-[var(--color-text-heading)]" style={{ borderColor: "var(--color-border)" }}>
                    Projects for {selectedJetbuiltClient.companyName}
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {clientProjects.length > 0 ? clientProjects.map((project) => (
                      <div
                        key={`${selectedJetbuiltClient.id}:${project.id}`}
                        className="px-3 py-2 border-b flex items-center gap-3"
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        <div className="flex-1 min-w-0 text-xs">
                          <div className="font-medium text-[var(--color-text-heading)] truncate">
                            {project.customId ? `${project.customId} - ${project.name}` : project.name}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-muted)] truncate">
                            Jetbuilt #{project.id}
                            {project.stage ? ` · ${project.stage}` : ""}
                            {typeof project.itemCount === "number" ? ` · ${project.itemCount} items` : ""}
                            {project.updatedAt ? ` · updated ${new Date(project.updatedAt).toLocaleDateString()}` : ""}
                          </div>
                        </div>
                        <button
                          onClick={() => void handleImportJetbuiltProject(project)}
                          disabled={jetbuiltImporting}
                          className="px-3 py-1.5 rounded border border-[var(--color-border)] bg-white text-xs hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {jetbuiltImporting ? "Importing..." : "Import"}
                        </button>
                      </div>
                    )) : (
                      <div className="px-3 py-3 text-[11px] text-[var(--color-text-muted)]">
                        No cached projects were found for this client.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded border p-3" style={{ borderColor: "var(--color-border)" }}>
              <div className="text-xs font-medium text-[var(--color-text-heading)] mb-2">Fallback Quote PDF Upload</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded border border-[var(--color-border)] bg-white text-xs hover:bg-[var(--color-surface-hover)] cursor-pointer"
                >
                  Choose PDF
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
                />
                <div className="text-xs text-[var(--color-text-muted)]">
                  {selectedFile ? selectedFile.name : "Keep this as a fallback when Jetbuilt project import is not suitable."}
                </div>
                <button
                  onClick={handleExtract}
                  disabled={!selectedFile || extracting}
                  className="ml-auto px-4 py-1.5 rounded bg-blue-500 text-white text-xs hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {extracting ? "Extracting..." : "Extract Device Models"}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            {extraction && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <SummaryCard label="Extracted devices" value={String(extraction.extractedCount)} tone="default" />
                  <SummaryCard label="Already in library" value={String(alreadyInLibraryItems.length)} tone="success" />
                  <SummaryCard label="Possible matches" value={String((extraction.results ?? []).filter((item) => item.status === "possible_match").length)} tone="warning" />
                  <SummaryCard label="Missing devices" value={String(missingDevices.length)} tone="danger" />
                </div>

                <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  Extraction model: <strong>{extraction.extractionModel}</strong> with <strong>{extraction.extractionReasoningEffort}</strong> reasoning effort.
                </div>

                {importSourceLabel && (
                  <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    Import source: <strong>{importSourceLabel}</strong>
                  </div>
                )}

                {extraction.warnings.length > 0 && (
                  <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 space-y-1">
                    {extraction.warnings.map((warning, index) => <div key={`${warning}-${index}`}>{warning}</div>)}
                  </div>
                )}

                <SectionCard title="Already In Library" count={alreadyInLibraryItems.length}>
                  {alreadyInLibraryItems.length > 0 ? alreadyInLibraryItems.map((item) => (
                    <ExtractionRow key={keyForExtractedDevice(item)} item={item} />
                  )) : <EmptyState text="No extracted devices are confirmed as already in the TateSide library yet." />}
                </SectionCard>

                <SectionCard title="Possible Matches" count={(extraction.results ?? []).filter((item) => item.status === "possible_match").length}>
                  {(extraction.results ?? []).filter((item) => item.status === "possible_match").length > 0 ? (
                    extraction.results
                      .filter((item) => item.status === "possible_match")
                      .map((item) => (
                        <PossibleMatchRow
                          key={keyForExtractedDevice(item)}
                          item={item}
                          decision={possibleMatchDecisions[keyForExtractedDevice(item)]}
                          onUseLibraryMatch={() => setPossibleDecision(item, "use_library_match")}
                          onResearchMissing={() => setPossibleDecision(item, "research_missing")}
                        />
                      ))
                  ) : (
                    <EmptyState text="No possible matches need review." />
                  )}
                </SectionCard>

                <SectionCard title="Missing Devices" count={missingDevices.length} action={(
                  <button
                    onClick={handleResearchMissing}
                    disabled={devicesNeedingResearch.length === 0 || researching || unresolvedPossibleMatches.length > 0}
                    className="px-3 py-1.5 rounded bg-blue-500 text-white text-xs hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {researching
                      ? (researchProgress ? `${researchProgress.current}/${researchProgress.total} Researching...` : "Researching...")
                      : "Research Missing Devices"}
                  </button>
                )}>
                  {researchProgress && researching && (
                    <div className="px-3 py-2 text-[11px] text-blue-700 border-b" style={{ borderColor: "var(--color-border)" }}>
                      {researchProgress.label}
                    </div>
                  )}
                  {missingDevices.length > 0 ? missingDevices.map((item) => (
                    <ExtractionRow
                      key={keyForExtractedDevice(item)}
                      item={item}
                      excluded={excludedExtractedKeys.has(keyForExtractedDevice(item))}
                      onToggleExcluded={() => toggleExcludedExtracted(item)}
                      onCopyPortsFromCandidate={(candidate) => void handleCopyPortsFromLibraryCandidate(item, candidate)}
                    />
                  )) : (
                    <EmptyState text="No devices are queued for research." />
                  )}
                  {unresolvedPossibleMatches.length > 0 && (
                    <div className="mt-2 text-[11px] text-amber-700">
                      Review each possible match before researching missing devices.
                    </div>
                  )}
                </SectionCard>
              </>
            )}

            {researchResults.length > 0 && (
              <>
                <SectionCard title="Generated Drafts Ready For Review" count={readyDrafts.length} action={(
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleAddSelectedLocally}
                      disabled={selectedDraftTemplates.length === 0}
                      className="px-3 py-1.5 rounded border border-[var(--color-border)] bg-white text-xs hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Add Selected Locally
                    </button>
                    <button
                      onClick={handleSaveSelectedToLibrary}
                      disabled={selectedDraftTemplates.length === 0 || saving}
                      className="px-3 py-1.5 rounded bg-blue-500 text-white text-xs hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {saving ? "Saving..." : `Approve And Save ${selectedDraftTemplates.length || ""}`.trim()}
                    </button>
                  </div>
                )}>
                  {readyDrafts.length > 0 ? readyDrafts.map((item) => (
                    <DraftReviewRow
                      key={keyForExtractedDevice(item.extractedDevice)}
                      item={item}
                      selected={selectedDraftKeys.has(keyForExtractedDevice(item.extractedDevice))}
                      ignored={ignoredDraftKeys.has(keyForExtractedDevice(item.extractedDevice))}
                      onToggleSelected={() => toggleDraftSelected(item)}
                      onToggleIgnored={() => toggleIgnored(item)}
                      onEdit={() => setEditingDraft(item.template ? {
                        key: keyForExtractedDevice(item.extractedDevice),
                        template: item.template,
                      } : null)}
                      onRetryStronger={() => handleManualStrongerRetry(item)}
                    />
                  )) : <EmptyState text="No saveable drafts are ready yet." />}
                </SectionCard>

                <SectionCard title="Missing Devices Requiring Manual Review" count={manualReviewItems.length}>
                  {manualReviewItems.length > 0 ? manualReviewItems.map((item) => (
                    <DraftReviewRow
                      key={keyForExtractedDevice(item.extractedDevice)}
                      item={item}
                      selected={false}
                      ignored={ignoredDraftKeys.has(keyForExtractedDevice(item.extractedDevice))}
                      onToggleSelected={undefined}
                      onToggleIgnored={() => toggleIgnored(item)}
                      onEdit={item.template ? () => setEditingDraft({
                        key: keyForExtractedDevice(item.extractedDevice),
                        template: item.template!,
                      }) : undefined}
                      onRetryStronger={item.metadata?.escalationOccurred ? undefined : () => handleManualStrongerRetry(item)}
                    />
                  )) : <EmptyState text="No missing devices are waiting for manual review." />}
                </SectionCard>
              </>
            )}
          </div>

          <div className="px-4 py-3 border-t flex items-center justify-end gap-2" style={{ borderColor: "var(--color-border)" }}>
            <button
              onClick={reset}
              className="px-3 py-1.5 rounded border border-[var(--color-border)] bg-white text-xs hover:bg-[var(--color-surface-hover)] cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <ManageTatesideTemplateDialog
        open={!!editingDraft}
        template={editingDraft?.template ?? null}
        onClose={() => setEditingDraft(null)}
        onSaved={handleDraftEdited}
        saveMode="create"
        saveSource="ai-quote-import-approval"
        title="Edit Draft Device"
      />
    </>
  );
}

function SectionCard({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border" style={{ borderColor: "var(--color-border)" }}>
      <div className="px-3 py-2 border-b flex items-center justify-between gap-3" style={{ borderColor: "var(--color-border)" }}>
        <div className="text-xs font-semibold text-[var(--color-text-heading)]">
          {title} <span className="text-[var(--color-text-muted)] font-normal">({count})</span>
        </div>
        {action}
      </div>
      <div className="max-h-[36vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-heading)]",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-red-200 bg-red-50 text-red-800",
  }[tone];

  return (
    <div className={`rounded border px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function ExtractionRow({
  item,
  excluded = false,
  onToggleExcluded,
  onCopyPortsFromCandidate,
}: {
  item: QuoteImportResultItem;
  excluded?: boolean;
  onToggleExcluded?: () => void;
  onCopyPortsFromCandidate?: (candidate: QuoteImportCandidateMatch) => void;
}) {
  return (
    <div className={`px-3 py-3 border-b text-xs ${excluded ? "opacity-55" : ""}`} style={{ borderColor: "var(--color-border)" }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="font-medium text-[var(--color-text-heading)]">
              {[item.manufacturer, item.model].filter(Boolean).join(" ")}
            </span>
            <span className={`px-2 py-0.5 rounded-full border text-[10px] ${STATUS_CLASSES[item.status]}`}>
              {STATUS_LABELS[item.status]}
            </span>
            {typeof item.quantity === "number" && (
              <span className="text-[10px] rounded bg-[var(--color-bg)] px-2 py-0.5 border border-[var(--color-border)]">
                Qty {item.quantity}
              </span>
            )}
            {excluded && (
              <span className="px-2 py-0.5 rounded-full border text-[10px] border-slate-300 bg-slate-100 text-slate-700">
                Excluded from research
              </span>
            )}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] space-y-0.5">
            {item.description && <div>{item.description}</div>}
            {item.sourceLineText && <div>Quote text: {item.sourceLineText}</div>}
            <div>Lookup key: <span className="font-mono">{item.normalizedLookupKey || "(none)"}</span></div>
          </div>
          {item.exactMatch && (
            <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-800">
              <div className="font-medium">{item.exactMatch.label}</div>
              <div>{[item.exactMatch.manufacturer, item.exactMatch.modelNumber].filter(Boolean).join(" ")}</div>
              <div className="opacity-80">{item.exactMatch.matchReason}</div>
            </div>
          )}
          {item.portReuseCandidates.length > 0 && onCopyPortsFromCandidate && (
            <div className="mt-2 space-y-1">
              <div className="text-[11px] font-medium text-[var(--color-text-heading)]">
                Similar TateSide devices you can copy ports from first
              </div>
              {item.portReuseCandidates.map((candidate) => (
                <div key={candidate.id} className="rounded border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px] text-blue-800">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{candidate.label}</div>
                      <div>{[candidate.manufacturer, candidate.modelNumber].filter(Boolean).join(" ")}</div>
                      <div className="opacity-80">{candidate.matchReason}</div>
                    </div>
                    <button
                      onClick={() => onCopyPortsFromCandidate(candidate)}
                      className="shrink-0 px-2.5 py-1 rounded border border-blue-300 bg-white text-[11px] hover:bg-blue-100 cursor-pointer"
                    >
                      Copy ports
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {onToggleExcluded && (
          <button
            onClick={onToggleExcluded}
            className="shrink-0 w-8 h-8 rounded border border-[var(--color-border)] bg-white text-[14px] leading-none font-semibold hover:bg-[var(--color-surface-hover)] cursor-pointer flex items-center justify-center"
            title={excluded ? "Include this device in research again" : "Exclude this device from research"}
          >
            {excluded ? "↺" : "×"}
          </button>
        )}
      </div>
    </div>
  );
}

function PossibleMatchRow({
  item,
  decision,
  onUseLibraryMatch,
  onResearchMissing,
}: {
  item: QuoteImportResultItem;
  decision?: PossibleMatchDecision;
  onUseLibraryMatch: () => void;
  onResearchMissing: () => void;
}) {
  return (
    <div className="px-3 py-3 border-b text-xs" style={{ borderColor: "var(--color-border)" }}>
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className="font-medium text-[var(--color-text-heading)]">
          {[item.manufacturer, item.model].filter(Boolean).join(" ")}
        </span>
        <span className={`px-2 py-0.5 rounded-full border text-[10px] ${STATUS_CLASSES[item.status]}`}>
          {STATUS_LABELS[item.status]}
        </span>
      </div>
      <div className="text-[11px] text-[var(--color-text-muted)] space-y-0.5">
        {item.description && <div>{item.description}</div>}
        {item.sourceLineText && <div>Quote text: {item.sourceLineText}</div>}
      </div>
      <div className="mt-2 space-y-1">
        {item.possibleMatches.map((match) => (
          <div key={match.id} className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
            <div className="font-medium">{match.label}</div>
            <div>{[match.manufacturer, match.modelNumber].filter(Boolean).join(" ")}</div>
            <div className="opacity-80">{match.matchReason}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={onUseLibraryMatch}
          className={`px-2.5 py-1 rounded text-[11px] border cursor-pointer ${
            decision === "use_library_match"
              ? "border-emerald-300 bg-emerald-100 text-emerald-800"
              : "border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
          }`}
        >
          Use TateSide library match
        </button>
        <button
          onClick={onResearchMissing}
          className={`px-2.5 py-1 rounded text-[11px] border cursor-pointer ${
            decision === "research_missing"
              ? "border-blue-300 bg-blue-100 text-blue-800"
              : "border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
          }`}
        >
          Research as missing device
        </button>
      </div>
    </div>
  );
}

function DraftReviewRow({
  item,
  selected,
  ignored,
  onToggleSelected,
  onToggleIgnored,
  onEdit,
  onRetryStronger,
}: {
  item: QuoteImportDraftReview;
  selected: boolean;
  ignored: boolean;
  onToggleSelected?: () => void;
  onToggleIgnored: () => void;
  onEdit?: () => void;
  onRetryStronger?: () => void;
}) {
  const template = item.template;
  const metadata = item.metadata;
  return (
    <div className={`px-3 py-3 border-b text-xs ${ignored ? "opacity-50" : ""}`} style={{ borderColor: "var(--color-border)" }}>
      <div className="flex flex-wrap items-start gap-3">
        {onToggleSelected ? (
          <input type="checkbox" checked={selected} onChange={onToggleSelected} className="mt-1" />
        ) : (
          <div className="w-4" />
        )}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-[var(--color-text-heading)]">
              {[item.extractedDevice.manufacturer, item.extractedDevice.model].filter(Boolean).join(" ")}
            </span>
            <span className={`px-2 py-0.5 rounded-full border text-[10px] ${
              item.reviewStatus === "draft_ready"
                ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                : "border-red-200 bg-red-100 text-red-800"
            }`}>
              {item.reviewStatus === "draft_ready" ? "Draft ready" : "Manual review"}
            </span>
            {metadata && (
              <span className="px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 text-[10px]">
                {metadata.modelUsed}
              </span>
            )}
            {item.draftSource === "library_port_copy" && (
              <span className="px-2 py-0.5 rounded-full border border-violet-200 bg-violet-50 text-violet-700 text-[10px]">
                Copied from library ports
              </span>
            )}
          </div>

          {template ? (
            <div className="text-[11px] text-[var(--color-text-muted)] space-y-0.5">
              <div>{template.label}</div>
              <div>{template.deviceType} · {template.category} · {template.ports.length} ports</div>
              {item.portSummary.length > 0 && <div>Ports: {item.portSummary.join("; ")}</div>}
            </div>
          ) : (
            <div className="text-[11px] text-[var(--color-text-muted)]">
              No valid template draft is available yet.
            </div>
          )}

          {metadata && (
            <div className="text-[11px] text-[var(--color-text-muted)] space-y-0.5">
              <div>Confidence: <strong>{metadata.confidence}</strong></div>
              <div>Official source found: <strong>{metadata.officialSourceFound ? "Yes" : "No"}</strong></div>
              <div>Escalation: <strong>{metadata.escalationOccurred ? `Yes${metadata.escalationReason ? ` - ${metadata.escalationReason}` : ""}` : "No"}</strong></div>
            </div>
          )}

          {metadata?.sourceReferences && metadata.sourceReferences.length > 0 && (
            <div className="space-y-1">
              {metadata.sourceReferences.map((source, index) => (
                <a
                  key={`${source.url}-${index}`}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-[11px] text-blue-600 hover:underline"
                >
                  {source.title}
                </a>
              ))}
            </div>
          )}

          {(item.validation.errors.length > 0 || item.validation.warnings.length > 0 || metadata?.warnings?.length || item.error) && (
            <div className="space-y-1">
              {item.error && <div className="text-[11px] text-red-700">{item.error}</div>}
              {item.validation.errors.map((entry, index) => <div key={`error-${index}`} className="text-[11px] text-red-700">{entry}</div>)}
              {item.validation.warnings.map((entry, index) => <div key={`warning-${index}`} className="text-[11px] text-amber-700">{entry}</div>)}
              {(metadata?.warnings ?? []).map((entry, index) => <div key={`meta-warning-${index}`} className="text-[11px] text-amber-700">{entry}</div>)}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {onEdit && template && (
              <button
                onClick={onEdit}
                className="px-2.5 py-1 rounded border border-[var(--color-border)] bg-white text-[11px] hover:bg-[var(--color-surface-hover)] cursor-pointer"
              >
                Edit Draft
              </button>
            )}
            {onRetryStronger && (
              <button
                onClick={onRetryStronger}
                className="px-2.5 py-1 rounded border border-[var(--color-border)] bg-white text-[11px] hover:bg-[var(--color-surface-hover)] cursor-pointer"
              >
                Retry With Stronger Model
              </button>
            )}
            <button
              onClick={onToggleIgnored}
              className="px-2.5 py-1 rounded border border-[var(--color-border)] bg-white text-[11px] hover:bg-[var(--color-surface-hover)] cursor-pointer"
            >
              {ignored ? "Restore" : "Ignore"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-3 py-4 text-xs text-[var(--color-text-muted)]">{text}</div>;
}
