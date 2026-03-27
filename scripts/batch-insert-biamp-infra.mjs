#!/usr/bin/env node
// Generates SQL to insert 18 device templates requested by Discord user
// Run: node scripts/batch-insert-biamp-infra.mjs > scripts/biamp-infra.sql

import { randomUUID } from "crypto";

function esc(val) {
  if (val == null) return "NULL";
  return "'" + String(val).replace(/'/g, "''") + "'";
}

let portIdx = 0;
function pid() { return `tpl-${portIdx++}`; }
function resetPorts() { portIdx = 0; }

function port(label, signalType, direction, connectorType, section) {
  const p = { id: pid(), label, signalType, direction };
  if (connectorType) p.connectorType = connectorType;
  if (section) p.section = section;
  return p;
}

function ports(prefix, signalType, direction, count, connectorType, section) {
  return Array.from({ length: count }, (_, i) =>
    port(`${prefix} ${i + 1}`, signalType, direction, connectorType, section)
  );
}

const DEVICE_TYPE_TO_CATEGORY = {
  speaker: "Speakers",
  amplifier: "Amplifiers",
  "patch-panel": "Infrastructure",
  "power-distribution": "Infrastructure",
  "control-expansion": "Control",
};

const devices = [];

// ── GROUP A: Biamp Passive Speakers ──

// A1. LVH-906/AS
resetPorts();
devices.push({
  deviceType: "speaker", manufacturer: "Biamp", modelNumber: "LVH-906/AS",
  label: "Biamp LVH-906/AS", powerDrawW: 0,
  referenceUrl: "https://products.biamp.com/product-details/-/o/ecom-item/911.0927.900",
  searchTerms: ["biamp", "community", "lvh", "venue horn", "beamforming", "passive", "3-way"],
  ports: ports("Input", "analog-audio", "input", 6, "terminal-block", "Speaker Input"),
});

// A2. LVH-909/AS
resetPorts();
devices.push({
  deviceType: "speaker", manufacturer: "Biamp", modelNumber: "LVH-909/AS",
  label: "Biamp LVH-909/AS", powerDrawW: 0,
  referenceUrl: "https://products.biamp.com/product-details/-/o/ecom-item/911.0933.900",
  searchTerms: ["biamp", "community", "lvh", "venue horn", "beamforming", "passive", "3-way"],
  ports: ports("Input", "analog-audio", "input", 6, "terminal-block", "Speaker Input"),
});

// A3. IV6-1122/05
resetPorts();
devices.push({
  deviceType: "speaker", manufacturer: "Biamp", modelNumber: "IV6-1122/05",
  label: "Biamp IV6-1122/05", powerDrawW: 0,
  referenceUrl: "https://products.biamp.com/product-details/-/o/ecom-item/911.1186.900",
  searchTerms: ["biamp", "community", "iv6", "line array", "vertical array", "120x5", "passive", "2-way"],
  ports: [
    port("Speakon In 1", "analog-audio", "input", "speakon"),
    port("Speakon In 2", "analog-audio", "input", "speakon"),
    port("Terminal In", "analog-audio", "input", "terminal-block"),
  ],
});

// A4. IV6-1122/15
resetPorts();
devices.push({
  deviceType: "speaker", manufacturer: "Biamp", modelNumber: "IV6-1122/15",
  label: "Biamp IV6-1122/15", powerDrawW: 0,
  referenceUrl: "https://products.biamp.com/product-details/-/o/d/Community-IV6-1122-15B/ecom-item/911.1188.900",
  searchTerms: ["biamp", "community", "iv6", "line array", "vertical array", "120x15", "passive", "2-way"],
  ports: [
    port("Speakon In 1", "analog-audio", "input", "speakon"),
    port("Speakon In 2", "analog-audio", "input", "speakon"),
    port("Terminal In", "analog-audio", "input", "terminal-block"),
  ],
});

// A5. ENT-FR
resetPorts();
devices.push({
  deviceType: "speaker", manufacturer: "Biamp", modelNumber: "ENT-FR",
  label: "Biamp ENT-FR", powerDrawW: 0,
  referenceUrl: "https://products.biamp.com/product-details/-/o/d/Desono-ENT-FR/ecom-item/911.1388.900",
  searchTerms: ["biamp", "desono", "ent", "column", "line source", "passive", "3-way"],
  ports: [
    port("Speakon In", "analog-audio", "input", "speakon", "Input (Parallel)"),
    port("Terminal In", "analog-audio", "input", "terminal-block", "Input (Parallel)"),
    port("Banana In", "analog-audio", "input", "banana", "Input (Parallel)"),
  ],
});

// A6. IC6-1062/00
resetPorts();
devices.push({
  deviceType: "speaker", manufacturer: "Biamp", modelNumber: "IC6-1062/00",
  label: "Biamp IC6-1062/00", powerDrawW: 0,
  referenceUrl: "https://products.biamp.com/product-details/-/o/ecom-item/911.1003.900",
  searchTerms: ["biamp", "community", "ic6", "install", "ceiling", "100x100", "passive", "2-way", "6.5 inch"],
  ports: [port("Audio In", "analog-audio", "input", "terminal-block")],
});

// A7. IC6-1082/26
resetPorts();
devices.push({
  deviceType: "speaker", manufacturer: "Biamp", modelNumber: "IC6-1082/26",
  label: "Biamp IC6-1082/26", powerDrawW: 0,
  referenceUrl: "https://products.biamp.com/product-details/-/o/ecom-item/911.1009.900",
  searchTerms: ["biamp", "community", "ic6", "install", "120x60", "passive", "2-way", "8 inch"],
  ports: [port("Audio In", "analog-audio", "input", "terminal-block")],
});

// A8. DX-S8
resetPorts();
devices.push({
  deviceType: "speaker", manufacturer: "Biamp", modelNumber: "DX-S8",
  label: "Biamp DX-S8", powerDrawW: 0,
  referenceUrl: "https://products.biamp.com/product-details/-/o/d/Desono-DX-S8-B-Black/ecom-item/910.0109.900",
  searchTerms: ["biamp", "desono", "dx", "surface mount", "coaxial", "passive", "2-way", "8 inch", "outdoor", "70v", "100v"],
  ports: [port("Audio In", "analog-audio", "input", "terminal-block")],
});

// A9. R.5-96MAX
resetPorts();
devices.push({
  deviceType: "speaker", manufacturer: "Biamp", modelNumber: "R.5-96MAX",
  label: "Biamp R.5-96MAX", powerDrawW: 0,
  referenceUrl: "https://products.biamp.com/product-details/-/o/ecom-item/911.1250.900",
  searchTerms: ["biamp", "community", "r5", "r.5", "96max", "weather", "outdoor", "90x60", "passive", "2-way", "12 inch", "ip55"],
  ports: [port("Audio In (Pigtail)", "analog-audio", "input", "none")],
});

// A10. R.5-66MAX
resetPorts();
devices.push({
  deviceType: "speaker", manufacturer: "Biamp", modelNumber: "R.5-66MAX",
  label: "Biamp R.5-66MAX", powerDrawW: 0,
  referenceUrl: "https://products.biamp.com/product-details/-/o/ecom-item/911.1243.900",
  searchTerms: ["biamp", "community", "r5", "r.5", "66max", "weather", "outdoor", "60x60", "passive", "2-way", "12 inch", "ip55"],
  ports: [port("Audio In (Pigtail)", "analog-audio", "input", "none")],
});

// ── GROUP B: Biamp Amplifiers ──

// B1. ALC-1604D
resetPorts();
devices.push({
  deviceType: "amplifier", manufacturer: "Biamp", modelNumber: "ALC-1604D",
  label: "Biamp ALC-1604D", powerDrawW: 5000,
  referenceUrl: "https://products.biamp.com/product-details/-/o/d/Community-ALC-1604D/ecom-item/911.1351.900",
  searchTerms: ["biamp", "community", "alc", "amplified loudspeaker controller", "4 channel", "1250w", "dante"],
  ports: [
    ...ports("Analog In", "analog-audio", "input", 4, "phoenix", "Analog Input"),
    ...ports("Speaker Out", "analog-audio", "output", 4, "phoenix", "Speaker Output"),
    port("Dante Primary", "dante", "bidirectional", "rj45", "Dante"),
    port("Dante Secondary", "dante", "bidirectional", "rj45", "Dante"),
    port("Ethernet", "ethernet", "bidirectional", "rj45", "Control"),
    ...ports("GPIO", "gpio", "bidirectional", 4, "phoenix", "GPIO"),
    port("AC Power", "power", "input", "iec", "Power"),
  ],
});

// B2. ALC-404D
resetPorts();
devices.push({
  deviceType: "amplifier", manufacturer: "Biamp", modelNumber: "ALC-404D",
  label: "Biamp ALC-404D", powerDrawW: 1600,
  referenceUrl: "https://products.biamp.com/product-details/-/o/ecom-item/911.1353.900",
  searchTerms: ["biamp", "community", "alc", "amplified loudspeaker controller", "4 channel", "400w", "dante"],
  ports: [
    ...ports("Analog In", "analog-audio", "input", 4, "phoenix", "Analog Input"),
    ...ports("Speaker Out", "analog-audio", "output", 4, "phoenix", "Speaker Output"),
    port("Dante Primary", "dante", "bidirectional", "rj45", "Dante"),
    port("Dante Secondary", "dante", "bidirectional", "rj45", "Dante"),
    port("Ethernet", "ethernet", "bidirectional", "rj45", "Control"),
    ...ports("GPIO", "gpio", "bidirectional", 4, "phoenix", "GPIO"),
    port("AC Power", "power", "input", "iec", "Power"),
  ],
});

// ── GROUP C: Infrastructure ──

// C1. Legrand WP24RM
resetPorts();
devices.push({
  deviceType: "patch-panel", manufacturer: "Legrand", modelNumber: "WP24RM",
  label: "Legrand WP24RM Patch Panel", powerDrawW: 0,
  referenceUrl: "https://www.legrand.us/audio-visual/data-connectivity/patch-panels/24-port-keystone-rack-mount-patch-panel/p/wp24rm",
  searchTerms: ["legrand", "wp24rm", "patch panel", "24 port", "keystone", "rack mount"],
  ports: ports("Port", "ethernet", "bidirectional", 24, "rj45"),
});

// C2. LynTec RPC 141
resetPorts();
devices.push({
  deviceType: "power-distribution", manufacturer: "LynTec", modelNumber: "RPC 141",
  label: "LynTec RPC 141", powerCapacityW: 54000, voltage: "240V",
  referenceUrl: "https://www.av-iq.com/avcat/ctl1642/index.cfm?manufacturer=lyntec&product=rpc-141",
  searchTerms: ["lyntec", "rpc", "141", "remote power control", "breaker panel", "225a", "single phase", "motorized breaker"],
  ports: [
    port("AC In (Hardwired)", "power", "input", "none", "Input"),
    port("Ethernet", "ethernet", "bidirectional", "rj45", "Control"),
    port("RS-232", "serial", "bidirectional", "db9", "Control"),
    port("DMX In", "dmx", "input", "xlr-5", "DMX"),
    port("DMX Thru", "dmx", "output", "xlr-5", "DMX"),
    ...ports("Circuit", "power", "output", 41, "edison", "Circuits"),
  ],
});

// C3. JuiceGoose CQ 1520-RX
resetPorts();
devices.push({
  deviceType: "power-distribution", manufacturer: "JuiceGoose", modelNumber: "CQ 1520-RX",
  label: "JuiceGoose CQ 1520-RX", powerCapacityW: 2400, voltage: "120V",
  referenceUrl: "https://www.juicegoose.com/products/cq-series/cq-1520-rx",
  searchTerms: ["juicegoose", "juice goose", "cq", "1520", "sequencer", "power sequencer", "20a"],
  ports: [
    port("AC In (NEMA 5-20P)", "power", "input", "edison", "Input"),
    port("Pod 1 Out 1", "power", "output", "edison", "Pod 1 (Step 1)"),
    port("Pod 1 Out 2", "power", "output", "edison", "Pod 1 (Step 1)"),
    port("Pod 2 Out 1", "power", "output", "edison", "Pod 2 (Step 2)"),
    port("Pod 2 Out 2", "power", "output", "edison", "Pod 2 (Step 2)"),
    port("Pod 3 Out 1", "power", "output", "edison", "Pod 3 (Step 3)"),
    port("Pod 3 Out 2", "power", "output", "edison", "Pod 3 (Step 3)"),
    port("Unswitched Out", "power", "output", "edison", "Unswitched"),
    port("RJ45 Master", "ethernet", "bidirectional", "rj45", "Control Link"),
    port("RJ45 Slave", "ethernet", "bidirectional", "rj45", "Control Link"),
  ],
});

// C4. Lowell ACS-2020-IG-10C-HW
resetPorts();
devices.push({
  deviceType: "power-distribution", manufacturer: "Lowell", modelNumber: "ACS-2020-IG-10C-HW",
  label: "Lowell ACS-2020-IG-10C-HW", powerCapacityW: 24000, voltage: "120V",
  referenceUrl: "https://www.lowellmfg.com/product/acs-2020-ig-10c-hw-power-strip/",
  searchTerms: ["lowell", "acs", "power strip", "10 circuit", "hardwired", "20 outlet", "isolated ground"],
  ports: [
    port("AC In (Hardwired)", "power", "input", "none", "Input"),
    ...ports("Circuit", "power", "output", 10, "edison", "Circuits"),
  ],
});

// ── GROUP D: Control Expansion ──

// D1. LynTec RPC I/O-R Board
resetPorts();
devices.push({
  deviceType: "control-expansion", manufacturer: "LynTec", modelNumber: "RPC I/O-R",
  label: "LynTec RPC I/O-R Board", powerDrawW: 0,
  referenceUrl: "https://lyntec.com/io-r-board-option-for-the-rpc-and-rpcr-panels/",
  searchTerms: ["lyntec", "rpc", "io", "i/o", "expansion", "relay", "contact closure", "gpio"],
  ports: [
    ...ports("CC Input", "gpio", "input", 8, "phoenix", "Contact Closure Inputs"),
    ...ports("Relay Output", "gpio", "output", 8, "phoenix", "Relay Outputs"),
  ],
});

// ── GROUP E: Control Accessory ──

// E1. LynTec SS-2
resetPorts();
devices.push({
  deviceType: "control-expansion", manufacturer: "LynTec", modelNumber: "SS-2",
  label: "LynTec SS-2", powerDrawW: 0,
  referenceUrl: "https://www.av-iq.com/avcat/ctl1642/index.cfm?manufacturer=lyntec&product=ss-2",
  searchTerms: ["lyntec", "ss-2", "switch", "on off", "sequencer", "remote switch"],
  ports: [
    port("ON", "gpio", "output", "phoenix"),
    port("OFF", "gpio", "output", "phoenix"),
  ],
});

// ── Generate SQL ──
const lines = [];
for (const d of devices) {
  const category = DEVICE_TYPE_TO_CATEGORY[d.deviceType] || "Other";
  const portsJson = JSON.stringify(d.ports);
  const searchJson = JSON.stringify(d.searchTerms || []);
  const uuid = randomUUID();

  lines.push(`-- ${d.label}`);
  lines.push(`INSERT INTO templates (id, device_type, label, manufacturer, model_number, ports, slots, category, search_terms, reference_url, power_draw_w, power_capacity_w, voltage) VALUES (${esc(uuid)}, ${esc(d.deviceType)}, ${esc(d.label)}, ${esc(d.manufacturer)}, ${esc(d.modelNumber)}, ${esc(portsJson)}, '[]', ${esc(category)}, ${esc(searchJson)}, ${esc(d.referenceUrl || null)}, ${d.powerDrawW != null ? d.powerDrawW : "NULL"}, ${d.powerCapacityW != null ? d.powerCapacityW : "NULL"}, ${esc(d.voltage || null)});`);
  lines.push("");
}

console.log(lines.join("\n"));
