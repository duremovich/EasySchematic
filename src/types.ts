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

export type SchematicNode = DeviceNode | RoomNode;

export interface ConnectionData {
  [key: string]: unknown;
  signalType: SignalType;
}

export type ConnectionEdge = Edge<ConnectionData>;

export interface DeviceTemplate {
  deviceType: string;
  label: string;
  ports: Port[];
  color?: string;
  searchTerms?: string[];
}

export interface SchematicFile {
  version: number;
  name: string;
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
  customTemplates?: DeviceTemplate[];
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
  power: "Power",
  custom: "Custom",
};
