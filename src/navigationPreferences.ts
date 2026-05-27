import type { ScrollConfig } from "./types";

export type NavigationInputDevice = "auto" | "mouse" | "trackpad";
export type WheelNavigationAction = ScrollConfig["scroll"] | "pinch-zoom" | "pan-free";

const INPUT_DEVICE_STORAGE_KEY = "easyschematic-navigation-input-device";

export const DEFAULT_NAVIGATION_INPUT_DEVICE: NavigationInputDevice = "auto";

export function getNavigationInputDevice(): NavigationInputDevice {
  try {
    const stored = localStorage.getItem(INPUT_DEVICE_STORAGE_KEY);
    return stored === "trackpad" || stored === "mouse" ? stored : DEFAULT_NAVIGATION_INPUT_DEVICE;
  } catch {
    return DEFAULT_NAVIGATION_INPUT_DEVICE;
  }
}

export function saveNavigationInputDevice(device: NavigationInputDevice): void {
  try {
    if (device === DEFAULT_NAVIGATION_INPUT_DEVICE) {
      localStorage.removeItem(INPUT_DEVICE_STORAGE_KEY);
    } else {
      localStorage.setItem(INPUT_DEVICE_STORAGE_KEY, device);
    }
  } catch {
    // Storage may be unavailable; navigation still works for this session.
  }
}

export function getWheelNavigationAction(
  device: NavigationInputDevice,
  event: Pick<WheelEvent, "ctrlKey" | "shiftKey">,
  ctrlHeld: boolean,
  config: Pick<ScrollConfig, "scroll" | "shiftScroll" | "ctrlScroll">,
  autoTrackpadActive = false,
): WheelNavigationAction {
  // Browsers report trackpad pinch as Ctrl+wheel without a physical Ctrl keydown.
  if (device !== "mouse" && event.ctrlKey && !ctrlHeld) return "pinch-zoom";
  if (
    !event.ctrlKey
    && !event.shiftKey
    && (device === "trackpad" || (device === "auto" && autoTrackpadActive))
  ) {
    return "pan-free";
  }
  return event.ctrlKey ? config.ctrlScroll : event.shiftKey ? config.shiftScroll : config.scroll;
}
