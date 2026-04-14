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

      <h2>Sample template (JSON)</h2>
      <p>The minimum fields required to import a device:</p>
      <pre style={{ overflowX: "auto", padding: "12px", background: "#f5f5f5", borderRadius: "6px" }}>
        <code>{SAMPLE_JSON}</code>
      </pre>
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
          <tr><td><code>referenceUrl</code></td><td>string</td><td>Recommended; must start with http:// or https://</td></tr>
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
          <tr><td><code>heightMm</code> / <code>widthMm</code> / <code>depthMm</code></td><td>number</td><td>Physical dimensions in millimeters</td></tr>
          <tr><td><code>weightKg</code></td><td>number</td><td>Weight in kilograms</td></tr>
          <tr><td><code>powerDrawW</code></td><td>number</td><td>Max power consumption in watts</td></tr>
          <tr><td><code>powerCapacityW</code></td><td>number</td><td>For power distros: total capacity in watts</td></tr>
          <tr><td><code>poeBudgetW</code></td><td>number</td><td>For PoE switches: total PoE budget in watts</td></tr>
          <tr><td><code>voltage</code></td><td>string</td><td>e.g. "100-240V" or "12V DC"</td></tr>
          <tr><td><code>unitCost</code></td><td>number</td><td>MSRP / typical unit cost in USD</td></tr>
          <tr><td><code>searchTerms</code></td><td>string[]</td><td>Extra keywords for the device library search</td></tr>
          <tr><td><code>color</code></td><td>string</td><td>Hex color (e.g. "#3b82f6") for the device card</td></tr>
        </tbody>
      </table>

      <h2>Port direction values</h2>
      <ul>
        <li><code>input</code> — accepts signal flowing in</li>
        <li><code>output</code> — sends signal out</li>
        <li><code>bidirectional</code> — both (e.g. Ethernet, USB, RS-232)</li>
      </ul>

      <h2>CSV format (alternative)</h2>
      <p>
        For spreadsheet-friendly bulk entry, use <strong>row-per-port CSV</strong>:
        each port is one row, with device-level fields repeated. The importer groups
        rows by <code>(manufacturer, model_number)</code>.
      </p>
      <p><strong>Required columns:</strong> <code>model_number</code>, <code>label</code>, <code>device_type</code>, <code>port_label</code>, <code>port_signal_type</code>, <code>port_direction</code></p>
      <p><strong>Optional columns:</strong> <code>manufacturer</code>, <code>category</code>, <code>reference_url</code>, <code>height_mm</code>, <code>width_mm</code>, <code>depth_mm</code>, <code>weight_kg</code>, <code>power_draw_w</code>, <code>voltage</code>, <code>port_connector_type</code>, <code>port_section</code></p>
      <pre style={{ overflowX: "auto", padding: "12px", background: "#f5f5f5", borderRadius: "6px", fontSize: "11px" }}>
        <code>{SAMPLE_CSV}</code>
      </pre>

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
