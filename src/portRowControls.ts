/**
 * Which secondary per-port controls the device editor's port row offers, and in
 * what order they sit on the row's second line (#303). The primary row keeps the
 * port name, signal, connector and gender; everything here moved below it so the
 * name input stops being squeezed by badges that accumulated to its right.
 * Kept pure so the ordering and gating rules are unit-testable.
 */

export type PortRowControlId =
  | "trunk"
  | "channel-count"
  | "multi-connect"
  | "direct-attach"
  | "section"
  | "exclusive-group"
  | "notes"
  | "flip";

export interface PortRowControlState {
  /**
   * Device type of the port's owner — only adapters offer direct attach. Free
   * text, not a union: the editor's device type field accepts anything the user
   * types, so an unrecognised value simply offers no adapter-only controls.
   */
  deviceType: string;
  /** True when the port is flagged as a multicable trunk. */
  isMulticable: boolean;
}

export function visiblePortRowControls(state: PortRowControlState): PortRowControlId[] {
  const controls: PortRowControlId[] = ["trunk"];
  // Channel count is meaningless until the port is a trunk, so it rides along
  // with the trunk toggle rather than holding a permanent slot.
  if (state.isMulticable) controls.push("channel-count");
  controls.push("multi-connect");
  if (state.deviceType === "adapter") controls.push("direct-attach");
  controls.push("section", "exclusive-group", "notes", "flip");
  return controls;
}

export const PORT_ROW_CONTROL_TITLES: Record<PortRowControlId, string> = {
  trunk: "Multicable trunk port",
  "channel-count": "Channel count",
  "multi-connect":
    "Multi-connect — allow multiple connections on this port (1:many), e.g. one Dante flow feeding many destinations",
  "direct-attach": "Direct attach — plugs directly into device, no separate cable",
  section: "Set section group",
  "exclusive-group":
    "Exclusive group — ports on this device sharing a group are one signal path (e.g. a front input that overrides the rear one); connecting more than one warns",
  notes: "Add note",
  flip: "Flip port to opposite side",
};
