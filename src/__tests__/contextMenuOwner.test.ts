/**
 * Only one context menu at a time (#411).
 *
 * Right-clicking a device opened its menu; right-clicking one of its ports then opened
 * the port menu on top, because the port's opener stops propagation and each menu's
 * only dismissal was a bubble-phase document listener. claimContextMenu is the shared
 * owner every menu now goes through, and attachContextMenuDismiss listens in the
 * capture phase so an opener that stops propagation can't slip past it.
 */
import { describe, it, expect, vi } from "vitest";
import { attachContextMenuDismiss, claimContextMenu, CONTEXT_MENU_ATTR } from "../contextMenuOwner";

describe("claimContextMenu", () => {
  it("closes the menu that held the slot when another opens", () => {
    const closeDevice = vi.fn();
    const closePort = vi.fn();
    const releaseDevice = claimContextMenu(closeDevice);
    const releasePort = claimContextMenu(closePort);
    expect(closeDevice).toHaveBeenCalledTimes(1);
    expect(closePort).not.toHaveBeenCalled();
    // The displaced menu unmounting must not free the slot the port menu now holds.
    releaseDevice();
    const closeRoom = vi.fn();
    const releaseRoom = claimContextMenu(closeRoom);
    expect(closePort).toHaveBeenCalledTimes(1);
    releasePort();
    releaseRoom();
  });

  it("a released slot closes nothing on the next open", () => {
    const first = vi.fn();
    claimContextMenu(first)();
    const release = claimContextMenu(vi.fn());
    expect(first).not.toHaveBeenCalled();
    release();
  });
});

/** A document stand-in whose event target answers `closest` the way an element inside
 *  (or outside) a menu would. */
class FakeDocument extends EventTarget {
  insideMenu = false;
  closest(selector: string) {
    expect(selector).toBe(`[${CONTEXT_MENU_ATTR}]`);
    return this.insideMenu ? {} : null;
  }
}

function key(k: string): Event {
  const e = new Event("keydown");
  (e as unknown as { key: string }).key = k;
  return e;
}

describe("attachContextMenuDismiss", () => {
  it("closes on a press outside every menu, but not inside one", () => {
    const doc = new FakeDocument();
    const close = vi.fn();
    const detach = attachContextMenuDismiss(doc, close);
    doc.insideMenu = true;
    doc.dispatchEvent(new Event("pointerdown"));
    expect(close).not.toHaveBeenCalled();
    doc.insideMenu = false;
    doc.dispatchEvent(new Event("pointerdown"));
    expect(close).toHaveBeenCalledTimes(1);
    detach();
  });

  it("closes on a right-click anywhere outside the menu (the port-over-device case)", () => {
    const doc = new FakeDocument();
    const close = vi.fn();
    const detach = attachContextMenuDismiss(doc, close);
    doc.dispatchEvent(new Event("contextmenu"));
    expect(close).toHaveBeenCalledTimes(1);
    detach();
  });

  it("closes on Escape only", () => {
    const doc = new FakeDocument();
    const close = vi.fn();
    const detach = attachContextMenuDismiss(doc, close);
    doc.dispatchEvent(key("Enter"));
    expect(close).not.toHaveBeenCalled();
    doc.dispatchEvent(key("Escape"));
    expect(close).toHaveBeenCalledTimes(1);
    detach();
  });

  it("stops listening once detached", () => {
    const doc = new FakeDocument();
    const close = vi.fn();
    attachContextMenuDismiss(doc, close)();
    doc.dispatchEvent(new Event("pointerdown"));
    doc.dispatchEvent(new Event("contextmenu"));
    doc.dispatchEvent(key("Escape"));
    expect(close).not.toHaveBeenCalled();
  });
});
