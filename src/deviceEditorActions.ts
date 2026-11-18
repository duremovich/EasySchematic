/**
 * Which save/revert actions the device editor footer offers for a given device
 * state. The first action is always the split button's primary; the rest go in
 * its dropdown menu. Kept pure so the visibility rules are unit-testable.
 */

import type { Port } from "./types";
import { normalizeExclusiveGroup } from "./exclusivePorts";

/** The port fields the editor's dirty check compares against a template or preset. */
export type ComparedPortFields = Pick<Port, "label" | "signalType" | "direction" | "connectorType" | "section" | "exclusiveGroup">;

/**
 * True when the editor's port rows still match a template's / preset's ports — the basis of
 * `dirtyVsTemplate` / `dirtyVsPreset`. An exclusive-group-only edit counts as a change, so
 * it offers Submit to Community and Revert like any other port edit (#414).
 */
export function editorPortsMatch(a: readonly ComparedPortFields[], b: readonly ComparedPortFields[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((ap, i) => {
    const bp = b[i];
    return ap.label === bp.label &&
      ap.signalType === bp.signalType &&
      ap.direction === bp.direction &&
      (ap.connectorType ?? undefined) === (bp.connectorType ?? undefined) &&
      (ap.section ?? undefined) === (bp.section ?? undefined) &&
      normalizeExclusiveGroup(ap.exclusiveGroup) === normalizeExclusiveGroup(bp.exclusiveGroup);
  });
}

export type SaveActionId =
  | "save-user-template"
  | "submit-community"
  | "update-user-template"
  | "update-as-custom"
  | "save-preset"
  | "revert-preset"
  | "revert-template";

export interface SaveActionState {
  /** Template the device was placed from, if any. */
  templateId: string | undefined;
  /** True when templateId refers to one of the user's own templates. */
  isUserTemplate: boolean;
  /** True when at least one port has a non-blank label. */
  hasLabeledPort: boolean;
  /** True when a project preset exists for this template. */
  hasPreset: boolean;
  /** True when the editor state differs from the project preset. */
  dirtyVsPreset: boolean;
  /** True when the editor state differs from the source template. */
  dirtyVsTemplate: boolean;
}

export function visibleSaveActions(state: SaveActionState): SaveActionId[] {
  const actions: SaveActionId[] = ["save-user-template"];
  if ((!state.templateId || state.dirtyVsTemplate || state.isUserTemplate) && state.hasLabeledPort) {
    actions.push("submit-community");
  }
  if (state.templateId && state.isUserTemplate) {
    actions.push("update-user-template");
  } else if (state.templateId) {
    actions.push("update-as-custom", "save-preset");
  }
  if (state.hasPreset && state.dirtyVsPreset) actions.push("revert-preset");
  if (state.dirtyVsTemplate) actions.push("revert-template");
  return actions;
}

export const SAVE_ACTION_LABELS: Record<SaveActionId, string> = {
  "save-user-template": "Save as User Template",
  "submit-community": "Submit to Community",
  "update-user-template": "Update User Template",
  "update-as-custom": "Update as Custom",
  "save-preset": "Save as Preset",
  "revert-preset": "Revert to Preset",
  "revert-template": "Revert to Template",
};

export const SAVE_ACTION_TITLES: Record<SaveActionId, string> = {
  "save-user-template": "Save this device configuration as a reusable user template",
  "submit-community": "Submit this device to the community device library",
  "update-user-template": "Overwrite the saved user template with this configuration and apply it to every instance on the schematic",
  "update-as-custom": "Save these changes as a new '(Custom)' user template and apply them to every instance of this device on the schematic",
  "save-preset": "Set this configuration as the project default for this template",
  "revert-preset": "Reset ports and visibility to the project preset",
  "revert-template": "Reset ports and visibility to the original template defaults",
};
