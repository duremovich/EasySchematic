import type { Node, Edge } from "@xyflow/react";

export type SignalType =
  | "sdi"
  | "hdmi"
  | "ndi"
  | "dante"
  | "analog-audio"
  | "aes"
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
}

export type DeviceNode = Node<DeviceData, "device">;

export interface RoomData {
  [key: string]: unknown;
  label: string;
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
}

export type ConnectionEdge = Edge<ConnectionData>;

export interface DeviceTemplate {
  deviceType: string;
  label: string;
  ports: Port[];
  color?: string;
  searchTerms?: string[];
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
}

export const SIGNAL_COLORS: Record<SignalType, string> = {
  sdi: "var(--color-sdi)",
  hdmi: "var(--color-hdmi)",
  ndi: "var(--color-ndi)",
  dante: "var(--color-dante)",
  "analog-audio": "var(--color-analog-audio)",
  aes: "var(--color-aes)",
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

export const SIGNAL_LABELS: Record<SignalType, string> = {
  sdi: "SDI",
  hdmi: "HDMI",
  ndi: "NDI",
  dante: "Dante",
  "analog-audio": "Analog",
  aes: "AES",
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
