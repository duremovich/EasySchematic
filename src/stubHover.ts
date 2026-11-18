import { create } from "zustand";

/**
 * Which stubbed connection the pointer is over (#405).
 *
 * A stubbed connection is drawn as two short legs and two tags. Hovering an ordinary
 * cable lights its whole length, so you know you're on it before you click or
 * right-click. Over a stub, only the 64-px leg under the pointer lit up, and the tags
 * (the part of a stub you actually see) lit nothing. Every leg and tag of the pointed-at
 * stub reads this one id, so hovering any of them lights all of them.
 *
 * Kept out of the schematic store on purpose: it changes on every pointer crossing, and
 * only the legs and tags need to re-render when it does.
 */
interface StubHoverState {
  /** linkedConnectionId of the hovered stubbed connection, or null. */
  linkId: string | null;
  /** The leg or tag the pointer is actually on ("edge:<id>" / "tag:<id>"). */
  owner: string | null;
}

export const useStubHover = create<StubHoverState>(() => ({ linkId: null, owner: null }));

/** The pointer entered `owner`, a leg or tag of the stubbed connection `linkId`. An
 *  ordinary cable has no link and leaves the hover alone. */
export function enterStubLink(linkId: string | null | undefined, owner: string): void {
  if (!linkId) return;
  useStubHover.setState({ linkId, owner });
}

/** The pointer left `owner`, or `owner` unmounted while hovered (deleted under the
 *  pointer, so no mouseleave ever comes). Only the current owner clears the hover — a
 *  late leave from the leg or tag the pointer just came from must not clear the one it
 *  has already entered. */
export function leaveStubLink(owner: string): void {
  if (useStubHover.getState().owner === owner) useStubHover.setState({ linkId: null, owner: null });
}
