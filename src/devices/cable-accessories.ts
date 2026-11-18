import { ports, trunkPort } from "./_helpers";
import type { DeviceTemplate } from "../types";

export const templates: DeviceTemplate[] = [
  // Cable Accessories — Break-in / Break-out
  {
    id: "c0a80101-00e0-4000-8000-000000000300",
    deviceType: "cable-accessory",
    label: "Audio Snake (4-ch) Break-in",
    searchTerms: ["snake", "breakin", "break-in", "multicable", "audio", "xlr", "fanout", "4ch"],
    ports: [
      ...ports("Ch", "analog-audio", "input", 4, "xlr-3"),
      trunkPort("Trunk Out", "analog-audio", "output", 4, "none"),
    ],
  },
  {
    id: "c0a80101-00e1-4000-8000-000000000301",
    deviceType: "cable-accessory",
    label: "Audio Snake (4-ch) Break-out",
    searchTerms: ["snake", "breakout", "break-out", "multicable", "audio", "xlr", "fanout", "4ch"],
    ports: [
      trunkPort("Trunk In", "analog-audio", "input", 4, "none"),
      ...ports("Ch", "analog-audio", "output", 4, "xlr-3"),
    ],
  },
  {
    id: "c0a80101-00e0-4000-8000-000000000310",
    deviceType: "cable-accessory",
    label: "Audio Snake (8-ch) Break-in",
    searchTerms: ["snake", "breakin", "break-in", "multicable", "audio", "xlr", "fanout", "8ch"],
    ports: [
      ...ports("Ch", "analog-audio", "input", 8, "xlr-3"),
      trunkPort("Trunk Out", "analog-audio", "output", 8, "none"),
    ],
  },
  {
    id: "c0a80101-00e1-4000-8000-000000000311",
    deviceType: "cable-accessory",
    label: "Audio Snake (8-ch) Break-out",
    searchTerms: ["snake", "breakout", "break-out", "multicable", "audio", "xlr", "fanout", "8ch"],
    ports: [
      trunkPort("Trunk In", "analog-audio", "input", 8, "none"),
      ...ports("Ch", "analog-audio", "output", 8, "xlr-3"),
    ],
  },
  {
    id: "c0a80101-00e0-4000-8000-000000000320",
    deviceType: "cable-accessory",
    label: "Audio Snake (16-ch) Break-in",
    searchTerms: ["snake", "breakin", "break-in", "multicable", "audio", "xlr", "fanout", "16ch"],
    ports: [
      ...ports("Ch", "analog-audio", "input", 16, "xlr-3"),
      trunkPort("Trunk Out", "analog-audio", "output", 16, "none"),
    ],
  },
  {
    id: "c0a80101-00e1-4000-8000-000000000321",
    deviceType: "cable-accessory",
    label: "Audio Snake (16-ch) Break-out",
    searchTerms: ["snake", "breakout", "break-out", "multicable", "audio", "xlr", "fanout", "16ch"],
    ports: [
      trunkPort("Trunk In", "analog-audio", "input", 16, "none"),
      ...ports("Ch", "analog-audio", "output", 16, "xlr-3"),
    ],
  },
  {
    id: "c0a80101-00e0-4000-8000-000000000330",
    deviceType: "cable-accessory",
    label: "Audio Snake (24-ch) Break-in",
    searchTerms: ["snake", "breakin", "break-in", "multicable", "audio", "xlr", "fanout", "24ch"],
    ports: [
      ...ports("Ch", "analog-audio", "input", 24, "xlr-3"),
      trunkPort("Trunk Out", "analog-audio", "output", 24, "none"),
    ],
  },
  {
    id: "c0a80101-00e1-4000-8000-000000000331",
    deviceType: "cable-accessory",
    label: "Audio Snake (24-ch) Break-out",
    searchTerms: ["snake", "breakout", "break-out", "multicable", "audio", "xlr", "fanout", "24ch"],
    ports: [
      trunkPort("Trunk In", "analog-audio", "input", 24, "none"),
      ...ports("Ch", "analog-audio", "output", 24, "xlr-3"),
    ],
  },
  {
    id: "c0a80101-00e0-4000-8000-000000000340",
    deviceType: "cable-accessory",
    label: "Audio Snake DB25 (8-ch) Break-in",
    searchTerms: ["snake", "breakin", "break-in", "multicable", "audio", "xlr", "fanout", "db25", "8ch"],
    ports: [
      ...ports("Ch", "analog-audio", "input", 8, "xlr-3"),
      trunkPort("Trunk Out", "analog-audio", "output", 8, "db25"),
    ],
  },
  {
    id: "c0a80101-00e1-4000-8000-000000000341",
    deviceType: "cable-accessory",
    label: "Audio Snake DB25 (8-ch) Break-out",
    searchTerms: ["snake", "breakout", "break-out", "multicable", "audio", "xlr", "fanout", "db25", "8ch"],
    ports: [
      trunkPort("Trunk In", "analog-audio", "input", 8, "db25"),
      ...ports("Ch", "analog-audio", "output", 8, "xlr-3"),
    ],
  },
  {
    id: "c0a80101-00e2-4000-8000-000000000302",
    deviceType: "cable-accessory",
    label: "Socapex Break-in (6-ch)",
    searchTerms: ["socapex", "breakin", "break-in", "multicable", "power", "fanout"],
    ports: [
      ...ports("Ch", "power", "input", 6, "powercon"),
      trunkPort("Trunk Out", "power", "output", 6, "socapex"),
    ],
  },
  {
    id: "c0a80101-00e3-4000-8000-000000000303",
    deviceType: "cable-accessory",
    label: "Socapex Break-out (6-ch)",
    searchTerms: ["socapex", "breakout", "break-out", "multicable", "power", "fanout"],
    ports: [
      trunkPort("Trunk In", "power", "input", 6, "socapex"),
      ...ports("Ch", "power", "output", 6, "powercon"),
    ],
  },
  {
    id: "c0a80101-00e4-4000-8000-000000000304",
    deviceType: "cable-accessory",
    label: "Fiber Break-in (4-ch)",
    searchTerms: ["fiber", "breakin", "break-in", "multicable", "optical", "fanout"],
    ports: [
      ...ports("Ch", "fiber", "input", 4, "lc"),
      trunkPort("Trunk Out", "fiber", "output", 4, "none"),
    ],
  },
  {
    id: "c0a80101-00e5-4000-8000-000000000305",
    deviceType: "cable-accessory",
    label: "Fiber Break-out (4-ch)",
    searchTerms: ["fiber", "breakout", "break-out", "multicable", "optical", "fanout"],
    ports: [
      trunkPort("Trunk In", "fiber", "input", 4, "none"),
      ...ports("Ch", "fiber", "output", 4, "lc"),
    ],
  },
  {
    id: "c0a80101-00e6-4000-8000-000000000306",
    deviceType: "cable-accessory",
    label: "Custom Break-in",
    searchTerms: ["breakin", "break-in", "multicable", "custom", "fanout"],
    ports: [
      trunkPort("Trunk Out", "custom", "output", 0, "multipin"),
    ],
  },
  {
    id: "c0a80101-00e7-4000-8000-000000000307",
    deviceType: "cable-accessory",
    label: "Custom Break-out",
    searchTerms: ["breakout", "break-out", "multicable", "custom", "fanout"],
    ports: [
      trunkPort("Trunk In", "custom", "input", 0, "multipin"),
    ],
  },
  {
    id: "c0a80101-0324-4000-8000-000000000758",
    deviceType: "cable-accessory",
    label: "SDI Snake (4-ch) Break-in",
    searchTerms: ["snake", "breakin", "break-in", "multicable", "sdi", "bnc", "video", "coax", "fanout", "4ch"],
    ports: [
      ...ports("Ch", "sdi", "input", 4, "bnc"),
      trunkPort("Trunk Out", "sdi", "output", 4, "none"),
    ],
  },
  {
    id: "c0a80101-0325-4000-8000-000000000759",
    deviceType: "cable-accessory",
    label: "SDI Snake (4-ch) Break-out",
    searchTerms: ["snake", "breakout", "break-out", "multicable", "sdi", "bnc", "video", "coax", "fanout", "4ch"],
    ports: [
      trunkPort("Trunk In", "sdi", "input", 4, "none"),
      ...ports("Ch", "sdi", "output", 4, "bnc"),
    ],
  },
  {
    id: "c0a80101-0326-4000-8000-000000000760",
    deviceType: "cable-accessory",
    label: "SDI Snake (8-ch) Break-in",
    searchTerms: ["snake", "breakin", "break-in", "multicable", "sdi", "bnc", "video", "coax", "fanout", "8ch"],
    ports: [
      ...ports("Ch", "sdi", "input", 8, "bnc"),
      trunkPort("Trunk Out", "sdi", "output", 8, "none"),
    ],
  },
  {
    id: "c0a80101-0327-4000-8000-000000000761",
    deviceType: "cable-accessory",
    label: "SDI Snake (8-ch) Break-out",
    searchTerms: ["snake", "breakout", "break-out", "multicable", "sdi", "bnc", "video", "coax", "fanout", "8ch"],
    ports: [
      trunkPort("Trunk In", "sdi", "input", 8, "none"),
      ...ports("Ch", "sdi", "output", 8, "bnc"),
    ],
  },
  {
    id: "c0a80101-0328-4000-8000-000000000762",
    deviceType: "cable-accessory",
    label: "SDI Snake (12-ch) Break-in",
    searchTerms: ["snake", "breakin", "break-in", "multicable", "sdi", "bnc", "video", "coax", "fanout", "12ch"],
    ports: [
      ...ports("Ch", "sdi", "input", 12, "bnc"),
      trunkPort("Trunk Out", "sdi", "output", 12, "none"),
    ],
  },
  {
    id: "c0a80101-0329-4000-8000-000000000763",
    deviceType: "cable-accessory",
    label: "SDI Snake (12-ch) Break-out",
    searchTerms: ["snake", "breakout", "break-out", "multicable", "sdi", "bnc", "video", "coax", "fanout", "12ch"],
    ports: [
      trunkPort("Trunk In", "sdi", "input", 12, "none"),
      ...ports("Ch", "sdi", "output", 12, "bnc"),
    ],
  },
  {
    id: "c0a80101-032a-4000-8000-000000000764",
    deviceType: "cable-accessory",
    label: "SDI Snake (16-ch) Break-in",
    searchTerms: ["snake", "breakin", "break-in", "multicable", "sdi", "bnc", "video", "coax", "fanout", "16ch"],
    ports: [
      ...ports("Ch", "sdi", "input", 16, "bnc"),
      trunkPort("Trunk Out", "sdi", "output", 16, "none"),
    ],
  },
  {
    id: "c0a80101-032b-4000-8000-000000000765",
    deviceType: "cable-accessory",
    label: "SDI Snake (16-ch) Break-out",
    searchTerms: ["snake", "breakout", "break-out", "multicable", "sdi", "bnc", "video", "coax", "fanout", "16ch"],
    ports: [
      trunkPort("Trunk In", "sdi", "input", 16, "none"),
      ...ports("Ch", "sdi", "output", 16, "bnc"),
    ],
  },
];
