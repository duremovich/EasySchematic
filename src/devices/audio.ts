import { port, ports } from "./_helpers";
import type { DeviceTemplate } from "../types";

export const templates: DeviceTemplate[] = [
  // Audio Mixer
  {
    id: "c0a80101-0005-4000-8000-000000000005",
    deviceType: "audio-mixer",
    label: "Audio Mixer",
    ports: [
      port("Analog In 1", "analog-audio", "input"),
      port("Analog In 2", "analog-audio", "input"),
      port("Dante In", "dante", "input"),
      port("AES In", "aes", "input"),
      port("PGM Out", "analog-audio", "output"),
      port("AUX Out", "analog-audio", "output"),
      port("Dante Out", "dante", "output"),
      port("AES Out", "aes", "output"),
      port("AC Power", "power", "input"),
    ],
  },
  // Audio Embedders / De-Embedders
  // BMD Teranex Mini SDI to Audio 12G — Audio De-Embedder
  {
    id: "c0a80101-0031-4000-8000-000000000049",
    deviceType: "audio-embedder",
    label: "BMD SDI→Audio 12G",
    manufacturer: "Blackmagic Design",
    modelNumber: "Teranex Mini SDI to Audio 12G",
    referenceUrl: "https://www.blackmagicdesign.com/products/teranexmini/techspecs/W-TERAMIN-05",
    searchTerms: ["blackmagic", "teranex", "de-embedder", "deembed", "audio extract"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("SDI Loop", "sdi", "output"),
      port("Analog Out L", "analog-audio", "output"),
      port("Analog Out R", "analog-audio", "output"),
      port("AES Out 1-2", "aes", "output"),
      port("AES Out 3-4", "aes", "output"),
      port("AC Power", "power", "input"),
    
      port("S/PDIF Out", "spdif", "output", "toslink"),
    ],
  },
  // BMD Teranex Mini Audio to SDI 12G — Audio Embedder
  {
    id: "c0a80101-0032-4000-8000-000000000050",
    deviceType: "audio-embedder",
    label: "BMD Audio→SDI 12G",
    manufacturer: "Blackmagic Design",
    modelNumber: "Teranex Mini Audio to SDI 12G",
    referenceUrl: "https://www.blackmagicdesign.com/products/teranexmini/techspecs/W-TERAMIN-06",
    searchTerms: ["blackmagic", "teranex", "embedder", "audio embed"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("Analog In L", "analog-audio", "input"),
      port("Analog In R", "analog-audio", "input"),
      port("AES In 1-2", "aes", "input"),
      port("AES In 3-4", "aes", "input"),
      port("SDI Out", "sdi", "output"),
      port("AC Power", "power", "input"),
    
      port("S/PDIF In", "spdif", "input", "toslink"),
    ],
  },
  // Wireless Microphone Receivers
  // Shure ULXD4Q — Quad Wireless Mic Receiver
  {
    id: "c0a80101-0035-4000-8000-000000000053",
    deviceType: "wireless-mic-receiver",
    label: "Shure ULXD4Q",
    manufacturer: "Shure",
    modelNumber: "ULXD4Q",
    referenceUrl: "https://www.shure.com/en-US/products/wireless-systems/ulx-d_digital_wireless/ulxd4q",
    searchTerms: ["shure", "ulx-d", "wireless", "microphone", "receiver", "quad"],
    ports: [
      port("Analog Out 1", "analog-audio", "output"),
      port("Analog Out 2", "analog-audio", "output"),
      port("Analog Out 3", "analog-audio", "output"),
      port("Analog Out 4", "analog-audio", "output"),
      port("Dante 1", "dante", "bidirectional"),
      port("Dante 2", "dante", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("AES Out 1-2", "aes", "output"),
    
      port("AES Out 3-4", "aes", "output"),
    ],
  },
  // Sennheiser EW-DX EM 4 Dante — Quad Wireless Mic Receiver
  {
    id: "c0a80101-0036-4000-8000-000000000054",
    deviceType: "wireless-mic-receiver",
    label: "Sennheiser EW-DX EM 4",
    manufacturer: "Sennheiser",
    modelNumber: "EW-DX EM 4 Dante",
    referenceUrl: "https://www.sennheiser.com/en-us/catalog/products/wireless-systems/ew-dx-em-4-dante/ew-dx-em-4-dante-q1-9-509370",
    searchTerms: ["sennheiser", "ew-dx", "wireless", "microphone", "receiver", "dante"],
    ports: [
      port("Analog Out 1", "analog-audio", "output"),
      port("Analog Out 2", "analog-audio", "output"),
      port("Analog Out 3", "analog-audio", "output"),
      port("Analog Out 4", "analog-audio", "output"),
      port("Dante 1", "dante", "bidirectional"),
      port("Dante 2", "dante", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  // Audio Interfaces
  // Focusrite RedNet A16R MkII — Dante Audio Interface
  {
    id: "c0a80101-0037-4000-8000-000000000055",
    deviceType: "audio-interface",
    label: "Focusrite RedNet A16R",
    manufacturer: "Focusrite",
    modelNumber: "RedNet A16R MkII",
    referenceUrl: "https://us.focusrite.com/products/rednet-a16r-mkii",
    searchTerms: ["focusrite", "rednet", "dante", "audio interface", "a16r"],
    ports: [
      port("Analog In 1-8", "analog-audio", "input", "db25"),
      port("Analog In 9-16", "analog-audio", "input", "db25"),
      port("AES In", "aes", "input"),
      port("Analog Out 1-8", "analog-audio", "output", "db25"),
      port("Analog Out 9-16", "analog-audio", "output", "db25"),
      port("AES Out", "aes", "output"),
      port("Dante Primary", "dante", "bidirectional", "ethercon"),
      port("Dante Secondary", "dante", "bidirectional", "ethercon"),
      port("Word Clock In", "genlock", "input"),
      port("Word Clock Out", "genlock", "output"),
      port("AC Power", "power", "input"),
    ],
  },
  // ── Audio Consoles ───────────────────────────────────────────────
  {
    id: "c0a80101-008b-4000-8000-000000000139",
    deviceType: "audio-mixer",
    label: "Yamaha CL5",
    manufacturer: "Yamaha",
    modelNumber: "CL5",
    referenceUrl: "https://usa.yamaha.com/products/proaudio/mixers/cl_series/index.html",
    searchTerms: ["yamaha", "cl5", "digital console", "72 channel"],
    slots: [
      { id: "cl5-my-1", label: "MY Slot 1", slotFamily: "yamaha-my" },
      { id: "cl5-my-2", label: "MY Slot 2", slotFamily: "yamaha-my" },
      { id: "cl5-my-3", label: "MY Slot 3", slotFamily: "yamaha-my" },
    ],
    ports: [
      ...ports("OMNI In", "analog-audio", "input", 8),
      ...ports("OMNI Out", "analog-audio", "output", 8),
      port("AES In", "aes", "input"),
      port("AES Out", "aes", "output"),
      port("Dante Primary", "dante", "bidirectional"),
      port("Dante Secondary", "dante", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("Headphone", "analog-audio", "output", "trs-quarter"),
    
      port("Word Clock In", "genlock", "input"),
    
      port("Word Clock Out", "genlock", "output"),
    
      port("Talkback In", "analog-audio", "input"),
    ],
  },
  {
    id: "c0a80101-008c-4000-8000-000000000140",
    deviceType: "audio-mixer",
    label: "Yamaha CL3",
    manufacturer: "Yamaha",
    modelNumber: "CL3",
    referenceUrl: "https://usa.yamaha.com/products/proaudio/mixers/cl_series/index.html",
    searchTerms: ["yamaha", "cl3", "digital console", "64 channel"],
    slots: [
      { id: "cl3-my-1", label: "MY Slot 1", slotFamily: "yamaha-my" },
      { id: "cl3-my-2", label: "MY Slot 2", slotFamily: "yamaha-my" },
      { id: "cl3-my-3", label: "MY Slot 3", slotFamily: "yamaha-my" },
    ],
    ports: [
      ...ports("OMNI In", "analog-audio", "input", 8),
      ...ports("OMNI Out", "analog-audio", "output", 8),
      port("AES In", "aes", "input"),
      port("AES Out", "aes", "output"),
      port("Dante Primary", "dante", "bidirectional"),
      port("Dante Secondary", "dante", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("Headphone", "analog-audio", "output", "trs-quarter"),
    
      port("Word Clock In", "genlock", "input"),
    
      port("Word Clock Out", "genlock", "output"),
    
      port("Talkback In", "analog-audio", "input"),
    ],
  },
  {
    id: "c0a80101-008d-4000-8000-000000000141",
    deviceType: "audio-mixer",
    label: "Yamaha CL1",
    manufacturer: "Yamaha",
    modelNumber: "CL1",
    referenceUrl: "https://usa.yamaha.com/products/proaudio/mixers/cl_series/index.html",
    searchTerms: ["yamaha", "cl1", "digital console", "48 channel"],
    slots: [
      { id: "cl1-my-1", label: "MY Slot 1", slotFamily: "yamaha-my" },
      { id: "cl1-my-2", label: "MY Slot 2", slotFamily: "yamaha-my" },
      { id: "cl1-my-3", label: "MY Slot 3", slotFamily: "yamaha-my" },
    ],
    ports: [
      ...ports("OMNI In", "analog-audio", "input", 8),
      ...ports("OMNI Out", "analog-audio", "output", 8),
      port("AES In", "aes", "input"),
      port("AES Out", "aes", "output"),
      port("Dante Primary", "dante", "bidirectional"),
      port("Dante Secondary", "dante", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("Headphone", "analog-audio", "output", "trs-quarter"),
    
      port("Word Clock In", "genlock", "input"),
    
      port("Word Clock Out", "genlock", "output"),
    
      port("Talkback In", "analog-audio", "input"),
    ],
  },
  {
    id: "c0a80101-008e-4000-8000-000000000142",
    deviceType: "audio-mixer",
    label: "Yamaha QL5",
    manufacturer: "Yamaha",
    modelNumber: "QL5",
    referenceUrl: "https://usa.yamaha.com/products/proaudio/mixers/ql_series/index.html",
    searchTerms: ["yamaha", "ql5", "digital console", "32 channel"],
    slots: [
      { id: "ql5-my-1", label: "MY Slot 1", slotFamily: "yamaha-my" },
      { id: "ql5-my-2", label: "MY Slot 2", slotFamily: "yamaha-my" },
    ],
    ports: [
      ...ports("Analog In", "analog-audio", "input", 32),
      ...ports("Analog Out", "analog-audio", "output", 8),
      port("AES In", "aes", "input"),
      port("AES Out", "aes", "output"),
      port("Dante Primary", "dante", "bidirectional"),
      port("Dante Secondary", "dante", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("Headphone", "analog-audio", "output", "trs-quarter"),
    
      port("Word Clock In", "genlock", "input"),
    
      port("Word Clock Out", "genlock", "output"),
    ],
  },
  {
    id: "c0a80101-008f-4000-8000-000000000143",
    deviceType: "audio-mixer",
    label: "Yamaha QL1",
    manufacturer: "Yamaha",
    modelNumber: "QL1",
    referenceUrl: "https://usa.yamaha.com/products/proaudio/mixers/ql_series/index.html",
    searchTerms: ["yamaha", "ql1", "digital console", "16 channel"],
    slots: [
      { id: "ql1-my-1", label: "MY Slot 1", slotFamily: "yamaha-my" },
      { id: "ql1-my-2", label: "MY Slot 2", slotFamily: "yamaha-my" },
    ],
    ports: [
      ...ports("Analog In", "analog-audio", "input", 16),
      ...ports("Analog Out", "analog-audio", "output", 8),
      port("AES In", "aes", "input"),
      port("AES Out", "aes", "output"),
      port("Dante Primary", "dante", "bidirectional"),
      port("Dante Secondary", "dante", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("Headphone", "analog-audio", "output", "trs-quarter"),
    
      port("Word Clock In", "genlock", "input"),
    
      port("Word Clock Out", "genlock", "output"),
    ],
  },
  {
    id: "c0a80101-0090-4000-8000-000000000144",
    deviceType: "audio-mixer",
    label: "Yamaha TF5",
    manufacturer: "Yamaha",
    modelNumber: "TF5",
    referenceUrl: "https://usa.yamaha.com/products/proaudio/mixers/tf/index.html",
    searchTerms: ["yamaha", "tf5", "digital console", "32 channel", "touchflow"],
    ports: [
      ...ports("Analog In", "analog-audio", "input", 32),
      ...ports("Analog Out", "analog-audio", "output", 16),
      port("Dante", "dante", "bidirectional"),
      port("USB", "usb", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("RCA In L", "analog-audio", "input", "rca"),
    
      port("RCA In R", "analog-audio", "input", "rca"),
    
      port("Headphone", "analog-audio", "output", "trs-quarter"),
    ],
  },
  {
    id: "c0a80101-0091-4000-8000-000000000145",
    deviceType: "audio-mixer",
    label: "Yamaha TF3",
    manufacturer: "Yamaha",
    modelNumber: "TF3",
    referenceUrl: "https://usa.yamaha.com/products/proaudio/mixers/tf/index.html",
    searchTerms: ["yamaha", "tf3", "digital console", "24 channel"],
    ports: [
      ...ports("Analog In", "analog-audio", "input", 24),
      ...ports("Analog Out", "analog-audio", "output", 16),
      port("Dante", "dante", "bidirectional"),
      port("USB", "usb", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("RCA In L", "analog-audio", "input", "rca"),
    
      port("RCA In R", "analog-audio", "input", "rca"),
    
      port("Headphone", "analog-audio", "output", "trs-quarter"),
    ],
  },
  {
    id: "c0a80101-0092-4000-8000-000000000146",
    deviceType: "audio-mixer",
    label: "Yamaha TF1",
    manufacturer: "Yamaha",
    modelNumber: "TF1",
    referenceUrl: "https://usa.yamaha.com/products/proaudio/mixers/tf/index.html",
    searchTerms: ["yamaha", "tf1", "digital console", "16 channel"],
    ports: [
      ...ports("Analog In", "analog-audio", "input", 16),
      ...ports("Analog Out", "analog-audio", "output", 16),
      port("Dante", "dante", "bidirectional"),
      port("USB", "usb", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("RCA In L", "analog-audio", "input", "rca"),
    
      port("RCA In R", "analog-audio", "input", "rca"),
    
      port("Headphone", "analog-audio", "output", "trs-quarter"),
    ],
  },
  {
    id: "c0a80101-0093-4000-8000-000000000147",
    deviceType: "audio-mixer",
    label: "A&H dLive S7000",
    manufacturer: "Allen & Heath",
    modelNumber: "dLive S7000",
    referenceUrl: "https://www.allen-heath.com/hardware/dlive/dlive-s-class/s7000/",
    searchTerms: ["allen heath", "dlive", "s7000", "digital console"],
    ports: [
      port("SLink 1", "fiber", "bidirectional"),
      port("SLink 2", "fiber", "bidirectional"),
      port("SLink 3", "fiber", "bidirectional"),
      port("Word Clock", "genlock", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("AES In 1", "aes", "input"),
    
      port("AES In 2", "aes", "input"),
    
      port("AES Out 1", "aes", "output"),
    
      port("AES Out 2", "aes", "output"),
    
      port("AES Out 3", "aes", "output"),
    
      port("Analog In 1", "analog-audio", "input"),
    
      port("Analog In 2", "analog-audio", "input"),
    
      port("Analog In 3", "analog-audio", "input"),
    
      port("Analog In 4", "analog-audio", "input"),
    
      port("Analog In 5", "analog-audio", "input"),
    
      port("Analog In 6", "analog-audio", "input"),
    
      port("Analog In 7", "analog-audio", "input"),
    
      port("Analog In 8", "analog-audio", "input"),
    
      port("Analog Out 1", "analog-audio", "output"),
    
      port("Analog Out 2", "analog-audio", "output"),
    
      port("Analog Out 3", "analog-audio", "output"),
    
      port("Analog Out 4", "analog-audio", "output"),
    
      port("Analog Out 5", "analog-audio", "output"),
    
      port("Analog Out 6", "analog-audio", "output"),
    
      port("Analog Out 7", "analog-audio", "output"),
    
      port("Analog Out 8", "analog-audio", "output"),
    ],
  },
  {
    id: "c0a80101-0094-4000-8000-000000000148",
    deviceType: "audio-mixer",
    label: "A&H SQ-7",
    manufacturer: "Allen & Heath",
    modelNumber: "SQ-7",
    referenceUrl: "https://www.allen-heath.com/hardware/sq/sq-7/",
    searchTerms: ["allen heath", "sq7", "digital console", "32 channel"],
    ports: [
      ...ports("Analog In", "analog-audio", "input", 32),
      ...ports("Analog Out", "analog-audio", "output", 12),
      port("SLink", "fiber", "bidirectional"),
      port("USB", "usb", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("AES Out", "aes", "output"),
    
      port("ST1 In L", "analog-audio", "input", "trs-quarter"),
    
      port("ST1 In R", "analog-audio", "input", "trs-quarter"),
    
      port("ST2 In L", "analog-audio", "input", "trs-quarter"),
    
      port("ST2 In R", "analog-audio", "input", "trs-quarter"),
    
      port("ST3 In", "analog-audio", "input", "trs-eighth"),
    
      port("Headphone", "analog-audio", "output", "trs-quarter"),
    ],
  },
  {
    id: "c0a80101-0095-4000-8000-000000000149",
    deviceType: "audio-mixer",
    label: "A&H SQ-5",
    manufacturer: "Allen & Heath",
    modelNumber: "SQ-5",
    referenceUrl: "https://www.allen-heath.com/hardware/sq/sq-5/",
    searchTerms: ["allen heath", "sq5", "digital console", "16 channel"],
    ports: [
      ...ports("Analog In", "analog-audio", "input", 16),
      ...ports("Analog Out", "analog-audio", "output", 12),
      port("SLink", "fiber", "bidirectional"),
      port("USB", "usb", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("AES Out", "aes", "output"),
    
      port("ST1 In L", "analog-audio", "input", "trs-quarter"),
    
      port("ST1 In R", "analog-audio", "input", "trs-quarter"),
    
      port("ST2 In L", "analog-audio", "input", "trs-quarter"),
    
      port("ST2 In R", "analog-audio", "input", "trs-quarter"),
    
      port("ST3 In", "analog-audio", "input", "trs-eighth"),
    
      port("Headphone", "analog-audio", "output", "trs-quarter"),
    ],
  },
  {
    id: "c0a80101-0096-4000-8000-000000000150",
    deviceType: "audio-mixer",
    label: "DiGiCo SD7",
    manufacturer: "DiGiCo",
    modelNumber: "SD7",
    referenceUrl: "https://digico.biz/consoles/sd7/",
    searchTerms: ["digico", "sd7", "digital console", "flagship"],
    slots: [
      { id: "sd7-dmi-1", label: "DMI Slot 1", slotFamily: "digico-dmi" },
      { id: "sd7-dmi-2", label: "DMI Slot 2", slotFamily: "digico-dmi" },
    ],
    ports: [
      port("MADI 1", "madi", "bidirectional"),
      port("MADI 2", "madi", "bidirectional"),
      port("MADI 3", "madi", "bidirectional"),
      port("Optocore 1", "fiber", "bidirectional"),
      port("Optocore 2", "fiber", "bidirectional"),
      port("Dante", "dante", "bidirectional"),
      port("AES In", "aes", "input"),
      port("AES Out", "aes", "output"),
      port("Word Clock", "genlock", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("Analog In 1", "analog-audio", "input"),
    
      port("Analog In 2", "analog-audio", "input"),
    
      port("Analog In 3", "analog-audio", "input"),
    
      port("Analog In 4", "analog-audio", "input"),
    
      port("Analog In 5", "analog-audio", "input"),
    
      port("Analog In 6", "analog-audio", "input"),
    
      port("Analog In 7", "analog-audio", "input"),
    
      port("Analog In 8", "analog-audio", "input"),
    
      port("Analog In 9", "analog-audio", "input"),
    
      port("Analog In 10", "analog-audio", "input"),
    
      port("Analog In 11", "analog-audio", "input"),
    
      port("Analog In 12", "analog-audio", "input"),
    
      port("Analog Out 1", "analog-audio", "output"),
    
      port("Analog Out 2", "analog-audio", "output"),
    
      port("Analog Out 3", "analog-audio", "output"),
    
      port("Analog Out 4", "analog-audio", "output"),
    
      port("Analog Out 5", "analog-audio", "output"),
    
      port("Analog Out 6", "analog-audio", "output"),
    
      port("Analog Out 7", "analog-audio", "output"),
    
      port("Analog Out 8", "analog-audio", "output"),
    
      port("Analog Out 9", "analog-audio", "output"),
    
      port("Analog Out 10", "analog-audio", "output"),
    
      port("Analog Out 11", "analog-audio", "output"),
    
      port("Analog Out 12", "analog-audio", "output"),
    ],
  },
  // ── Audio Stage Boxes & DSP ──────────────────────────────────────
  {
    id: "c0a80101-0097-4000-8000-000000000151",
    deviceType: "stage-box",
    label: "Yamaha Rio3224-D2",
    manufacturer: "Yamaha",
    modelNumber: "Rio3224-D2",
    referenceUrl: "https://usa.yamaha.com/products/proaudio/interfaces/rio3224-d2/index.html",
    searchTerms: ["yamaha", "rio", "stage box", "dante", "32 channel"],
    ports: [
      ...ports("Analog In", "analog-audio", "input", 32),
      ...ports("Analog Out", "analog-audio", "output", 24),
      port("Dante Primary", "dante", "bidirectional"),
      port("Dante Secondary", "dante", "bidirectional"),
      port("Word Clock In", "genlock", "input"),
      port("Word Clock Out", "genlock", "output"),
      port("AC Power", "power", "input"),
    
      port("AES In", "aes", "input"),
    
      port("AES Out", "aes", "output"),
    ],
  },
  {
    id: "c0a80101-0098-4000-8000-000000000152",
    deviceType: "stage-box",
    label: "Yamaha Rio1608-D",
    manufacturer: "Yamaha",
    modelNumber: "Rio1608-D",
    referenceUrl: "https://usa.yamaha.com/products/proaudio/interfaces/rio1608-d2/index.html",
    searchTerms: ["yamaha", "rio", "stage box", "dante", "16 channel"],
    ports: [
      ...ports("Analog In", "analog-audio", "input", 16),
      ...ports("Analog Out", "analog-audio", "output", 8),
      port("Dante Primary", "dante", "bidirectional"),
      port("Dante Secondary", "dante", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-0099-4000-8000-000000000153",
    deviceType: "audio-dsp",
    label: "QSC Q-SYS Core 110f",
    manufacturer: "QSC",
    modelNumber: "Core 110f",
    referenceUrl: "https://www.qsc.com/resource-files/productresources/dsp/q-sys_core/q_qsc_core_110f_spec.pdf",
    searchTerms: ["qsc", "q-sys", "core", "dsp", "audio processor"],
    ports: [
      ...ports("Analog In", "analog-audio", "input", 8, "phoenix"),
      ...ports("Analog Out", "analog-audio", "output", 8, "phoenix"),
      port("AES In", "aes", "input", "phoenix"),
      port("AES Out", "aes", "output", "phoenix"),
      port("Ethernet 1", "ethernet", "bidirectional"),
      port("Ethernet 2", "ethernet", "bidirectional"),
      port("USB", "usb", "bidirectional"),
      port("GPIO", "gpio", "bidirectional"),
      port("RS-232", "serial", "bidirectional", "phoenix"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-009a-4000-8000-000000000154",
    deviceType: "audio-dsp",
    label: "Biamp Tesira SERVER",
    manufacturer: "Biamp",
    modelNumber: "Tesira SERVER",
    referenceUrl: "https://www.biamp.com/products/tesira-platform",
    searchTerms: ["biamp", "tesira", "server", "dsp", "avb"],
    ports: [
      ...ports("Analog In", "analog-audio", "input", 12, "phoenix"),
      ...ports("Analog Out", "analog-audio", "output", 8, "phoenix"),
      ...ports("AES In", "aes", "input", 8),
      ...ports("AES Out", "aes", "output", 8),
      port("Ethernet 1", "ethernet", "bidirectional"),
      port("Ethernet 2", "ethernet", "bidirectional"),
      port("USB", "usb", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-009b-4000-8000-000000000155",
    deviceType: "audio-interface",
    label: "Focusrite RedNet PCIeNX",
    manufacturer: "Focusrite",
    modelNumber: "RedNet PCIeNX",
    referenceUrl: "https://us.focusrite.com/products/rednet-pcienx",
    searchTerms: ["focusrite", "rednet", "pcie", "dante", "card"],
    ports: [
      port("Dante Primary", "dante", "bidirectional"),
      port("Dante Secondary", "dante", "bidirectional"),
    ],
  },
  {
    id: "c0a80101-009c-4000-8000-000000000156",
    deviceType: "audio-interface",
    label: "Audinate AVIO Input",
    manufacturer: "Audinate",
    modelNumber: "AVIO Analog Input 2ch",
    referenceUrl: "https://www.audinate.com/products/devices/dante-avio",
    searchTerms: ["audinate", "avio", "dante", "analog input", "adapter"],
    ports: [
      port("Analog In 1", "analog-audio", "input", "phoenix"),
      port("Analog In 2", "analog-audio", "input", "phoenix"),
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },
  {
    id: "c0a80101-009d-4000-8000-000000000157",
    deviceType: "audio-interface",
    label: "Audinate AVIO Output",
    manufacturer: "Audinate",
    modelNumber: "AVIO Analog Output 2ch",
    referenceUrl: "https://www.audinate.com/products/devices/dante-avio",
    searchTerms: ["audinate", "avio", "dante", "analog output", "adapter"],
    ports: [
      port("Analog Out 1", "analog-audio", "output", "phoenix"),
      port("Analog Out 2", "analog-audio", "output", "phoenix"),
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },
  {
    id: "c0a80101-009e-4000-8000-000000000158",
    deviceType: "audio-interface",
    label: "Audinate AVIO USB",
    manufacturer: "Audinate",
    modelNumber: "AVIO USB",
    referenceUrl: "https://www.audinate.com/products/devices/dante-avio",
    searchTerms: ["audinate", "avio", "dante", "usb"],
    ports: [
      port("USB", "usb", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },
  // ── Wireless Mics ────────────────────────────────────────────────
  {
    id: "c0a80101-009f-4000-8000-000000000159",
    deviceType: "wireless-mic-receiver",
    label: "Shure AD4Q",
    manufacturer: "Shure",
    modelNumber: "AD4Q",
    referenceUrl: "https://www.shure.com/en-US/products/wireless-systems/axient_digital/ad4q",
    searchTerms: ["shure", "axient", "digital", "quad", "wireless", "receiver"],
    ports: [
      ...ports("Analog Out", "analog-audio", "output", 4),
      port("AES Out", "aes", "output"),
      port("Dante Primary", "dante", "bidirectional"),
      port("Dante Secondary", "dante", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-00a0-4000-8000-000000000160",
    deviceType: "wireless-mic-receiver",
    label: "Shure QLXD4",
    manufacturer: "Shure",
    modelNumber: "QLXD4",
    referenceUrl: "https://www.shure.com/en-US/products/wireless-systems/qlx-d/qlxd4",
    searchTerms: ["shure", "qlx-d", "wireless", "receiver"],
    ports: [
      port("Analog Out", "analog-audio", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-00a1-4000-8000-000000000161",
    deviceType: "wireless-mic-receiver",
    label: "Shure SLXD4",
    manufacturer: "Shure",
    modelNumber: "SLXD4",
    referenceUrl: "https://www.shure.com/en-US/products/wireless-systems/slx-d/slxd4",
    searchTerms: ["shure", "slx-d", "wireless", "receiver"],
    ports: [
      port("Analog Out", "analog-audio", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-00a2-4000-8000-000000000162",
    deviceType: "wireless-mic-receiver",
    label: "Sennheiser EM 6000",
    manufacturer: "Sennheiser",
    modelNumber: "EM 6000",
    referenceUrl: "https://www.sennheiser.com/en-us/catalog/products/wireless-systems/digital-6000/digital-6000-em-6000-509360",
    searchTerms: ["sennheiser", "digital 6000", "wireless", "receiver"],
    ports: [
      port("Analog Out 1", "analog-audio", "output"),
      port("Analog Out 2", "analog-audio", "output"),
      port("AES Out", "aes", "output"),
      port("Dante Primary", "dante", "bidirectional"),
      port("Dante Secondary", "dante", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("Word Clock In", "genlock", "input"),
    
      port("Word Clock Out", "genlock", "output"),
    ],
  },
  {
    id: "c0a80101-00b2-4000-8000-000000000178",
    deviceType: "audio-dsp",
    label: "Meyer Galileo Galaxy 816",
    manufacturer: "Meyer Sound",
    modelNumber: "Galileo Galaxy 816",
    referenceUrl: "https://meyersound.com/product/galileo-galaxy-816/",
    searchTerms: ["meyer", "galileo", "galaxy", "816", "processor"],
    ports: [
      ...ports("Analog In", "analog-audio", "input", 8),
      ...ports("Analog Out", "analog-audio", "output", 16),
      port("AES In", "aes", "input"),
      port("AES Out", "aes", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("Headphone", "analog-audio", "output", "trs-quarter"),
    ],
  },
  // Audio new devices
  {
    id: "c0a80101-0107-4000-8000-000000000339",
    deviceType: "audio-mixer",
    category: "audio-mixers",
    label: "Yamaha DM7",
    manufacturer: "Yamaha",
    modelNumber: "DM7",
    referenceUrl: "https://usa.yamaha.com/products/proaudio/mixers/dm7/index.html",
    searchTerms: ["yamaha", "dm7", "digital console"],
    ports: [
      ...ports("Analog In", "analog-audio", "input", 16),
      ...ports("Analog Out", "analog-audio", "output", 8),
      port("AES Out", "aes", "output"),
      port("Dante Primary", "dante", "bidirectional"),
      port("Dante Secondary", "dante", "bidirectional"),
      port("USB", "usb", "bidirectional", "usb-c"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-0108-4000-8000-000000000340",
    deviceType: "audio-interface",
    category: "audio-interfaces",
    label: "Shure ANI4IN",
    manufacturer: "Shure",
    modelNumber: "ANI4IN-XLR",
    referenceUrl: "https://www.shure.com/en-US/products/mixers/ani/ani4in-xlr",
    searchTerms: ["shure", "ani", "dante", "audio network interface", "4 input"],
    ports: [
      port("Analog In 1", "analog-audio", "input"),
      port("Analog In 2", "analog-audio", "input"),
      port("Analog In 3", "analog-audio", "input"),
      port("Analog In 4", "analog-audio", "input"),
      port("Dante Primary", "dante", "bidirectional"),
      port("Dante Secondary", "dante", "bidirectional"),
    ],
  },
  {
    id: "c0a80101-0109-4000-8000-000000000341",
    deviceType: "audio-interface",
    category: "audio-interfaces",
    label: "Shure ANI4OUT",
    manufacturer: "Shure",
    modelNumber: "ANI4OUT-XLR",
    referenceUrl: "https://www.shure.com/en-US/products/mixers/ani/ani4out-xlr",
    searchTerms: ["shure", "ani", "dante", "audio network interface", "4 output"],
    ports: [
      port("Analog Out 1", "analog-audio", "output"),
      port("Analog Out 2", "analog-audio", "output"),
      port("Analog Out 3", "analog-audio", "output"),
      port("Analog Out 4", "analog-audio", "output"),
      port("Dante Primary", "dante", "bidirectional"),
      port("Dante Secondary", "dante", "bidirectional"),
    ],
  },
];
