import { describe, it, expect } from "vitest";
import { buildStubLabelText, type StubLabelParts } from "../stubLabelText";
import { DEFAULT_STUB_LABEL_SHOW_PORT } from "../types";

const parts = (over: Partial<StubLabelParts> = {}): StubLabelParts => ({
  arrow: "→",
  farLabel: "Projector",
  farPort: "HDMI In 1",
  farRoom: "Main Hall",
  myPage: "1",
  farPage: "3",
  ...over,
});

describe("buildStubLabelText", () => {
  it("shows the far-end port in brackets after the device when showPort is on (#200)", () => {
    const t = buildStubLabelText(parts(), {
      showPort: true,
      showRoom: false,
      pageMode: "never",
    });
    expect(t).toBe("→ Projector [HDMI In 1]");
  });

  it("omits the port when showPort is off", () => {
    const t = buildStubLabelText(parts(), {
      showPort: false,
      showRoom: false,
      pageMode: "never",
    });
    expect(t).toBe("→ Projector");
  });

  it("defaults to showing the far-end port (both ends name the opposite port)", () => {
    // The far port is what makes BOTH stubs name the opposite device's port.
    const t = buildStubLabelText(parts({ farRoom: "" }), {
      showPort: DEFAULT_STUB_LABEL_SHOW_PORT,
      showRoom: true,
      pageMode: "never",
    });
    expect(DEFAULT_STUB_LABEL_SHOW_PORT).toBe(true);
    expect(t).toBe("→ Projector [HDMI In 1]");
  });

  it("combines port, room, and page in order", () => {
    const t = buildStubLabelText(parts(), {
      showPort: true,
      showRoom: true,
      pageMode: "always",
    });
    expect(t).toBe("→ Projector [HDMI In 1] (Main Hall) Pg 3");
  });

  it("suppresses the page tag in cross-page mode when both ends share a page", () => {
    const t = buildStubLabelText(parts({ myPage: "2", farPage: "2" }), {
      showPort: true,
      showRoom: false,
      pageMode: "cross-page",
    });
    expect(t).toBe("→ Projector [HDMI In 1]");
  });

  it("shows the page tag in cross-page mode when the ends differ", () => {
    const t = buildStubLabelText(parts({ myPage: "1", farPage: "3", farRoom: "" }), {
      showPort: false,
      showRoom: false,
      pageMode: "cross-page",
    });
    expect(t).toBe("→ Projector Pg 3");
  });

  it("skips an empty far port even when showPort is on", () => {
    const t = buildStubLabelText(parts({ farPort: "" }), {
      showPort: true,
      showRoom: false,
      pageMode: "never",
    });
    expect(t).toBe("→ Projector");
  });
});
