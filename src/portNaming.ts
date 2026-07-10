import type { PortDirection } from "./types";

const BASE_FOR_DIRECTION: Partial<Record<PortDirection, string>> = {
  input: "Input",
  output: "Output",
  bidirectional: "Bidir",
  passthrough: "Passthrough",
};

/**
 * Fill in a name for any port left blank in the device editor. Unnamed ports used
 * to be silently dropped on save (confusing — a row you added just vanished);
 * instead we auto-name them "<Direction> N", numbered per direction and
 * de-duplicated against names already in use, so nothing disappears. Already-named
 * ports are returned with their label trimmed and otherwise untouched.
 */
export function autoNamePorts<T extends { label: string; direction: PortDirection }>(
  ports: T[],
): T[] {
  const used = new Set(ports.map((p) => p.label.trim()).filter(Boolean));
  const counters: Partial<Record<PortDirection, number>> = {};
  return ports.map((p) => {
    const trimmed = p.label.trim();
    if (trimmed) return { ...p, label: trimmed };

    const base = BASE_FOR_DIRECTION[p.direction] ?? "Port";
    let n = (counters[p.direction] ?? 0) + 1;
    let name = `${base} ${n}`;
    while (used.has(name)) {
      n++;
      name = `${base} ${n}`;
    }
    counters[p.direction] = n;
    used.add(name);
    return { ...p, label: name };
  });
}

/**
 * Pick a name for a port duplicated from `label`, uniquified against the labels
 * already in use. If the source name carries a trailing number (e.g. "Input 1",
 * "Camera3"), we bump it to the next free number ("Input 2") so a duplicated row
 * slots into the existing sequence rather than colliding. A name already ending in
 * "(copy)"/"(copy N)" bumps its copy counter; anything else gains a "(copy)" suffix
 * — matching the "(copy)" convention used elsewhere (duplicated pages). A blank
 * source label stays blank so it is auto-named on save like any other blank row.
 */
export function duplicatePortLabel(label: string, existingLabels: Iterable<string>): string {
  const used = new Set<string>();
  for (const l of existingLabels) {
    const t = l.trim();
    if (t) used.add(t);
  }

  const trimmed = label.trim();
  if (!trimmed) return "";

  // Trailing number → advance to the next free number in the sequence.
  const numMatch = trimmed.match(/^(.*?)(\d+)$/);
  if (numMatch) {
    const prefix = numMatch[1];
    let n = parseInt(numMatch[2], 10) + 1;
    let candidate = `${prefix}${n}`;
    while (used.has(candidate)) {
      n++;
      candidate = `${prefix}${n}`;
    }
    return candidate;
  }

  // Already a "(copy)" / "(copy N)" name → bump the copy counter.
  const copyMatch = trimmed.match(/^(.*?)\(copy(?:\s+(\d+))?\)$/i);
  if (copyMatch) {
    const prefix = copyMatch[1];
    let n = (copyMatch[2] ? parseInt(copyMatch[2], 10) : 1) + 1;
    let candidate = `${prefix}(copy ${n})`;
    while (used.has(candidate)) {
      n++;
      candidate = `${prefix}(copy ${n})`;
    }
    return candidate;
  }

  // Plain name → append "(copy)", uniquifying with "(copy 2)", "(copy 3)", …
  let candidate = `${trimmed} (copy)`;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${trimmed} (copy ${n})`;
    n++;
  }
  return candidate;
}
