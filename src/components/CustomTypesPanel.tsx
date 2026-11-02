import { useState } from "react";
import { useSchematicStore } from "../store";
import { useTypeRegistryVersion } from "../hooks/useTypeRegistryVersion";
import { connectorLabel, signalGroup, typeLayer } from "../typeRegistry";
import { collectTypeIds, connectorReferencedBy, countTypeUses } from "../documentTypes";
import { deleteUserType, importUserTypes, userTypeLibrary, type UserTypeDef } from "../userTypes";
import { openTypeDialog } from "../newTypeRequest";
import type { CustomTypeKind, SignalTypeDef, ConnectorTypeDef, DeviceTypeDef } from "../customTypes/model";

/**
 * Preferences ▸ Custom types (custom-types P5): the user's own signal, connector and device
 * types — edit, or delete once nothing uses them — and the types the open drawing carries
 * that the library doesn't have (or has differently), with "Add to my library".
 */

const KINDS: { kind: CustomTypeKind; key: "signals" | "connectors" | "deviceTypes"; title: string; noun: string }[] = [
  { kind: "signal", key: "signals", title: "Signals", noun: "signal" },
  { kind: "connector", key: "connectors", title: "Connectors", noun: "connector" },
  { kind: "device", key: "deviceTypes", title: "Device types", noun: "device type" },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Key-order-insensitive equality of two definitions. */
function sameDef(a: object, b: object): boolean {
  const canon = (o: object) => JSON.stringify(o, Object.keys(o).sort());
  return canon(a) === canon(b);
}

function describe(kind: CustomTypeKind, def: UserTypeDef): string {
  if (kind === "signal") return `${(def as SignalTypeDef).group} · ${(def as SignalTypeDef).cablePrefix}`;
  if (kind === "connector") {
    const c = def as ConnectorTypeDef;
    const mates = [...c.matesWith.map(connectorLabel), ...c.adaptsTo.map((id) => `${connectorLabel(id)} (adapter)`)];
    return `${c.group}${mates.length ? ` · mates with ${mates.join(", ")}` : ""}`;
  }
  return (def as DeviceTypeDef).category;
}

function Swatch({ kind, def }: { kind: CustomTypeKind; def: UserTypeDef }) {
  if (kind !== "signal") return <span className="w-2.5 h-2.5 shrink-0" />;
  return <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: (def as SignalTypeDef).color }} />;
}

export default function CustomTypesPanel() {
  useTypeRegistryVersion();
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const pages = useSchematicStore((s) => s.pages);
  const customTemplates = useSchematicStore((s) => s.customTemplates);
  const documentTypes = useSchematicStore((s) => s.documentTypes);
  const [refused, setRefused] = useState<{ id: string; why: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const library = userTypeLibrary();
  const usedHere = collectTypeIds(nodes, edges, pages);
  const community = typeLayer("community");
  const total = library.signals.length + library.connectors.length + library.deviceTypes.length;

  const tryDelete = (kind: CustomTypeKind, def: UserTypeDef) => {
    const inDrawing = countTypeUses(kind, def.id, nodes, edges, pages);
    const inLibrary = countTypeUses(kind, def.id, customTemplates);
    const byTypes = kind === "connector" ? connectorReferencedBy(def.id, library) : [];
    const reasons = [
      inDrawing ? `${plural(inDrawing, "use")} in this drawing` : "",
      inLibrary ? `${plural(inLibrary, "use")} in your device library` : "",
      byTypes.length ? `named by ${byTypes.join(", ")}` : "",
    ].filter(Boolean);
    if (reasons.length) {
      setConfirming(null);
      setRefused({ id: def.id, why: `Can't delete "${def.label}": ${reasons.join("; ")}. Change those first.` });
      return;
    }
    if (confirming !== def.id) {
      setRefused(null);
      setConfirming(def.id);
      return;
    }
    deleteUserType(kind, def.id);
    setConfirming(null);
  };

  // Types the open drawing uses and carries that the library lacks, or has differently.
  const carried = KINDS.flatMap(({ kind, key }) =>
    ((documentTypes[key] ?? []) as UserTypeDef[])
      .filter((d) => usedHere[key].has(d.id) && !(community[key] ?? []).some((c) => c.id === d.id))
      .map((def) => {
        const mine = (library[key] as UserTypeDef[]).find((d) => d.id === def.id);
        return { kind, key, def, differs: !!mine && !sameDef(mine, def), missing: !mine };
      })
      .filter((r) => r.missing || r.differs),
  );

  return (
    <div className="space-y-4" data-testid="custom-types-panel">
      <p className="text-[10px] text-[var(--color-text-muted)]">
        Signals, connectors and device types you made with "+ New … type" in a picker. They live in this browser
        and travel inside every file that uses them, so a file opens correctly anywhere.
      </p>

      {total === 0 && (
        <p className="text-xs text-[var(--color-text-muted)]">
          No custom types yet. Pick "+ New signal type…" (or connector, or device type) at the bottom of any type picker in the device editor.
        </p>
      )}

      {KINDS.map(({ kind, key, title }) => {
        const defs = library[key] as UserTypeDef[];
        if (!defs.length) return null;
        return (
          <div key={kind}>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">{title}</div>
            <ul className="space-y-1">
              {defs.map((def) => {
                const uses = countTypeUses(kind, def.id, nodes, edges, pages);
                return (
                  <li key={def.id} className="py-1" data-testid={`custom-type-row-${def.label}`}>
                    <div className="flex items-center gap-2">
                      <Swatch kind={kind} def={def} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-[var(--color-text-heading)] truncate">{def.label}</div>
                        <div className="text-[10px] text-[var(--color-text-muted)] truncate">
                          {describe(kind, def)}{uses ? ` · ${plural(uses, "use")} here` : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => { setRefused(null); setConfirming(null); openTypeDialog({ kind, editing: def }); }}
                        className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => tryDelete(kind, def)}
                        className={`text-[10px] cursor-pointer ${confirming === def.id ? "text-white bg-red-600 rounded px-1.5 py-0.5" : "text-red-600 hover:underline"}`}
                        data-testid={`custom-type-delete-${def.label}`}
                      >
                        {confirming === def.id ? "Confirm delete" : "Delete"}
                      </button>
                    </div>
                    {refused?.id === def.id && (
                      <p className="text-[10px] text-red-600 mt-0.5 pl-4" data-testid="custom-type-delete-refused">{refused.why}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {carried.length > 0 && (
        <div data-testid="custom-types-carried">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">In this drawing</div>
          <p className="text-[10px] text-[var(--color-text-muted)] mb-1">
            Types this file brought with it. They work in this drawing either way; add them to use them in others.
          </p>
          <ul className="space-y-1">
            {carried.map(({ kind, def, differs }) => (
              <li key={`${kind}:${def.id}`} className="flex items-center gap-2 py-1">
                <Swatch kind={kind} def={def} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-[var(--color-text-heading)] truncate">{def.label}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)] truncate">
                    {kind === "signal" ? signalGroup(def.id) : describe(kind, def)}
                    {differs ? " · differs from your library's copy" : ""}
                  </div>
                </div>
                <button
                  onClick={() => importUserTypes({ [KINDS.find((k) => k.kind === kind)!.key]: [def] }, differs)}
                  className="text-[10px] text-blue-600 hover:underline cursor-pointer shrink-0"
                >
                  {differs ? "Use this version in my library" : "Add to my library"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
