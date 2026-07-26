// Pure assembly of a stub-label's display text. Extracted from StubLabelNode.tsx so the
// content rules (which of device / far-end port / room / page appear, and in what format)
// are unit-testable without a DOM or the React Flow runtime.

import type { StubLabelPageMode } from "./types";

export interface StubLabelParts {
  /** Direction arrow toward the far end, e.g. "→". */
  arrow: string;
  /** Far-end device label. */
  farLabel: string;
  /** Far-end port label (the port at the OTHER end of the stubbed connection). */
  farPort: string;
  /** Far-end room label. */
  farRoom: string;
  /** Printed page this stub sits on ("" when not in print view / single page). */
  myPage: string;
  /** Printed page the far end sits on. */
  farPage: string;
}

export interface StubLabelOptions {
  showPort: boolean;
  showRoom: boolean;
  pageMode: StubLabelPageMode;
}

/**
 * Build the stub-label text: "{arrow} {farLabel}" plus, when enabled and available,
 * the far-end port in brackets, the far-end room in parens, and a page tag. The port
 * is the far end's port so BOTH stubs of a connection name the opposite device's port
 * (issue #200), not the near/local one.
 */
export function buildStubLabelText(parts: StubLabelParts, opts: StubLabelOptions): string {
  const { arrow, farLabel, farPort, farRoom, myPage, farPage } = parts;
  let t = `${arrow} ${farLabel}`;
  if (opts.showPort && farPort) t += ` [${farPort}]`;
  if (opts.showRoom && farRoom) t += ` (${farRoom})`;
  const showPage =
    !!farPage &&
    (opts.pageMode === "always" || (opts.pageMode === "cross-page" && farPage !== myPage));
  if (showPage) t += ` Pg ${farPage}`;
  return t;
}
