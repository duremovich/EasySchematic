import type { Node, Edge } from "@xyflow/react";

export type ConnectorType =
  | "bnc" | "hdmi" | "displayport" | "vga"
  | "xlr-3" | "xlr-5" | "trs-quarter" | "trs-eighth"
  | "rj45" | "ethercon" | "sfp" | "lc"
  | "usb-a" | "usb-b" | "usb-c"
  | "db9" | "phoenix" | "powercon" | "edison" | "iec"
  | "speakon" | "none" | "other";

export interface PortNetworkConfig {
  ip?: string;
  subnetMask?: string;
  gateway?: string;
  vlan?: number;
  dhcp?: boolean;
}

export interface PortCapabilities {
  maxResolution?: string;
  maxFrameRate?: number;
  maxBitDepth?: number;
  colorSpaces?: string[];
}

export interface PortActiveConfig {
  resolution?: string;
  frameRate?: number;
  bitDepth?: number;
  colorSpace?: string;
}

export type SignalType =
  | "sdi"
  | "hdmi"
  | "ndi"
  | "dante"
  | "analog-audio"
  | "aes"
  | "dmx"
  | "madi"
  | "usb"
  | "ethernet"
  | "fiber"
  | "displayport"
  | "hdbaset"
  | "srt"
  | "genlock"
  | "gpio"
  | "rs422"
  | "serial"
  | "thunderbolt"
  | "composite"
  | "vga"
  | "power"
  | "custom";

export type PortDirection = "input" | "output" | "bidirectional";

export interface Port {
  id: string;
  label: string;
  signalType: SignalType;
  direction: PortDirection;
  section?: string;
  connectorType?: ConnectorType;
  capabilities?: PortCapabilities;
  networkConfig?: PortNetworkConfig;
  activeConfig?: PortActiveConfig;
}

export interface DeviceData {
  [key: string]: unknown;
  label: string;
  deviceType: string;
  ports: Port[];
  color?: string;
  /** Original template label — present while device participates in auto-numbering.
   *  Cleared when the user gives the device a custom name. */
  baseLabel?: string;
  /** Permanent template identity — what the device *is* (e.g. "BMD SDI→HDMI").
   *  Never cleared on rename. Used for pack list grouping. */
  model?: string;
  templateId?: string;
  templateVersion?: number;
  manufacturer?: string;
  modelNumber?: string;
  showAllPorts?: boolean;
  hiddenPorts?: string[];
}

export type DeviceNode = Node<DeviceData, "device">;

export interface RoomData {
  [key: string]: unknown;
  label: string;
  color?: string;
  borderColor?: string;
  borderStyle?: "dashed" | "solid" | "dotted";
  labelSize?: number;
}

export type RoomNode = Node<RoomData, "room">;

export interface NoteData {
  [key: string]: unknown;
  /** HTML content from contentEditable */
  html: string;
}

export type NoteNode = Node<NoteData, "note">;

export type SchematicNode = DeviceNode | RoomNode | NoteNode;

export interface ConnectionData {
  [key: string]: unknown;
  signalType: SignalType;
  manualWaypoints?: { x: number; y: number }[];
  connectorMismatch?: boolean;
}

export type ConnectionEdge = Edge<ConnectionData>;

export interface DeviceTemplate {
  id?: string;
  version?: number;
  deviceType: string;
  label: string;
  ports: Port[];
  color?: string;
  searchTerms?: string[];
  manufacturer?: string;
  modelNumber?: string;
  imageUrl?: string;
  referenceUrl?: string;
}

export interface TemplatePreset {
  ports: Port[];
  hiddenPorts?: string[];
  color?: string;
}

export interface CustomField {
  id: string;
  label: string;
  value: string;
}

export interface TitleBlock {
  showName: string;
  venue: string;
  designer: string;
  engineer: string;
  date: string;
  drawingTitle: string;
  company: string;
  revision: string;
  logo: string;
  customFields: CustomField[];
}

export type CellContentType = "field" | "static" | "logo" | "pageNumber";

export interface TitleBlockCell {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  content:
    | { type: "field"; field: string }
    | { type: "static"; text: string }
    | { type: "logo" }
    | { type: "pageNumber" };
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontFamily: "sans-serif" | "serif" | "monospace";
  align: "left" | "center" | "right";
  color: string;
}

export interface TitleBlockLayout {
  columns: number[];
  rows: number[];
  cells: TitleBlockCell[];
  widthIn: number;
  heightIn: number;
}

export interface SchematicFile {
  version: number;
  name: string;
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
  customTemplates?: DeviceTemplate[];
  signalColors?: Partial<Record<SignalType, string>>;
  printPaperId?: string;
  printOrientation?: "landscape" | "portrait";
  printScale?: number;
  titleBlock?: TitleBlock;
  titleBlockLayout?: TitleBlockLayout;
  hiddenSignalTypes?: SignalType[];
  hideDeviceTypes?: boolean;
  hideUnconnectedPorts?: boolean;
  templateHiddenSignals?: Record<string, SignalType[]>;
  templatePresets?: Record<string, TemplatePreset>;
  favoriteTemplates?: string[];
  // Report layout preferences (pack list PDF, etc.) keyed by report ID
  reportLayouts?: Record<string, unknown>;
}

export const SIGNAL_COLORS: Record<SignalType, string> = {
  sdi: "var(--color-sdi)",
  hdmi: "var(--color-hdmi)",
  ndi: "var(--color-ndi)",
  dante: "var(--color-dante)",
  "analog-audio": "var(--color-analog-audio)",
  aes: "var(--color-aes)",
  dmx: "var(--color-dmx)",
  madi: "var(--color-madi)",
  usb: "var(--color-usb)",
  ethernet: "var(--color-ethernet)",
  fiber: "var(--color-fiber)",
  displayport: "var(--color-displayport)",
  hdbaset: "var(--color-hdbaset)",
  srt: "var(--color-srt)",
  genlock: "var(--color-genlock)",
  gpio: "var(--color-gpio)",
  rs422: "var(--color-rs422)",
  serial: "var(--color-serial)",
  thunderbolt: "var(--color-thunderbolt)",
  composite: "var(--color-composite)",
  vga: "var(--color-vga)",
  power: "var(--color-power)",
  custom: "var(--color-custom)",
};

export const CONNECTOR_LABELS: Record<ConnectorType, string> = {
  bnc: "BNC",
  hdmi: "HDMI",
  displayport: "DisplayPort",
  vga: "VGA (DB15)",
  "xlr-3": "XLR-3",
  "xlr-5": "XLR-5",
  "trs-quarter": '1/4" TRS',
  "trs-eighth": '3.5mm TRS',
  rj45: "RJ45",
  ethercon: "EtherCon",
  sfp: "SFP/SFP+",
  lc: "LC Fiber",
  "usb-a": "USB-A",
  "usb-b": "USB-B",
  "usb-c": "USB-C",
  db9: "DB9",
  phoenix: "Phoenix",
  powercon: "powerCON",
  edison: "Edison",
  iec: "IEC C13",
  speakon: "speakON",
  none: "None",
  other: "Other",
};

export const SIGNAL_LABELS: Record<SignalType, string> = {
  sdi: "SDI",
  hdmi: "HDMI",
  ndi: "NDI",
  dante: "Dante",
  "analog-audio": "Analog",
  aes: "AES",
  dmx: "DMX",
  madi: "MADI",
  usb: "USB",
  ethernet: "Ethernet",
  fiber: "Fiber",
  displayport: "DisplayPort",
  hdbaset: "HDBaseT",
  srt: "SRT",
  genlock: "Genlock",
  gpio: "GPIO",
  rs422: "RS-422",
  serial: "Serial",
  thunderbolt: "Thunderbolt",
  composite: "Composite",
  vga: "VGA",
  power: "Power",
  custom: "Custom",
};
