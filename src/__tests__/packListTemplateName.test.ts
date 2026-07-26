import { describe, it, expect } from "vitest";
import { computePackList } from "../packList";
import { templateIdentityPatch } from "../inventoryKey";
import type { SchematicNode, DeviceData, DeviceTemplate } from "../types";

/** A device placed from a library template, then renamed by the user.
 *  `model` holds the original library identity (what the pack list groups on). */
const placedDevice = (data: Partial<DeviceData>): SchematicNode =>
  ({
    id: "dev-1",
    type: "device",
    position: { x: 0, y: 0 },
    data: {
      label: "Sony HDC-5500",
      baseLabel: "Sony HDC-5500",
      model: "Sony HDC-5500",
      deviceType: "camera",
      templateId: "sony-hdc-5500",
      templateVersion: 3,
      ports: [],
      ...data,
    },
  } as unknown as SchematicNode);

describe("pack list reflects user-template rename (#137)", () => {
  it("shows the original library name before saving as a template", () => {
    const nodes = [placedDevice({})];
    const { devices } = computePackList(nodes, []);
    expect(devices).toHaveLength(1);
    expect(devices[0].model).toBe("Sony HDC-5500");
  });

  it("shows the new template name after re-identifying the device via save-as-template", () => {
    const node = placedDevice({});

    // Mirrors DeviceEditor.handleSaveAsTemplate: a new user template is created
    // from the modified device and the on-canvas device is re-stamped as an
    // instance of it.
    const newTemplate: DeviceTemplate = {
      id: "custom-123",
      deviceType: "camera",
      label: "Sony HDC-5500 (Modified)",
      ports: [],
    };
    const patched: SchematicNode = {
      ...node,
      data: { ...(node.data as DeviceData), ...templateIdentityPatch(newTemplate) },
    } as SchematicNode;

    const { devices } = computePackList([patched], []);
    expect(devices).toHaveLength(1);
    expect(devices[0].model).toBe("Sony HDC-5500 (Modified)");
    // The stale original name must be gone from the report.
    expect(devices.some((d) => d.model === "Sony HDC-5500")).toBe(false);
  });

  it("clears the stale library template version and links the new template", () => {
    const patch = templateIdentityPatch({
      id: "custom-123",
      label: "Sony HDC-5500 (Modified)",
    });
    expect(patch.model).toBe("Sony HDC-5500 (Modified)");
    expect(patch.baseLabel).toBe("Sony HDC-5500 (Modified)");
    expect(patch.label).toBe("Sony HDC-5500 (Modified)");
    expect(patch.templateId).toBe("custom-123");
    // A freshly-created user template carries no version, so drift tracking resets.
    expect(patch.templateVersion).toBeUndefined();
  });
});
