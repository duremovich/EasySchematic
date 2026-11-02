import { SIGNAL_LABELS, CONNECTOR_LABELS, SIGNAL_GROUPS, CONNECTOR_GROUPS } from "../../../src/types";
import { DEVICE_TYPE_TO_CATEGORY } from "../../../src/deviceTypeCategories";

const SAMPLE_JSON = `{
  "label": "Extron DTP2 T 212",
  "manufacturer": "Extron",
  "modelNumber": "60-1271-01",
  "deviceType": "hdbaset-extender",
  "referenceUrl": "https://www.extron.com/product/dtp2t212",
  "heightMm": 25,
  "widthMm": 216,
  "depthMm": 114,
  "weightKg": 0.68,
  "powerDrawW": 12,
  "ports": [
    { "label": "HDMI IN",   "signalType": "hdmi",    "connectorType": "hdmi",    "direction": "input" },
    { "label": "HDMI LOOP", "signalType": "hdmi",    "connectorType": "hdmi",    "direction": "output" },
    { "label": "DTP2 OUT",  "signalType": "hdbaset", "connectorType": "rj45",    "direction": "output" },
    { "label": "RS-232",    "signalType": "serial",  "connectorType": "phoenix", "direction": "bidirectional" },
    { "label": "12V DC",    "signalType": "power",   "connectorType": "barrel",  "direction": "input" }
  ]
}`;

const SAMPLE_CSV = `model_number,manufacturer,label,device_type,height_mm,width_mm,depth_mm,weight_kg,power_draw_w,reference_url,port_label,port_direction,port_signal_type,port_connector_type,port_section
60-1271-01,Extron,Extron DTP2 T 212,hdbaset-extender,25,216,114,0.68,12,https://www.extron.com/product/dtp2t212,HDMI IN,input,hdmi,hdmi,Rear
60-1271-01,Extron,Extron DTP2 T 212,hdbaset-extender,25,216,114,0.68,12,https://www.extron.com/product/dtp2t212,HDMI LOOP,output,hdmi,hdmi,Rear
60-1271-01,Extron,Extron DTP2 T 212,hdbaset-extender,25,216,114,0.68,12,https://www.extron.com/product/dtp2t212,DTP2 OUT,output,hdbaset,rj45,Rear
60-1271-01,Extron,Extron DTP2 T 212,hdbaset-extender,25,216,114,0.68,12,https://www.extron.com/product/dtp2t212,RS-232,bidirectional,serial,phoenix,Rear
60-1271-01,Extron,Extron DTP2 T 212,hdbaset-extender,25,216,114,0.68,12,https://www.extron.com/product/dtp2t212,12V DC,input,power,barrel,Rear`;

// Group device types by category for display
function deviceTypesByCategory(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const [type, cat] of Object.entries(DEVICE_TYPE_TO_CATEGORY)) {
    if (!map[cat]) map[cat] = [];
    map[cat].push(type);
  }
  for (const cat of Object.keys(map)) map[cat].sort();
  return map;
}

export default function DeviceTemplateSchemaPage() {
  const dtByCat = deviceTypesByCategory();
  const sortedCategories = Object.keys(dtByCat).sort();

  return (
    <>
      <h1>Device Template Schema</h1>
      <p>
        This is the canonical reference for the EasySchematic device template format.
        Use it to convert from any external source (manufacturer Visio stencils,
        spreadsheets, scraped catalog data) into a format that can be bulk-imported
        through <strong>Device Library → Import</strong>.
      </p>
      <p>
        <strong>Looking for usage instructions?</strong> The{" "}
        <a href="/import-devices">Import Devices</a> guide walks through the workflow,
        with sample files and troubleshooting tips. This page is the technical reference.
      </p>

      <h2>Sample template (JSON)</h2>
      <p>The minimum fields required to import a device:</p>
      <pre><code>{SAMPLE_JSON}</code></pre>
      <p>
        You can submit a single object or an array of objects. Unknown fields are silently
        ignored — safe to include extra metadata your tooling tracks. <code>id</code> fields
        are auto-generated if omitted.
      </p>

      <h2>Required fields</h2>
      <table>
        <thead>
          <tr><th>Field</th><th>Type</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr><td><code>label</code></td><td>string</td><td>Display name (e.g. "Extron DTP2 T 212")</td></tr>
          <tr><td><code>deviceType</code></td><td>string</td><td>Must be a valid type — see table below</td></tr>
          <tr><td><code>manufacturer</code></td><td>string</td><td>Vendor name; use "Generic" for vendor-agnostic templates</td></tr>
          <tr><td><code>modelNumber</code></td><td>string</td><td>Required unless manufacturer is "Generic"</td></tr>
          <tr><td><code>referenceUrl</code></td><td>string</td><td>Required unless manufacturer is "Generic"; must start with http:// or https://</td></tr>
          <tr><td><code>ports</code></td><td>array</td><td>Each port needs <code>label</code>, <code>signalType</code>, <code>direction</code>; <code>connectorType</code> recommended</td></tr>
        </tbody>
      </table>

      <h2>Optional fields</h2>
      <table>
        <thead>
          <tr><th>Field</th><th>Type</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr><td><code>category</code></td><td>string</td><td>Auto-derived from <code>deviceType</code> if omitted</td></tr>
          <tr><td><code>shortName</code></td><td>string</td><td>Short label (e.g. the model number without the manufacturer prefix), shown when the schematic's "use short names" setting is on</td></tr>
          <tr><td><code>hostname</code></td><td>string</td><td>Network hostname for the device</td></tr>
          <tr><td><code>heightMm</code> / <code>widthMm</code> / <code>depthMm</code></td><td>number</td><td>Physical dimensions in millimeters. Drive rack auto-classification, side-view depth conflicts, and rack stats — see <a href="/racks">Rack Builder</a></td></tr>
          <tr><td><code>weightKg</code></td><td>number</td><td>Weight in kilograms; rolls up into per-rack total weight stats</td></tr>
          <tr><td><code>rackForm</code></td><td>string</td><td>Rack-form override — <code>"full"</code>, <code>"half"</code>, or <code>"shelf-only"</code>. Bypasses the size heuristic for edge cases like desktop units with optional rack ears</td></tr>
          <tr><td><code>facePlateLayout</code></td><td>object</td><td>Custom face-plate connector layout (set via the Face-Plate Editor in-app); persists with the template so future placements inherit it</td></tr>
          <tr><td><code>powerDrawW</code></td><td>number</td><td>Max power consumption in watts</td></tr>
          <tr><td><code>powerCapacityW</code></td><td>number</td><td>For power distribution, company switches and power supplies: total supply/output capacity in watts</td></tr>
          <tr><td><code>poeBudgetW</code></td><td>number</td><td>For PoE switches: total PoE budget in watts</td></tr>
          <tr><td><code>poeDrawW</code></td><td>number</td><td>For PoE-powered devices (cameras, access points): PoE draw in watts</td></tr>
          <tr><td><code>voltage</code></td><td>string</td><td>e.g. "100-240V" or "12V DC"</td></tr>
          <tr><td><code>thermalBtuh</code></td><td>number</td><td>Thermal load in BTU/h for HVAC sizing. Auto-derived from <code>powerDrawW × 3.412</code> if omitted; specify only when the measured value differs (e.g. devices with low standby dissipation).</td></tr>
          <tr><td><code>unitCost</code></td><td>number</td><td>MSRP / typical unit cost in USD</td></tr>
          <tr><td><code>searchTerms</code></td><td>string[]</td><td>Extra keywords for the device library search</td></tr>
          <tr><td><code>color</code></td><td>string</td><td>Hex color (e.g. "#3b82f6") for the device card</td></tr>
          <tr><td><code>headerColor</code></td><td>string</td><td>Hex color for the device's header bar. Set on a user template by saving a device whose header color you picked yourself; devices placed from the template take it ahead of the project and app default header color settings. Omit to leave those defaults in charge.</td></tr>
        </tbody>
      </table>

      <h2 id="modular-chassis">Modular chassis &amp; expansion cards</h2>
      <p>
        A modular frame (matrix chassis, LED processor, console with I/O cards) is a
        <strong>chassis template</strong> that lists its card <code>slots</code>, plus one
        <strong>card template</strong> per card. The two are linked by a single string, the
        <code>slotFamily</code>: a card can be installed into any slot with the same family.
      </p>
      <table>
        <thead>
          <tr><th>Field</th><th>On</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr><td><code>slots</code></td><td>chassis</td><td>Array of slots (the community library accepts up to 128). Each takes a <code>slotFamily</code>; <code>id</code> and <code>label</code> are filled in if omitted. Optional <code>defaultCardId</code> (the id of a library card to pre-install) and <code>hideWhenEmpty</code>.</td></tr>
          <tr><td><code>slotFamily</code></td><td>card</td><td>On a template with <code>deviceType: "expansion-card"</code>: the slot family the card fits.</td></tr>
        </tbody>
      </table>
      <p>
        Use separate families where a frame has dedicated input and output slots, so an input card
        can't be placed in an output slot. A chassis and its cards can be imported together in one array:
      </p>
      <pre><code>{`[
  {
    "label": "Acme Modular Matrix",
    "deviceType": "switcher",
    "manufacturer": "Acme",
    "modelNumber": "AMM-1600",
    "referenceUrl": "https://acme.example/amm-1600",
    "slots": [
      { "label": "Input Slot 1",  "slotFamily": "acme-frame-input" },
      { "label": "Output Slot 1", "slotFamily": "acme-frame-output" }
    ],
    "ports": [ { "label": "AC Power", "signalType": "power", "direction": "input" } ]
  },
  {
    "label": "Acme 4-Input HDMI Card",
    "deviceType": "expansion-card",
    "manufacturer": "Acme",
    "modelNumber": "AMM-4I-HDMI",
    "referenceUrl": "https://acme.example/amm-4i-hdmi",
    "slotFamily": "acme-frame-input",
    "ports": [ { "label": "Input 1", "signalType": "hdmi", "direction": "input", "connectorType": "hdmi" } ]
  }
]`}</code></pre>
      <p>The CSV format has no column for slots — use JSON for a modular chassis.</p>

      <h2>Port-level fields</h2>
      <p>
        Each object in the <code>ports</code> array supports additional per-port fields beyond
        the required <code>label</code>, <code>signalType</code>, and <code>direction</code>.
      </p>

      <h3><code>networkConfig</code> — network port pre-configuration</h3>
      <p>
        For Ethernet and fiber ports on addressable devices (switches, NVX endpoints, Dante
        interfaces, etc.), you can pre-populate IP configuration that appears in the port
        inspector when the device is placed on a schematic.
      </p>
      <table>
        <thead>
          <tr><th>Field</th><th>Type</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr><td><code>ip</code></td><td>string</td><td>Static IP address, e.g. "192.168.1.10"</td></tr>
          <tr><td><code>subnetMask</code></td><td>string</td><td>e.g. "255.255.255.0"</td></tr>
          <tr><td><code>gateway</code></td><td>string</td><td>e.g. "192.168.1.1"</td></tr>
          <tr><td><code>vlan</code></td><td>integer 0–4094</td><td>VLAN ID</td></tr>
          <tr><td><code>dhcp</code></td><td>boolean</td><td>true if the port obtains an address via DHCP</td></tr>
        </tbody>
      </table>
      <p>Example — a switch with a pre-configured management port:</p>
      <pre><code>{`{
  "label": "Cisco SG350-10",
  "manufacturer": "Cisco",
  "modelNumber": "SG350-10",
  "deviceType": "network-switch",
  "referenceUrl": "https://www.cisco.com/c/en/us/products/switches/sg350-10-10-port-gigabit-managed-switch",
  "ports": [
    {
      "label": "MGMT",
      "signalType": "ethernet",
      "connectorType": "rj45",
      "direction": "bidirectional",
      "networkConfig": { "ip": "192.168.1.1", "subnetMask": "255.255.255.0", "vlan": 1 }
    }
  ]
}`}</code></pre>

      <h3><code>capabilities</code> — video port capabilities</h3>
      <p>
        For HDMI, DisplayPort, SDI, and other video ports, you can record the signal
        capabilities the port supports. These appear in the port inspector and help
        document max resolution, frame rate, and color space constraints.
      </p>
      <table>
        <thead>
          <tr><th>Field</th><th>Type</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr><td><code>maxResolution</code></td><td>string</td><td>e.g. "4K", "1080p", "8K"</td></tr>
          <tr><td><code>maxFrameRate</code></td><td>number</td><td>Frames per second, e.g. 60</td></tr>
          <tr><td><code>maxBitDepth</code></td><td>number</td><td>Bits per channel, e.g. 10</td></tr>
          <tr><td><code>colorSpaces</code></td><td>string[]</td><td>Supported color spaces, e.g. ["Rec.709", "Rec.2020", "DCI-P3"] (max 20)</td></tr>
        </tbody>
      </table>
      <p>Example — a 4K HDMI output:</p>
      <pre><code>{`{
  "label": "HDMI OUT",
  "signalType": "hdmi",
  "connectorType": "hdmi",
  "direction": "output",
  "capabilities": {
    "maxResolution": "4K",
    "maxFrameRate": 60,
    "maxBitDepth": 10,
    "colorSpaces": ["Rec.709", "Rec.2020"]
  }
}`}</code></pre>

      <h3><code>multiConnect</code> — accept multiple connections per port</h3>
      <p>
        By default, each port allows one connection. Set <code>multiConnect: true</code> to let a port hold many —
        useful for SRT receivers/encoders, wireless mic receivers, or any logical signal where fan-in or fan-out
        is the norm. Auto-defaults to <code>true</code> when a new port is created with signal type
        <code> srt</code> or <code> custom</code>, or with connector type <code>wireless</code>.
      </p>
      <pre><code>{`{
  "label": "SRT Source",
  "signalType": "srt",
  "connectorType": "none",
  "direction": "input",
  "multiConnect": true
}`}</code></pre>

      <h2>Port direction values</h2>
      <ul>
        <li><code>input</code> — accepts signal flowing in</li>
        <li><code>output</code> — sends signal out</li>
        <li><code>bidirectional</code> — both (e.g. Ethernet, USB, RS-232)</li>
        <li><code>passthrough</code> — a tie line or patch point with a rear and a front connector (<code>rearConnectorType</code> / <code>frontConnectorType</code>). Leave <code>signalType</code> off and the port takes the signal of whatever is connected to it</li>
      </ul>

      <h2>CSV format (alternative)</h2>
      <p>
        For spreadsheet-friendly bulk entry, use <strong>row-per-port CSV</strong>:
        each port is one row, with device-level fields repeated. The importer groups
        rows by <code>(manufacturer, model_number)</code>.
      </p>
      <p><strong>Required columns:</strong> <code>model_number</code>, <code>label</code>, <code>device_type</code>, <code>port_label</code>, <code>port_signal_type</code>, <code>port_direction</code></p>
      <p><strong>Optional columns:</strong> <code>manufacturer</code>, <code>category</code>, <code>reference_url</code>, <code>height_mm</code>, <code>width_mm</code>, <code>depth_mm</code>, <code>weight_kg</code>, <code>power_draw_w</code>, <code>voltage</code>, <code>thermal_btuh</code>, <code>port_connector_type</code>, <code>port_section</code></p>
      <pre style={{ fontSize: "11px" }}><code>{SAMPLE_CSV}</code></pre>

      <hr />

      <h2>Valid <code>signalType</code> values</h2>
      <p>The <code>signalType</code> describes what travels through a port — video format, audio protocol, network, control, or power.</p>
      {Object.entries(SIGNAL_GROUPS).map(([group, types]) => (
        <div key={group}>
          <h3>{group}</h3>
          <table>
            <thead>
              <tr><th>Value</th><th>Display label</th></tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t}>
                  <td><code>{t}</code></td>
                  <td>{SIGNAL_LABELS[t]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <h2>Valid <code>connectorType</code> values</h2>
      <p>The <code>connectorType</code> is the physical connector on the port (XLR, HDMI, RJ45, etc.).</p>
      {Object.entries(CONNECTOR_GROUPS).map(([group, types]) => (
        <div key={group}>
          <h3>{group}</h3>
          <table>
            <thead>
              <tr><th>Value</th><th>Display label</th></tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t}>
                  <td><code>{t}</code></td>
                  <td>{CONNECTOR_LABELS[t]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <h2>Valid <code>deviceType</code> values</h2>
      <p>Each device type maps to a category in the library sidebar. The category is auto-derived if you don't specify one.</p>
      {sortedCategories.map((cat) => (
        <div key={cat}>
          <h3>{cat}</h3>
          <table>
            <thead>
              <tr><th>Value</th></tr>
            </thead>
            <tbody>
              {dtByCat[cat].map((t) => (
                <tr key={t}><td><code>{t}</code></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <hr />

      <h2>Where imports go</h2>
      <p>
        Imported devices land in your <strong>custom templates</strong> (the "User Templates"
        section of the device library). They're stored in your browser, scoped to your machine.
        From there you can drag them onto schematics like any other device.
      </p>
      <p>
        Optionally, you can also <strong>submit individual templates to the community library</strong>
        from the import dialog. Submissions go into a moderation queue and become available to all
        users once approved.
      </p>
    </>
  );
}
