import { port, ports } from "./_helpers";
import type { DeviceTemplate } from "../types";

export const templates: DeviceTemplate[] = [
  // Blackmagic Micro Converter SDI to HDMI
  {
    id: "c0a80101-0006-4000-8000-000000000006",
    deviceType: "converter",
    label: "BMD SDI→HDMI",
    manufacturer: "Blackmagic Design",
    modelNumber: "Micro Converter SDI to HDMI 3G",
    referenceUrl: "https://www.blackmagicdesign.com/products/microconverters/techspecs/W-CONU-12",
    searchTerms: ["blackmagic", "micro converter", "microconverter"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("SDI Loop", "sdi", "output"),
    ],
  },
  // Blackmagic Micro Converter HDMI to SDI
  {
    id: "c0a80101-0007-4000-8000-000000000007",
    deviceType: "converter",
    label: "BMD HDMI→SDI",
    manufacturer: "Blackmagic Design",
    modelNumber: "Micro Converter HDMI to SDI 3G",
    referenceUrl: "https://www.blackmagicdesign.com/products/microconverters/techspecs/W-CONU-11",
    searchTerms: ["blackmagic", "micro converter", "microconverter"],
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("SDI Out", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
    ],
  },
  // Decimator MD-LX — Bidirectional SDI/HDMI Cross Converter
  {
    id: "c0a80101-0008-4000-8000-000000000008",
    deviceType: "converter",
    label: "Decimator MD-LX",
    manufacturer: "Decimator Design",
    modelNumber: "MD-LX",
    referenceUrl: "https://decimator.com/Products/MiniConverters/MD-LX/MD-LX.html",
    searchTerms: ["decimator", "cross converter", "bidirectional"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  // Blackmagic Micro Converter BiDirectional SDI/HDMI 3G
  {
    id: "c0a80101-0009-4000-8000-000000000009",
    deviceType: "converter",
    label: "BMD BiDir SDI/HDMI 3G",
    manufacturer: "Blackmagic Design",
    modelNumber: "Micro Converter BiDirectional SDI/HDMI 3G",
    referenceUrl: "https://www.blackmagicdesign.com/products/microconverters/techspecs/W-CONU-09",
    searchTerms: ["blackmagic", "micro converter", "bidirectional", "3g"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  // AJA FiDO-4T — Quad SDI to Fiber Transmitter
  {
    id: "c0a80101-000a-4000-8000-000000000010",
    deviceType: "converter",
    label: "AJA FiDO-4T",
    manufacturer: "AJA",
    modelNumber: "FiDO-4T",
    referenceUrl: "https://www.aja.com/products/fido-4t",
    searchTerms: ["aja", "fido", "fiber", "transmitter", "quad"],
    ports: [
      port("SDI In 1", "sdi", "input"),
      port("SDI In 2", "sdi", "input"),
      port("SDI In 3", "sdi", "input"),
      port("SDI In 4", "sdi", "input"),
      port("Fiber Out 1", "fiber", "output"),
      port("Fiber Out 2", "fiber", "output"),
      port("Fiber Out 3", "fiber", "output"),
      port("Fiber Out 4", "fiber", "output"),
    ],
  },
  // AJA FiDO-4R — Quad Fiber to SDI Receiver
  {
    id: "c0a80101-000b-4000-8000-000000000011",
    deviceType: "converter",
    label: "AJA FiDO-4R",
    manufacturer: "AJA",
    modelNumber: "FiDO-4R",
    referenceUrl: "https://www.aja.com/products/fido-4r",
    searchTerms: ["aja", "fido", "fiber", "receiver", "quad"],
    ports: [
      port("Fiber In 1", "fiber", "input"),
      port("Fiber In 2", "fiber", "input"),
      port("Fiber In 3", "fiber", "input"),
      port("Fiber In 4", "fiber", "input"),
      port("SDI Out 1", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
      port("SDI Out 3", "sdi", "output"),
      port("SDI Out 4", "sdi", "output"),
    ],
  },
  // AJA FiDO-T — Single SDI to Fiber Transmitter
  {
    id: "c0a80101-000c-4000-8000-000000000012",
    deviceType: "converter",
    label: "AJA FiDO-T",
    manufacturer: "AJA",
    modelNumber: "FiDO-T",
    referenceUrl: "https://www.aja.com/products/fido-t",
    searchTerms: ["aja", "fido", "fiber", "transmitter", "single"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("Fiber Out", "fiber", "output"),
      port("SDI Loop", "sdi", "output"),
    ],
  },
  // AJA FiDO-R — Single Fiber to SDI Receiver
  {
    id: "c0a80101-000d-4000-8000-000000000013",
    deviceType: "converter",
    label: "AJA FiDO-R",
    manufacturer: "AJA",
    modelNumber: "FiDO-R",
    referenceUrl: "https://www.aja.com/products/fido-r",
    searchTerms: ["aja", "fido", "fiber", "receiver", "single"],
    ports: [
      port("Fiber In", "fiber", "input"),
      port("SDI Out 1", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
    ],
  },
  // Datavideo DAC-70 — Cross Converter
  {
    id: "c0a80101-000e-4000-8000-000000000014",
    deviceType: "converter",
    label: "Datavideo DAC-70",
    manufacturer: "Datavideo",
    modelNumber: "DAC-70",
    referenceUrl: "https://www.datavideo.com/us/product/DAC-70",
    searchTerms: ["datavideo", "cross converter", "dac", "vga"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("VGA In", "vga", "input"),
      port("SDI Out 1", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("SDI Loop", "sdi", "output"),
      port("AC Power", "power", "input"),
    
      port("Audio In L", "analog-audio", "input", "rca"),
    
      port("Audio In R", "analog-audio", "input", "rca"),
    ],
  },
  // Decimator MD-HX — Scaler / Cross Converter
  {
    id: "c0a80101-000f-4000-8000-000000000015",
    deviceType: "scaler",
    label: "Decimator MD-HX",
    manufacturer: "Decimator Design",
    modelNumber: "MD-HX",
    referenceUrl: "https://decimator.com/Products/MiniConverters/MD-HX/MD-HX.html",
    searchTerms: ["decimator", "cross converter", "scaler", "upconverter", "downconverter"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Out 1", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  // Extron DSC 301 HD — Presentation Scaler
  {
    id: "c0a80101-0010-4000-8000-000000000016",
    deviceType: "scaler",
    label: "Extron DSC 301 HD",
    manufacturer: "Extron",
    modelNumber: "DSC 301 HD",
    referenceUrl: "https://www.extron.com/product/dsc301hd",
    searchTerms: ["extron", "presentation scaler", "vga", "scan converter"],
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("VGA In", "vga", "input"),
      port("Composite In", "composite", "input"),
      port("Audio In 1", "analog-audio", "input"),
      port("Audio In 2", "analog-audio", "input"),
      port("Audio In 3", "analog-audio", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("RS-232", "serial", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  // Converter
  {
    id: "c0a80101-0011-4000-8000-000000000017",
    deviceType: "converter",
    label: "Converter",
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  // Multiviewer
  {
    id: "c0a80101-0018-4000-8000-000000000024",
    deviceType: "multiviewer",
    label: "Multiviewer",
    ports: [
      port("SDI In 1", "sdi", "input"),
      port("SDI In 2", "sdi", "input"),
      port("SDI In 3", "sdi", "input"),
      port("SDI In 4", "sdi", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("SDI Out", "sdi", "output"),
      port("AC Power", "power", "input"),
    ],
  },
  // Frame Sync
  {
    id: "c0a80101-0019-4000-8000-000000000025",
    deviceType: "frame-sync",
    label: "Frame Sync",
    ports: [
      port("SDI In", "sdi", "input"),
      port("Ref In", "genlock", "input"),
      port("SDI Out", "sdi", "output"),
    
      port("AC Power", "power", "input"),
    ],
  },
  // Thunderbolt to HDMI Adapter
  {
    id: "c0a80101-001e-4000-8000-000000000030",
    deviceType: "adapter",
    label: "TB → HDMI Adapter",
    searchTerms: ["thunderbolt", "usb-c", "dongle"],
    ports: [
      port("TB In", "thunderbolt", "input"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  // Blackmagic UltraStudio 4K Mini
  {
    id: "c0a80101-001f-4000-8000-000000000031",
    deviceType: "adapter",
    label: "BMD UltraStudio 4K Mini",
    manufacturer: "Blackmagic Design",
    modelNumber: "UltraStudio 4K Mini",
    referenceUrl: "https://www.blackmagicdesign.com/products/ultrastudio/techspecs/W-DLUS-11",
    searchTerms: ["blackmagic", "ultrastudio", "capture", "playback", "thunderbolt"],
    ports: [
      port("SDI In 1", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Out 1", "sdi", "output"),
      port("SDI Loop", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("Thunderbolt 3", "thunderbolt", "bidirectional"),
      port("RS-422", "rs422", "bidirectional"),
    
      port("Ref In", "genlock", "input"),
    
      port("Analog In", "analog-audio", "input", "trs-quarter"),
    
      port("Analog Out", "analog-audio", "output", "trs-quarter"),
    
      port("XLR Mic In", "analog-audio", "input"),
    
      port("AC Power", "power", "input", "iec"),
    ],
  },
  // ── Converters & DAs (12G upgrades + new) ────────────────────────
  {
    id: "c0a80101-0052-4000-8000-000000000082",
    deviceType: "converter",
    label: "BMD SDI→HDMI 12G",
    manufacturer: "Blackmagic Design",
    modelNumber: "Micro Converter SDI to HDMI 12G",
    referenceUrl: "https://www.blackmagicdesign.com/products/microconverters",
    searchTerms: ["blackmagic", "micro converter", "12g", "sdi to hdmi"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("SDI Loop", "sdi", "output"),
    ],
  },
  {
    id: "c0a80101-0053-4000-8000-000000000083",
    deviceType: "converter",
    label: "BMD HDMI→SDI 12G",
    manufacturer: "Blackmagic Design",
    modelNumber: "Micro Converter HDMI to SDI 12G",
    referenceUrl: "https://www.blackmagicdesign.com/products/microconverters",
    searchTerms: ["blackmagic", "micro converter", "12g", "hdmi to sdi"],
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("SDI Out 1", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
    ],
  },
  {
    id: "c0a80101-0054-4000-8000-000000000084",
    deviceType: "converter",
    label: "BMD BiDir SDI/HDMI 12G",
    manufacturer: "Blackmagic Design",
    modelNumber: "Micro Converter BiDirectional SDI/HDMI 12G",
    referenceUrl: "https://www.blackmagicdesign.com/products/microconverters",
    searchTerms: ["blackmagic", "micro converter", "bidirectional", "12g"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  {
    id: "c0a80101-0057-4000-8000-000000000087",
    deviceType: "converter",
    label: "BMD Teranex SDI→HDMI 12G",
    manufacturer: "Blackmagic Design",
    modelNumber: "Teranex Mini SDI to HDMI 12G",
    referenceUrl: "https://www.blackmagicdesign.com/products/teranexmini",
    searchTerms: ["blackmagic", "teranex", "sdi to hdmi", "12g"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("SDI Loop", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("Analog Out L", "analog-audio", "output"),
      port("Analog Out R", "analog-audio", "output"),
      port("AES Out", "aes", "output"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-0058-4000-8000-000000000088",
    deviceType: "converter",
    label: "BMD Teranex HDMI→SDI 12G",
    manufacturer: "Blackmagic Design",
    modelNumber: "Teranex Mini HDMI to SDI 12G",
    referenceUrl: "https://www.blackmagicdesign.com/products/teranexmini",
    searchTerms: ["blackmagic", "teranex", "hdmi to sdi", "12g"],
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("SDI Out", "sdi", "output"),
      port("SDI Monitor", "sdi", "output"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-0059-4000-8000-000000000089",
    deviceType: "converter",
    label: "AJA Hi5-12G",
    manufacturer: "AJA",
    modelNumber: "Hi5-12G",
    referenceUrl: "https://www.aja.com/products/hi5-12g",
    searchTerms: ["aja", "hi5", "12g", "sdi to hdmi"],
    ports: [
      port("12G-SDI In", "sdi", "input"),
      port("SDI Loop", "sdi", "output"),
      port("HDMI 2.0 Out", "hdmi", "output"),
      port("Fiber In", "fiber", "input", "sfp"),
    
      port("Analog Out L", "analog-audio", "output", "rca"),
    
      port("Analog Out R", "analog-audio", "output", "rca"),
    ],
  },
  {
    id: "c0a80101-005a-4000-8000-000000000090",
    deviceType: "converter",
    label: "AJA HA5-12G",
    manufacturer: "AJA",
    modelNumber: "HA5-12G",
    referenceUrl: "https://www.aja.com/products/ha5-12g",
    searchTerms: ["aja", "ha5", "12g", "hdmi to sdi"],
    ports: [
      port("HDMI 2.0 In", "hdmi", "input"),
      port("12G-SDI Out 1", "sdi", "output"),
      port("12G-SDI Out 2", "sdi", "output"),
      port("Fiber Out", "fiber", "output", "sfp"),
    
      port("Analog In L", "analog-audio", "input", "rca"),
    
      port("Analog In R", "analog-audio", "input", "rca"),
    ],
  },
  {
    id: "c0a80101-005b-4000-8000-000000000091",
    deviceType: "frame-sync",
    label: "AJA FS-HDR",
    manufacturer: "AJA",
    modelNumber: "FS-HDR",
    referenceUrl: "https://www.aja.com/products/fs-hdr",
    searchTerms: ["aja", "fs-hdr", "hdr", "frame sync", "converter", "wcg"],
    ports: [
      ...ports("SDI In", "sdi", "input", 4),
      ...ports("SDI Out", "sdi", "output", 4),
      port("HDMI Monitor", "hdmi", "output"),
      port("Ref In", "genlock", "input"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-005c-4000-8000-000000000092",
    deviceType: "converter",
    label: "Decimator MD-CROSS",
    manufacturer: "Decimator Design",
    modelNumber: "MD-CROSS",
    referenceUrl: "https://decimator.com/Products/MiniConverters/MD-CROSS/MD-CROSS.html",
    searchTerms: ["decimator", "cross converter", "md-cross"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Out 1", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  // ── Multiviewers ─────────────────────────────────────────────────
  {
    id: "c0a80101-005d-4000-8000-000000000093",
    deviceType: "multiviewer",
    label: "BMD MultiView 4",
    manufacturer: "Blackmagic Design",
    modelNumber: "MultiView 4",
    referenceUrl: "https://www.blackmagicdesign.com/products/multiview",
    searchTerms: ["blackmagic", "multiview", "4 input", "quad"],
    ports: [
      ...ports("SDI In", "sdi", "input", 4),
      port("SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("AC Power", "power", "input"),
    
      port("SDI Loop 1", "sdi", "output"),
    
      port("SDI Loop 2", "sdi", "output"),
    
      port("SDI Loop 3", "sdi", "output"),
    
      port("SDI Loop 4", "sdi", "output"),
    ],
  },
  {
    id: "c0a80101-005e-4000-8000-000000000094",
    deviceType: "multiviewer",
    label: "BMD MultiView 16",
    manufacturer: "Blackmagic Design",
    modelNumber: "MultiView 16",
    referenceUrl: "https://www.blackmagicdesign.com/products/multiview",
    searchTerms: ["blackmagic", "multiview", "16 input"],
    ports: [
      ...ports("SDI In", "sdi", "input", 16),
      port("SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("AC Power", "power", "input"),
    
      port("SDI MV Out 2", "sdi", "output"),
    
      port("SDI MV Out 3", "sdi", "output"),
    
      port("SDI MV Out 4", "sdi", "output"),
    
      port("Ref In", "genlock", "input"),
    ],
  },
  {
    id: "c0a80101-005f-4000-8000-000000000095",
    deviceType: "multiviewer",
    label: "Decimator DMON-QUAD",
    manufacturer: "Decimator Design",
    modelNumber: "DMON-QUAD",
    referenceUrl: "https://decimator.com/Products/MultiViewers/DMON-QUAD/DMON-QUAD.html",
    searchTerms: ["decimator", "dmon", "quad", "multiviewer"],
    ports: [
      ...ports("SDI In", "sdi", "input", 4),
      ...ports("SDI Loop", "sdi", "output", 4),
      port("SDI MV Out", "sdi", "output"),
      port("HDMI MV Out", "hdmi", "output"),
    ],
  },
  {
    id: "c0a80101-0060-4000-8000-000000000096",
    deviceType: "multiviewer",
    label: "Decimator DMON-4S",
    manufacturer: "Decimator Design",
    modelNumber: "DMON-4S",
    referenceUrl: "https://decimator.com/Products/MultiViewers/DMON-4S/DMON-4S.html",
    searchTerms: ["decimator", "dmon", "4s", "multiviewer"],
    ports: [
      ...ports("SDI In", "sdi", "input", 4),
      ...ports("SDI Pass", "sdi", "output", 4),
      port("SDI MV Out", "sdi", "output"),
    ],
  },
  {
    id: "c0a80101-0061-4000-8000-000000000097",
    deviceType: "multiviewer",
    label: "Decimator DMON-16S",
    manufacturer: "Decimator Design",
    modelNumber: "DMON-16S",
    referenceUrl: "https://decimator.com/Products/MultiViewers/DMON-16S/DMON-16S.html",
    searchTerms: ["decimator", "dmon", "16s", "16 input", "multiviewer"],
    ports: [
      ...ports("SDI In", "sdi", "input", 16),
      ...ports("SDI Pass", "sdi", "output", 16),
      port("SDI MV Out 1", "sdi", "output"),
      port("SDI MV Out 2", "sdi", "output"),
      port("AC Power", "power", "input"),
    
      port("HDMI MV Out", "hdmi", "output"),
    ],
  },
  // ── Capture Cards ────────────────────────────────────────────────
  {
    id: "c0a80101-006f-4000-8000-000000000111",
    deviceType: "capture-card",
    label: "BMD DeckLink SDI 4K",
    manufacturer: "Blackmagic Design",
    modelNumber: "DeckLink SDI 4K",
    referenceUrl: "https://www.blackmagicdesign.com/products/decklink",
    searchTerms: ["blackmagic", "decklink", "pcie", "capture"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("SDI Out", "sdi", "output"),
    
      port("Ref In", "genlock", "input"),
    
      port("RS-422", "rs422", "bidirectional", "other"),
    ],
  },
  {
    id: "c0a80101-0070-4000-8000-000000000112",
    deviceType: "capture-card",
    label: "BMD DeckLink Duo 2",
    manufacturer: "Blackmagic Design",
    modelNumber: "DeckLink Duo 2",
    referenceUrl: "https://www.blackmagicdesign.com/products/decklink",
    searchTerms: ["blackmagic", "decklink", "duo", "pcie", "4 channel"],
    ports: [
      ...ports("SDI", "sdi", "bidirectional", 4),
    
      port("Ref In", "genlock", "input"),
    ],
  },
  {
    id: "c0a80101-0071-4000-8000-000000000113",
    deviceType: "capture-card",
    label: "BMD DeckLink Quad 2",
    manufacturer: "Blackmagic Design",
    modelNumber: "DeckLink Quad 2",
    referenceUrl: "https://www.blackmagicdesign.com/products/decklink",
    searchTerms: ["blackmagic", "decklink", "quad", "pcie", "8 channel"],
    ports: [
      ...ports("SDI", "sdi", "bidirectional", 8),
    
      port("Ref In", "genlock", "input"),
    ],
  },
  {
    id: "c0a80101-0072-4000-8000-000000000114",
    deviceType: "capture-card",
    label: "BMD UltraStudio 4K Extreme 3",
    manufacturer: "Blackmagic Design",
    modelNumber: "UltraStudio 4K Extreme 3",
    referenceUrl: "https://www.blackmagicdesign.com/products/ultrastudio",
    searchTerms: ["blackmagic", "ultrastudio", "extreme", "thunderbolt", "capture"],
    ports: [
      port("12G-SDI In 1", "sdi", "input"),
      port("12G-SDI In 2", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("12G-SDI Out 1", "sdi", "output"),
      port("12G-SDI Out 2", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("Thunderbolt 3", "thunderbolt", "bidirectional"),
      port("Ref In", "genlock", "input"),
      port("RS-422", "rs422", "bidirectional"),
      port("Analog In", "analog-audio", "input"),
      port("Analog Out", "analog-audio", "output"),
      port("AES In", "aes", "input"),
      port("AES Out", "aes", "output"),
      port("AC Power", "power", "input"),
    
      port("6G-SDI In 1", "sdi", "input"),
    
      port("6G-SDI In 2", "sdi", "input"),
    
      port("Thunderbolt 3 (2)", "thunderbolt", "bidirectional", "usb-c"),
    
      port("Timecode In", "genlock", "input", "xlr-3"),
    
      port("Timecode Out", "genlock", "output", "xlr-3"),
    
      port("RS-422 (2)", "rs422", "bidirectional", "other"),
    ],
  },
  // ── Generic Adapters ─────────────────────────────────────────────
  {
    id: "c0a80101-00c8-4000-8000-000000000200",
    deviceType: "adapter",
    label: "USB-C → HDMI Adapter",
    searchTerms: ["usb-c", "hdmi", "dongle", "adapter"],
    ports: [
      port("USB-C In", "usb", "input", "usb-c"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  {
    id: "c0a80101-00c9-4000-8000-000000000201",
    deviceType: "adapter",
    label: "USB-C → DP Adapter",
    searchTerms: ["usb-c", "displayport", "dongle", "adapter"],
    ports: [
      port("USB-C In", "usb", "input", "usb-c"),
      port("DP Out", "displayport", "output"),
    ],
  },
  {
    id: "c0a80101-00ca-4000-8000-000000000202",
    deviceType: "adapter",
    label: "HDMI → DVI Adapter",
    searchTerms: ["hdmi", "dvi", "adapter"],
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("DVI Out", "hdmi", "output", "other"),
    ],
  },
  {
    id: "c0a80101-00cb-4000-8000-000000000203",
    deviceType: "adapter",
    label: "Mini DP → DP Adapter",
    searchTerms: ["mini displayport", "displayport", "adapter", "mdp"],
    ports: [
      port("Mini DP In", "displayport", "input", "other"),
      port("DP Out", "displayport", "output"),
    ],
  },
  {
    id: "c0a80101-00cc-4000-8000-000000000204",
    deviceType: "adapter",
    label: "DP → HDMI Adapter",
    searchTerms: ["displayport", "hdmi", "adapter"],
    ports: [
      port("DP In", "displayport", "input"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  {
    id: "c0a80101-00cd-4000-8000-000000000205",
    deviceType: "adapter",
    label: "BNC Barrel / SDI Coupler",
    searchTerms: ["bnc", "barrel", "coupler", "sdi", "adapter"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("SDI Out", "sdi", "output"),
    ],
  },
  {
    id: "c0a80101-00f8-4000-8000-000000000324",
    deviceType: "adapter",
    label: "TB → Ethernet Adapter",
    searchTerms: ["thunderbolt", "usb-c", "ethernet", "dongle", "network"],
    ports: [
      port("TB In", "thunderbolt", "input"),
      port("Ethernet Out", "ethernet", "output"),
    ],
  },
  {
    id: "c0a80101-00fe-4000-8000-000000000330",
    deviceType: "converter",
    category: "converters",
    label: "BMD Mini Converter Optical Fiber 12G",
    manufacturer: "Blackmagic Design",
    modelNumber: "Mini Converter Optical Fiber 12G",
    referenceUrl: "https://www.blackmagicdesign.com/products/miniconverters",
    searchTerms: ["blackmagic", "mini converter", "optical", "fiber", "12g", "sdi"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("SDI Out", "sdi", "output"),
      port("Fiber In", "fiber", "input"),
      port("Fiber Out", "fiber", "output"),
      port("AC Power", "power", "input"),
    ],
  },
];
