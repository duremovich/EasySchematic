import type { Node, Edge } from "@xyflow/react";

export type ConnectorType =
  | "bnc" | "hdmi" | "displayport" | "vga"
  | "xlr-3" | "xlr-4" | "xlr-5" | "trs-quarter" | "trs-eighth" | "combo-xlr-trs"
  | "rj45" | "ethercon" | "sfp" | "lc" | "sc"
  | "usb-a" | "usb-b" | "usb-c"
  | "db7w2" | "db9" | "db15" | "db25" | "din-5" | "phoenix" | "terminal-block" | "powercon" | "edison" | "iec" | "iec-c5" | "iec-c7" | "iec-c15" | "iec-c20"
  | "speakon" | "socapex" | "multipin" | "rca" | "toslink" | "barrel"
  | "banana" | "binding-post" | "binding-post-banana" | "dvi" | "mini-xlr" | "opticalcon"
  | "l5-20" | "l6-20" | "l6-30" | "l21-30" | "cam-lok" | "powercon-true1"
  | "qsfp" | "qsfp28" | "mpo" | "digilink" | "pcie-6pin"
  | "mini-din-4" | "mini-din-7"
  | "mini-hdmi" | "mini-displayport"
  | "rj11" | "rj12" | "usb-mini" | "usb-micro" | "trs-2.5mm"
  | "reverse-tnc" | "sma" | "db37"
  | "d-tap" | "v-mount" | "f-connector"
  | "lemo-2pin" | "lemo-5pin"
  | "wireless"
  | "none" | "other";

export interface PortNetworkConfig {
  ip?: string;
  subnetMask?: string;
  gateway?: string;
  vlan?: number;
  dhcp?: boolean;
}

export interface DhcpServerConfig {
  enabled: boolean;
  rangeStart?: string;   // e.g. "192.168.1.100"
  rangeEnd?: string;     // e.g. "192.168.1.200"
  subnetMask?: string;   // e.g. "255.255.255.0"
  gateway?: string;      // e.g. "192.168.1.1"
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
  | "avb"
  | "analog-audio"
  | "speaker-level"
  | "bluetooth"
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
  | "s-video"
  | "vga"
  | "dvi"
  | "power"
  | "power-l1"
  | "power-l2"
  | "power-l3"
  | "power-neutral"
  | "power-ground"
  | "midi"
  | "tally"
  | "spdif"
  | "adat"
  | "ultranet"
  | "aes50"
  | "stageconnect"
  | "wordclock"
  | "aes67"
  | "ydif"
  | "rf"
  | "st2110"
  | "artnet"
  | "sacn"
  | "ir"
  | "timecode"
  | "gigaace"
  | "dx5"
  | "slink"
  | "soundgrid"
  | "fibreace"
  | "dsnake"
  | "dxlink"
  | "gps"
  | "dars"
  | "rtmp"
  | "rtsp"
  | "mpeg-ts"
  | "component-video"
  | "digilink"
  | "custom";

export type LineStyle = "solid" | "dashed" | "dotted" | "dash-dot";

export const LINE_STYLE_LABELS: Record<LineStyle, string> = {
  solid: "Solid",
  dashed: "Dashed",
  dotted: "Dotted",
  "dash-dot": "Dash-Dot",
};

export const LINE_STYLE_DASHARRAY: Record<LineStyle, string | undefined> = {
  solid: undefined,
  dashed: "8 4",
  dotted: "2 4",
  "dash-dot": "8 4 2 4",
};

export type PortDirection = "input" | "output" | "bidirectional";

export type Gender = "male" | "female";

export interface Port {
  id: string;
  label: string;
  signalType: SignalType;
  direction: PortDirection;
  section?: string;
  connectorType?: ConnectorType;
  /** Connector gender override. Omit to derive from connector + direction convention. */
  gender?: Gender;
  capabilities?: PortCapabilities;
  networkConfig?: PortNetworkConfig;
  addressable?: boolean;
  activeConfig?: PortActiveConfig;
  isMulticable?: boolean;
  channelCount?: number;
  /** When true, this port attaches directly to the connected device (no separate cable needed in pack list) */
  directAttach?: boolean;
  /** When true, port renders on the opposite side of the device (input on right, output on left) */
  flipped?: boolean;
  notes?: string;
  /** PoE power draw in watts for this port (consumed when powered by switch) */
  poeDrawW?: number;
  /** Link speed for network ports */
  linkSpeed?: string;
  /** Stable link back to the template port this was cloned from — used for template-sync reconciliation. */
  templatePortId?: string;
}

export interface SlotDefinition {
  id: string;
  label: string;               // "Slot 1", "VFC Slot A"
  slotFamily: string;           // e.g. "disguise-vfc", "yamaha-my"
  defaultCardId?: string;       // pre-populated when placed on canvas
}

export interface InstalledSlot {
  slotId: string;
  label: string;
  slotFamily?: string;          // denormalized for UI card lookup (especially nested slots)
  parentSlotId?: string;        // links to parent slot for nested cards (e.g. SFP in a network module)
  cardTemplateId?: string;      // undefined = empty slot
  cardLabel?: string;           // denormalized for display/pack list
  cardManufacturer?: string;
  cardModelNumber?: string;
  cardUnitCost?: number;
  portIds: string[];            // tracks which ports in device.ports belong to this slot
}

export interface DeviceData {
  [key: string]: unknown;
  label: string;
  hostname?: string;
  deviceType: string;
  ports: Port[];
  color?: string;
  /** Custom header background color (#9) */
  headerColor?: string;
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
  /** Manufacturer spec sheet / product page URL — inherited from the source template but editable per-device */
  referenceUrl?: string;
  /** Device category (e.g. "video", "audio") — meaningful for custom templates and community submissions */
  category?: string;
  showAllPorts?: boolean;
  hiddenPorts?: string[];
  dhcpServer?: DhcpServerConfig;
  isCableAccessory?: boolean;
  integratedWithCable?: boolean;
  slots?: InstalledSlot[];
  powerDrawW?: number;
  powerCapacityW?: number;
  voltage?: string;
  /** PoE budget in watts (for network switches — power this device *supplies* over PoE) */
  poeBudgetW?: number;
  /** PoE draw in watts (power this device *consumes* over PoE, e.g. a camera or AP) */
  poeDrawW?: number;
  /** Unit cost in dollars (optional, for BOM/quoting) */
  unitCost?: number;
  isVenueProvided?: boolean;
  /** Physical height in millimeters — reserved for future rack management */
  heightMm?: number;
  /** Physical width in millimeters — reserved for future rack management */
  widthMm?: number;
  /** Physical depth in millimeters — reserved for future rack management */
  depthMm?: number;
  /** Device weight in kilograms — reserved for future rack management */
  weightKg?: number;
  /** Adapter visibility override — only meaningful for deviceType "adapter" */
  adapterVisibility?: "default" | "force-show" | "force-hide";
  /** User-customizable auxiliary data rows. Each row carries its own slot (header vs
   *  footer) and text; blank text entries within a slot render as separator gaps. */
  auxiliaryData?: AuxRow[];
}

/** One row of auxiliary data shown on a device node. */
export interface AuxRow {
  /** Display text — may contain `{{token}}` placeholders (e.g. `{{modelNumber}}`). */
  text: string;
  /** Whether the row renders above the ports (header) or below them (footer).
   *  Defaults to "footer" when omitted. */
  position?: "header" | "footer";
}

export type DeviceNode = Node<DeviceData, "device">;

export interface RoomData {
  [key: string]: unknown;
  label: string;
  color?: string;
  borderColor?: string;
  borderStyle?: "dashed" | "solid" | "dotted";
  labelSize?: number;
  locked?: boolean;
  isEquipmentRack?: boolean;
}

export type RoomNode = Node<RoomData, "room">;

export interface NoteData {
  [key: string]: unknown;
  /** HTML content from contentEditable */
  html: string;
}

export type NoteNode = Node<NoteData, "note">;

export interface AnnotationData {
  [key: string]: unknown;
  /** Shape type for the annotation (#24) */
  shape: "rectangle" | "ellipse";
  /** Fill color */
  color?: string;
  /** Border color */
  borderColor?: string;
  /** Optional text label */
  label?: string;
}

export type AnnotationNode = Node<AnnotationData, "annotation">;

export type SchematicNode = DeviceNode | RoomNode | NoteNode | AnnotationNode;

export interface ConnectionData {
  [key: string]: unknown;
  signalType: SignalType;
  manualWaypoints?: { x: number; y: number }[];
  /** When true, manualWaypoints were auto-generated from A* route and can be overwritten on re-route */
  autoRouteWaypoints?: boolean;
  connectorMismatch?: boolean;
  cableId?: string;
  cableLength?: string;
  multicableLabel?: string;
  /** User-defined label displayed on the connection line (#5) */
  label?: string;
  /** When true, render as a short stub from each end instead of a full connection (#13) */
  stubbed?: boolean;
  /** Custom position for source stub endpoint (absolute canvas coords) */
  stubSourceEnd?: { x: number; y: number };
  /** Custom position for target stub endpoint (absolute canvas coords) */
  stubTargetEnd?: { x: number; y: number };
  /** Intermediate waypoints for source stub path */
  stubSourceWaypoints?: { x: number; y: number }[];
  /** Intermediate waypoints for target stub path */
  stubTargetWaypoints?: { x: number; y: number }[];
  /** Allow connection between incompatible connector types (#6) */
  allowIncompatible?: boolean;
  /** @deprecated Use hideCableId + hideCustomLabel instead. Migrated in schema v25. */
  hideLabel?: boolean;
  /** Per-edge: hide cable ID label (#61) */
  hideCableId?: boolean;
  /** Per-edge: hide custom label (#61) */
  hideCustomLabel?: boolean;
  /** Per-edge: cable ID endpoint spacing override in pixels (#61) */
  cableIdGap?: number;
  /** Per-edge: custom label endpoint spacing override in pixels (#61) */
  customLabelGap?: number;
  /** Per-edge: cable ID midpoint offset along path in pixels (#61) */
  cableIdMidOffset?: number;
  /** Per-edge: custom label midpoint offset along path in pixels (#61) */
  customLabelMidOffset?: number;
  /** Per-edge: cable ID label display mode override (#61) */
  cableIdLabelMode?: "endpoint" | "midpoint";
  /** Per-edge: custom label display mode override (#61) */
  customLabelMode?: "endpoint" | "midpoint";
  /** Edge represents a direct physical attachment, not a separate cable */
  directAttach?: boolean;
  /** Visual line style — solid (default), dashed, dotted, or dash-dot */
  lineStyle?: LineStyle;
}

export type ConnectionEdge = Edge<ConnectionData>;

export interface DeviceTemplate {
  id?: string;
  version?: number;
  deviceType: string;
  category?: string;
  label: string;
  hostname?: string;
  ports: Port[];
  color?: string;
  searchTerms?: string[];
  manufacturer?: string;
  modelNumber?: string;
  imageUrl?: string;
  referenceUrl?: string;
  slots?: SlotDefinition[];
  slotFamily?: string;           // only set on expansion card templates
  powerDrawW?: number;           // Max power consumption in watts
  powerCapacityW?: number;       // Total supply capacity in watts (distros only)
  voltage?: string;              // Informational: "100-240V", "208V", "120V"
  isVenueProvided?: boolean;     // Venue-owned gear — excluded from pack list
  poeBudgetW?: number;           // PoE budget in watts (switches/PSEs supplying PoE)
  poeDrawW?: number;             // PoE draw in watts (PDs consuming PoE — cameras, APs, etc.)
  unitCost?: number;             // MSRP / default unit cost in dollars
  heightMm?: number;             // Physical height in millimeters — reserved for future rack management
  widthMm?: number;              // Physical width in millimeters — reserved for future rack management
  depthMm?: number;              // Physical depth in millimeters — reserved for future rack management
  weightKg?: number;             // Device weight in kilograms — reserved for future rack management
  auxiliaryData?: AuxRow[];      // Aux rows shown on the node (each row carries its own header/footer slot)
}

export interface CustomTemplateGroup {
  id: string;
  label: string;
  collapsed?: boolean;
}

export interface CustomTemplateMeta {
  groups: CustomTemplateGroup[];
  order: string[];                          // template key (id ?? deviceType) in display order
  groupAssignments: Record<string, string>; // template key -> groupId
}

export interface TemplatePreset {
  ports: Port[];
  hiddenPorts?: string[];
  color?: string;
}

export interface OwnedGearItem {
  template: DeviceTemplate;
  quantity: number;
}

export interface OwnedGearFile {
  version: 1;
  ownedGear: OwnedGearItem[];
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
  ownedGear?: OwnedGearItem[];
  signalColors?: Partial<Record<SignalType, string>>;
  signalLineStyles?: Partial<Record<SignalType, LineStyle>>;
  printPaperId?: string;
  printOrientation?: "landscape" | "portrait";
  printScale?: number;
  printCustomWidthIn?: number;
  printCustomHeightIn?: number;
  printOriginOffsetX?: number;
  printOriginOffsetY?: number;
  titleBlock?: TitleBlock;
  titleBlockLayout?: TitleBlockLayout;
  hiddenSignalTypes?: SignalType[];
  hiddenPinSignalTypes?: SignalType[];
  /** @deprecated Replaced in schema v27 by the {{deviceType}} auxiliary row. Kept on the file
   *  shape so the migration can honor the user's prior suppression intent. */
  hideDeviceTypes?: boolean;
  hideUnconnectedPorts?: boolean;
  showPortCounts?: boolean;
  templateHiddenSignals?: Record<string, SignalType[]>;
  templatePresets?: Record<string, TemplatePreset>;
  favoriteTemplates?: string[];
  // Report layout preferences (pack list PDF, etc.) keyed by report ID
  reportLayouts?: Record<string, unknown>;
  globalReportHeaderLayout?: TitleBlockLayout;
  globalReportFooterLayout?: TitleBlockLayout;
  /** @deprecated Use scrollConfig instead. Kept for backwards compatibility on import. */
  scrollBehavior?: "zoom" | "pan";
  /** Per-modifier scroll wheel action mapping (#19) */
  scrollConfig?: ScrollConfig;
  /** Cable naming scheme for cable schedule (#1) */
  cableNamingScheme?: "sequential" | "type-prefix";
  /** Show line jump arcs where connections cross (#18) */
  showLineJumps?: boolean;
  /** @deprecated Use showCableIdLabels instead. Kept for backwards compatibility. */
  showConnectionLabels?: boolean;
  /** Show cable ID labels at connection endpoints (#61) */
  showCableIdLabels?: boolean;
  /** Show custom labels on connections (#61) */
  showCustomLabels?: boolean;
  /** Cable ID endpoint spacing in pixels (#61) */
  cableIdGap?: number;
  /** Custom label endpoint spacing in pixels (#61) */
  customLabelGap?: number;
  /** Cable ID midpoint offset along path in pixels (#61) */
  cableIdMidOffset?: number;
  /** Custom label midpoint offset along path in pixels (#61) */
  customLabelMidOffset?: number;
  /** Cable ID label display mode — at endpoints or midpoint (#61) */
  cableIdLabelMode?: "endpoint" | "midpoint";
  /** Custom label display mode — at endpoints or midpoint (#61) */
  customLabelMode?: "endpoint" | "midpoint";
  /** Global toggle: when true, all adapters default to hidden on schematic */
  hideAdapters?: boolean;
  /** When false, edges use simple orthogonal L-shapes instead of A* routing */
  autoRoute?: boolean;
  /** Edge interaction hitbox width in pixels (default 10, React Flow default is 20) */
  edgeHitboxSize?: number;
  /** User-preferred device category display order (#62) */
  categoryOrder?: string[];
  /** Show the owned-gear tab in the left library panel */
  showOwnedGearPane?: boolean;
  /** Active tab in the left library panel */
  libraryActiveTab?: "devices" | "owned";
  /** Color key / signal legend for print view (#70) */
  colorKeyEnabled?: boolean;
  colorKeyCorner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  colorKeyColumns?: number;
  colorKeyPage?: "first" | "last" | "all";
  colorKeyOverrides?: Partial<Record<SignalType, boolean>>;
  /** Cable unit costs keyed by "cableType|signalType|cableLength" */
  cableCosts?: Record<string, number>;
  /** Force-case device/port/slot labels on write (normal = leave as-typed) */
  labelCase?: LabelCaseMode;
}

export type LabelCaseMode = "as-typed" | "uppercase" | "lowercase" | "capitalize";
export const DEFAULT_LABEL_CASE: LabelCaseMode = "as-typed";

export type ScrollAction = "zoom" | "pan-x" | "pan-y";

export interface ScrollConfig {
  /** Scroll wheel with no modifier key */
  scroll: ScrollAction;
  /** Shift + scroll wheel */
  shiftScroll: ScrollAction;
  /** Ctrl + scroll wheel */
  ctrlScroll: ScrollAction;
  /** Zoom speed multiplier (default 1.0, range 0.25–3.0) */
  zoomSpeed: number;
  /** Pan speed multiplier (default 1.0, range 0.25–3.0) */
  panSpeed: number;
  /** Enable automatic trackpad detection (default true) */
  trackpadEnabled: boolean;
}

export const DEFAULT_SCROLL_CONFIG: ScrollConfig = {
  scroll: "zoom",
  shiftScroll: "pan-x",
  ctrlScroll: "pan-y",
  zoomSpeed: 1,
  panSpeed: 1,
  trackpadEnabled: true,
};

export const SIGNAL_COLORS: Record<SignalType, string> = {
  sdi: "var(--color-sdi)",
  hdmi: "var(--color-hdmi)",
  ndi: "var(--color-ndi)",
  dante: "var(--color-dante)",
  avb: "var(--color-avb)",
  "analog-audio": "var(--color-analog-audio)",
  "speaker-level": "var(--color-speaker-level)",
  bluetooth: "var(--color-bluetooth)",
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
  "component-video": "var(--color-component-video)",
  "s-video": "var(--color-s-video)",
  vga: "var(--color-vga)",
  dvi: "var(--color-dvi)",
  power: "var(--color-power)",
  "power-l1": "var(--color-power-l1)",
  "power-l2": "var(--color-power-l2)",
  "power-l3": "var(--color-power-l3)",
  "power-neutral": "var(--color-power-neutral)",
  "power-ground": "var(--color-power-ground)",
  midi: "var(--color-midi)",
  tally: "var(--color-tally)",
  spdif: "var(--color-spdif)",
  adat: "var(--color-adat)",
  ultranet: "var(--color-ultranet)",
  aes50: "var(--color-aes50)",
  stageconnect: "var(--color-stageconnect)",
  wordclock: "var(--color-wordclock)",
  aes67: "var(--color-aes67)",
  ydif: "var(--color-ydif)",
  rf: "var(--color-rf)",
  st2110: "var(--color-st2110)",
  artnet: "var(--color-artnet)",
  sacn: "var(--color-sacn)",
  ir: "var(--color-ir)",
  timecode: "var(--color-timecode)",
  gigaace: "var(--color-gigaace)",
  dx5: "var(--color-dx5)",
  slink: "var(--color-slink)",
  soundgrid: "var(--color-soundgrid)",
  fibreace: "var(--color-fibreace)",
  dsnake: "var(--color-dsnake)",
  dxlink: "var(--color-dxlink)",
  gps: "var(--color-gps)",
  dars: "var(--color-dars)",
  rtmp: "var(--color-rtmp)",
  rtsp: "var(--color-rtsp)",
  "mpeg-ts": "var(--color-mpeg-ts)",
  digilink: "var(--color-digilink)",
  custom: "var(--color-custom)",
};

export const CONNECTOR_LABELS: Record<ConnectorType, string> = {
  bnc: "BNC",
  hdmi: "HDMI",
  displayport: "DisplayPort",
  vga: "VGA (DB15)",
  "xlr-3": "XLR-3",
  "xlr-4": "XLR-4",
  "xlr-5": "XLR-5",
  "trs-quarter": '1/4" TRS',
  "trs-eighth": '3.5mm TRS',
  "combo-xlr-trs": "XLR/TRS Combo",
  rj45: "RJ45",
  ethercon: "EtherCon",
  sfp: "SFP/SFP+",
  lc: "Fiber - LC",
  sc: "Fiber - SC",
  "usb-a": "USB-A",
  "usb-b": "USB-B",
  "usb-c": "USB-C",
  db7w2: "D-Sub 7W2",
  db9: "DB9",
  db15: "DB15",
  db25: "DB25",
  "din-5": "DIN-5",
  phoenix: "Phoenix",
  "terminal-block": "Terminal Block",
  powercon: "powerCON",
  edison: "Edison",
  iec: "IEC C14",
  "iec-c5": "IEC C5",
  "iec-c7": "IEC C7",
  "iec-c15": "IEC C15",
  "iec-c20": "IEC C20",
  speakon: "speakON",
  socapex: "Socapex",
  multipin: "Multi-pin",
  rca: "RCA",
  toslink: "TOSLINK",
  barrel: "DC Barrel",
  banana: "Banana",
  "binding-post": "Binding Post",
  "binding-post-banana": "Binding Post (Banana)",
  dvi: "DVI",
  "mini-din-4": "Mini-DIN 4-pin",
  "mini-din-7": "Mini-DIN 7-pin",
  "mini-hdmi": "Mini HDMI",
  "mini-displayport": "Mini DisplayPort",
  "mini-xlr": "Mini XLR",
  opticalcon: "Fiber - opticalCON",
  "l5-20": "NEMA L5-20",
  "l6-20": "NEMA L6-20",
  "l6-30": "NEMA L6-30",
  "l21-30": "NEMA L21-30",
  "cam-lok": "Cam-Lok",
  "powercon-true1": "powerCON TRUE1",
  rj11: "RJ11",
  rj12: "RJ12",
  qsfp: "QSFP+",
  qsfp28: "QSFP28",
  mpo: "Fiber - MPO/MTP",
  digilink: "DigiLink",
  "pcie-6pin": "PCIe 6-pin Aux",
  "lemo-2pin": "LEMO 2-pin",
  "lemo-5pin": "LEMO 5-pin",
  "usb-mini": "Mini USB",
  "usb-micro": "Micro USB",
  "trs-2.5mm": "2.5mm TRS",
  "reverse-tnc": "Reverse TNC",
  sma: "SMA",
  db37: "DB37",
  "d-tap": "D-Tap",
  "v-mount": "V-Mount",
  "f-connector": "F-Connector",
  wireless: "Wireless",
  none: "None",
  other: "Other",
};

/** Which visual side of the device a port appears on (respects flip). */
export function portSide(p: Port): "left" | "right" {
  if (p.direction === "input") return p.flipped ? "right" : "left";
  if (p.direction === "output") return p.flipped ? "left" : "right";
  return p.flipped ? "right" : "left"; // bidirectional: flipped swaps default side when collapsed
}

export const SIGNAL_LABELS: Record<SignalType, string> = {
  sdi: "SDI",
  hdmi: "HDMI",
  ndi: "NDI",
  dante: "Dante",
  avb: "AVB",
  "analog-audio": "Analog",
  "speaker-level": "Speaker",
  bluetooth: "Bluetooth",
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
  "s-video": "S-Video",
  vga: "VGA",
  dvi: "DVI",
  power: "Power",
  "power-l1": "L1 (Phase A)",
  "power-l2": "L2 (Phase B)",
  "power-l3": "L3 (Phase C)",
  "power-neutral": "Neutral",
  "power-ground": "Ground",
  midi: "MIDI",
  tally: "Tally",
  spdif: "S/PDIF",
  adat: "ADAT",
  ultranet: "Ultranet",
  aes50: "AES50",
  stageconnect: "StageConnect",
  wordclock: "Word Clock",
  aes67: "AES67",
  ydif: "YDIF",
  rf: "RF",
  st2110: "ST 2110",
  artnet: "Art-Net",
  sacn: "sACN",
  ir: "IR",
  timecode: "Timecode",
  gigaace: "GigaACE",
  dx5: "DX5",
  slink: "SLink",
  soundgrid: "SoundGrid",
  fibreace: "fibreACE",
  dsnake: "dSnake",
  dxlink: "DX Link",
  gps: "GPS",
  dars: "DARS",
  rtmp: "RTMP",
  rtsp: "RTSP",
  "mpeg-ts": "MPEG-TS",
  "component-video": "Component Video",
  digilink: "DigiLink",
  custom: "Custom",
};

/** Signal types organized by functional group (for searchable dropdowns) */
export const SIGNAL_GROUPS: Record<string, SignalType[]> = {
  "Video": ["sdi", "hdmi", "displayport", "dvi", "composite", "s-video", "vga"],
  "Video over IP": ["ndi", "srt", "hdbaset", "st2110"],
  "Audio": ["analog-audio", "speaker-level", "bluetooth", "aes", "dante", "avb", "aes67", "madi", "spdif", "adat", "ultranet", "aes50", "stageconnect", "ydif", "soundgrid", "gigaace", "dx5", "dsnake", "slink", "fibreace", "digilink"],
  "Network": ["ethernet", "fiber"],
  "Control / Data": ["dmx", "artnet", "sacn", "rs422", "serial", "gpio", "ir", "midi", "tally", "usb", "thunderbolt", "dxlink"],
  "Sync / Clock": ["genlock", "wordclock", "timecode", "dars", "gps"],
  "Power": ["power", "power-l1", "power-l2", "power-l3", "power-neutral", "power-ground"],
  "Streaming": ["rtmp", "rtsp", "mpeg-ts", "rf"],
  "Other": ["custom"],
};

/** Connector types organized by functional group (for searchable dropdowns) */
export const CONNECTOR_GROUPS: Record<string, ConnectorType[]> = {
  "Video": ["bnc", "hdmi", "mini-hdmi", "displayport", "mini-displayport", "dvi", "vga"],
  "Audio": ["xlr-3", "xlr-4", "xlr-5", "mini-xlr", "combo-xlr-trs", "trs-quarter", "trs-eighth", "trs-2.5mm", "rca", "din-5", "mini-din-4", "mini-din-7", "toslink"],
  "Network / Data": ["rj45", "ethercon", "sfp", "lc", "sc", "opticalcon", "qsfp", "qsfp28", "mpo", "rj11", "rj12"],
  "USB": ["usb-a", "usb-b", "usb-c", "usb-mini", "usb-micro"],
  "D-Sub / Serial": ["db9", "db15", "db25", "db37", "db7w2", "lemo-5pin"],
  "Power": ["iec", "iec-c5", "iec-c7", "iec-c15", "iec-c20", "powercon", "powercon-true1", "edison", "barrel", "l5-20", "l6-20", "l6-30", "l21-30", "cam-lok", "socapex", "pcie-6pin", "lemo-2pin"],
  "Speaker": ["speakon", "banana", "binding-post", "binding-post-banana"],
  "Terminal": ["phoenix", "terminal-block", "multipin"],
  "RF": ["reverse-tnc", "sma"],
  "Other": ["wireless", "digilink", "none", "other"],
};
