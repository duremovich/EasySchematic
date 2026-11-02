/**
 * The "+ New signal / connector / device type…" entry points (custom-types P5). Any picker
 * adds the option last; choosing it asks the one dialog host (`CustomTypeDialogHost`) to
 * open, and the host calls back with the new type's id so the picker can select it.
 * Preferences ▸ Custom types opens the same dialog to edit a type.
 */
import { useSyncExternalStore } from "react";
import type { CustomTypeKind } from "./customTypes/model";
import type { UserTypeDef } from "./userTypes";

/** The `<option>` value of the entry point; never a type id (ids can't start with "_"). */
export const NEW_TYPE_VALUE = "__new-type__";

export const NEW_TYPE_OPTION_LABEL: Record<CustomTypeKind, string> = {
  signal: "+ New signal type…",
  connector: "+ New connector type…",
  device: "+ New device type…",
};

export interface TypeDialogRequest {
  kind: CustomTypeKind;
  /** Edit this user type instead of creating one. */
  editing?: UserTypeDef;
  /** Prefill for the label (e.g. what the user had typed). */
  initialLabel?: string;
  /** Called with the created (or picked existing) type's id. */
  onDone?: (id: string) => void;
}

let current: TypeDialogRequest | null = null;
const listeners = new Set<() => void>();

function emit(next: TypeDialogRequest | null) {
  current = next;
  for (const fn of listeners) fn();
}

export function openTypeDialog(request: TypeDialogRequest): void {
  emit(request);
}

export function closeTypeDialog(): void {
  emit(null);
}

/** Shorthand for a picker: open the create dialog, then hand the new id to `onCreated`. */
export function requestNewType(kind: CustomTypeKind, onCreated: (id: string) => void): void {
  emit({ kind, onDone: onCreated });
}

export function useTypeDialogRequest(): TypeDialogRequest | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}
