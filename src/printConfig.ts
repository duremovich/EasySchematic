export interface PaperSize {
  id: string;
  label: string;
  widthIn: number;
  heightIn: number;
  category: string;
}

export type Orientation = "landscape" | "portrait";

export const PAGE_MARGIN_IN = 0.4;
export const TITLE_BLOCK_HEIGHT_IN = 0.5;

export const PAPER_SIZES: PaperSize[] = [
  // Standard
  { id: "letter", label: "Letter", widthIn: 8.5, heightIn: 11, category: "Standard" },
  { id: "legal", label: "Legal", widthIn: 8.5, heightIn: 14, category: "Standard" },
  { id: "tabloid", label: "Tabloid", widthIn: 11, heightIn: 17, category: "Standard" },
  // ANSI
  { id: "ansi-c", label: "ANSI C", widthIn: 17, heightIn: 22, category: "ANSI" },
  { id: "ansi-d", label: "ANSI D", widthIn: 22, heightIn: 34, category: "ANSI" },
  { id: "ansi-e", label: "ANSI E", widthIn: 34, heightIn: 44, category: "ANSI" },
  // Architectural
  { id: "arch-a", label: "ARCH A", widthIn: 9, heightIn: 12, category: "Architectural" },
  { id: "arch-b", label: "ARCH B", widthIn: 12, heightIn: 18, category: "Architectural" },
  { id: "arch-c", label: "ARCH C", widthIn: 18, heightIn: 24, category: "Architectural" },
  { id: "arch-d", label: "ARCH D", widthIn: 24, heightIn: 36, category: "Architectural" },
  { id: "arch-e", label: "ARCH E", widthIn: 36, heightIn: 48, category: "Architectural" },
];
