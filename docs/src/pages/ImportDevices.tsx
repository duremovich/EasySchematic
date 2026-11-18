const MINIMAL_JSON = `{
  "label": "Generic 4×1 HDMI Switcher",
  "manufacturer": "Generic",
  "deviceType": "switcher",
  "ports": [
    { "label": "IN 1", "signalType": "hdmi", "direction": "input" },
    { "label": "IN 2", "signalType": "hdmi", "direction": "input" },
    { "label": "IN 3", "signalType": "hdmi", "direction": "input" },
    { "label": "IN 4", "signalType": "hdmi", "direction": "input" },
    { "label": "OUT",  "signalType": "hdmi", "direction": "output" }
  ]
}`;

const CSV_SNIPPET = `model_number,manufacturer,label,device_type,port_label,port_direction,port_signal_type,port_connector_type
HD-MD-4X1,Crestron,Crestron 4x1 Switcher,switcher,IN 1,input,hdmi,hdmi
HD-MD-4X1,Crestron,Crestron 4x1 Switcher,switcher,IN 2,input,hdmi,hdmi
HD-MD-4X1,Crestron,Crestron 4x1 Switcher,switcher,IN 3,input,hdmi,hdmi
HD-MD-4X1,Crestron,Crestron 4x1 Switcher,switcher,IN 4,input,hdmi,hdmi
HD-MD-4X1,Crestron,Crestron 4x1 Switcher,switcher,OUT,output,hdmi,hdmi`;

export default function ImportDevicesPage() {
  return (
    <>
      <h1>Import Devices</h1>

      <p>
        EasySchematic can bulk-import device templates from JSON or CSV. Use this when you have
        more than two or three devices to add — a manufacturer catalog, a vendor's price list,
        a spreadsheet of every piece of gear in your venue, or anything else that would be tedious
        to enter one device at a time through the device editor.
      </p>

      <p>
        For the field-by-field reference (every valid <code>signalType</code>, <code>connectorType</code>,
        <code>deviceType</code>, etc.), see the{" "}
        <a href="/device-template-schema">Device Template Schema</a>. This page is the workflow guide.
      </p>

      <h2>Where to find it</h2>

      <p>
        In the device library sidebar, click <strong>Create New Device</strong>. The picker that opens
        has three options:
      </p>
      <ol>
        <li><strong>Start Blank</strong> — opens the device editor with an empty template</li>
        <li><strong>Import from JSON or CSV</strong> — opens the bulk-import dialog (the subject of this page)</li>
        <li><strong>Or clone from library device</strong> — search the existing library and use a device as a starting point</li>
      </ol>

      <h2>Pick a format</h2>

      <p>Both formats produce the same result. Pick whichever matches your source data:</p>

      <table>
        <thead>
          <tr><th>Use JSON if…</th><th>Use CSV if…</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Your data comes out of code or a structured tool (vendor API, scraping script, your own database)</td>
            <td>Your data lives in a spreadsheet (Excel, Google Sheets, Numbers)</td>
          </tr>
          <tr>
            <td>You want to specify nested data like search terms or device color</td>
            <td>You want to hand-edit grid-style with no nested structures</td>
          </tr>
          <tr>
            <td>The vendor sent you a JSON file already</td>
            <td>The vendor sent you a spreadsheet or comma-separated text</td>
          </tr>
        </tbody>
      </table>

      <p>
        If you're unsure, use JSON — it's stricter and easier to validate before you upload.
      </p>

      <h2>Walking through an import</h2>

      <ol>
        <li>Open the dialog: <strong>Create New Device → Import from JSON or CSV</strong></li>
        <li>Pick the <strong>JSON</strong> or <strong>CSV</strong> tab</li>
        <li>
          Either click <strong>Upload file</strong> to pick a file from disk, or paste your data directly
          into the textarea. (Click <strong>Load sample</strong> to see what the format looks like.)
        </li>
        <li>
          The preview list populates automatically. Each detected device gets one row showing its label,
          manufacturer, model, device type, port count, and validation status.
        </li>
        <li>
          Uncheck any rows you don't want to import. Rows with errors are pre-disabled.
        </li>
        <li>
          (Optional) Add a submitter note — used only if you submit to the community library.
        </li>
        <li>
          Click <strong>Add to Library</strong> to save selected templates to your custom-templates library,
          or <strong>Add &amp; Submit</strong> to also push them to the community library for review.
        </li>
      </ol>

      <h2>Reading the preview</h2>

      <p>The preview header shows totals at a glance:</p>
      <ul>
        <li>
          <strong>X templates parsed</strong> — every device the parser successfully reconstructed.
          Doesn't mean they're valid, just that the input was structurally readable.
        </li>
        <li>
          <strong>Y valid</strong> (green) — passed validation and ready to import.
        </li>
        <li>
          <strong>Z with errors</strong> (red) — failed validation. The row is highlighted, the
          checkbox is disabled, and the first three errors are listed inline. Common causes:
          unknown signal type, unknown device type, or missing required fields.
        </li>
      </ul>

      <p>
        If the input is malformed at the file level (broken JSON, CSV missing required columns),
        you'll see a red banner above the preview describing the problem. No device rows will appear
        until the file-level error is fixed.
      </p>

      <h2>Sample files</h2>

      <p>Right-click → save, or open the link to inspect the format:</p>

      <ul>
        <li>
          <a href="/examples/import-minimal.json" download>import-minimal.json</a> —
          a single device with only the required fields. Good starting point.
        </li>
        <li>
          <a href="/examples/import-complete.json" download>import-complete.json</a> —
          a single device with every optional field populated. Reference for what's possible.
        </li>
        <li>
          <a href="/examples/import-array.json" download>import-array.json</a> —
          three devices in an array. Demonstrates batch import.
        </li>
        <li>
          <a href="/examples/import-sample.csv" download>import-sample.csv</a> —
          three devices spread across multiple rows. Demonstrates the row-per-port CSV layout.
        </li>
      </ul>

      <h2>JSON format</h2>

      <p>The minimum to define a single device:</p>

      <pre><code>{MINIMAL_JSON}</code></pre>

      <p>Key facts:</p>
      <ul>
        <li>You can submit a <strong>single object</strong> or an <strong>array of objects</strong>. Both work.</li>
        <li>
          Unknown fields are <strong>silently ignored</strong>. Safe to include extra metadata your tools
          track that EasySchematic doesn't know about.
        </li>
        <li><code>id</code> fields (template and port) are <strong>auto-generated</strong> if omitted.</li>
        <li>
          <code>category</code> is auto-derived from <code>deviceType</code> if you don't specify one.
        </li>
        <li>
          When <code>manufacturer</code> is <code>"Generic"</code>, <code>modelNumber</code> and{" "}
          <code>referenceUrl</code> become optional.
        </li>
      </ul>

      <p>
        Full field list, all valid enum values, and validation rules:{" "}
        <a href="/device-template-schema">Device Template Schema</a>.
      </p>

      <h2>CSV format</h2>

      <p>
        CSV uses a <strong>row-per-port</strong> layout: one row for every physical port on a device,
        with the device-level fields (manufacturer, model, dimensions, etc.) repeated across all rows
        for that device. The importer groups rows by <code>(manufacturer, model_number)</code> to
        reconstruct each device.
      </p>

      <pre style={{ fontSize: "11px" }}><code>{CSV_SNIPPET}</code></pre>

      <p>
        The example above defines one device (Crestron 4×1 Switcher) with five ports. If you added a
        second device, you'd just keep adding rows — the importer figures out where one device ends and
        the next begins by looking at <code>model_number</code>.
      </p>

      <p>
        <strong>Required columns:</strong>{" "}
        <code>model_number</code>, <code>label</code>, <code>device_type</code>,{" "}
        <code>port_label</code>, <code>port_direction</code>, <code>port_signal_type</code>
      </p>

      <p>
        <strong>Optional columns:</strong>{" "}
        <code>manufacturer</code>, <code>category</code>, <code>reference_url</code>,{" "}
        <code>height_mm</code>, <code>width_mm</code>, <code>depth_mm</code>, <code>weight_kg</code>,{" "}
        <code>power_draw_w</code>, <code>voltage</code>, <code>thermal_btuh</code>, <code>port_connector_type</code>,{" "}
        <code>port_section</code>, <code>port_exclusive_group</code>
      </p>

      <p>
        Spreadsheet tip: in Excel or Google Sheets, fill in the device row once, then drag the device
        columns down to repeat them across every port row. Add port-specific values per row. Save as CSV.
      </p>

      <h2>Where imported devices go</h2>

      <p>
        Successful imports land in the <strong>User Templates</strong> section of your device library
        sidebar — the same place that <strong>Create New Device</strong> saves to. From there, drag them
        onto schematics like any other library device.
      </p>

      <p>
        User templates live in your browser's local storage, scoped to this machine and this domain.
        They are <strong>not</strong> automatically shared with anyone — not other users, not other
        devices you log in from. To back them up or move them, use{" "}
        <a href="/import-export">File → Export Templates</a>. To make a template available to all
        EasySchematic users, submit it to the community library (next section).
      </p>

      <h2>Submitting to the community library</h2>

      <p>
        From the import dialog, the <strong>Add &amp; Submit</strong> button does two things in one click:
        adds selected templates to your library <em>and</em> queues them for review in the community
        library. Approved templates become available to every EasySchematic user.
      </p>

      <p>Things to know:</p>
      <ul>
        <li>You need to be signed in (the API rejects anonymous submissions)</li>
        <li>Each selected device becomes one submission record in the queue</li>
        <li>
          A reviewer checks the data against manufacturer specs before approval — submitter
          notes help (e.g. "all five DTP2 transmitters in the current product line, verified against
          datasheet 2024.03")
        </li>
        <li>Rejected submissions stay in your local library; only the community-library copy is dropped</li>
      </ul>

      <h2>Common errors and fixes</h2>

      <table>
        <thead>
          <tr><th>Error message</th><th>Cause</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>Not valid JSON: …</code></td>
            <td>Unbalanced braces, trailing comma, wrong quotes</td>
            <td>Paste the source through a JSON validator. Most editors will highlight the line.</td>
          </tr>
          <tr>
            <td><code>CSV missing required columns: …</code></td>
            <td>The CSV header is missing one or more required columns</td>
            <td>Add the missing columns. Header row must use exact lowercase snake_case names — see the CSV format section above.</td>
          </tr>
          <tr>
            <td><code>Unknown deviceType "X"</code></td>
            <td>The deviceType isn't in our taxonomy</td>
            <td>Pick the closest match from the <a href="/device-template-schema">schema reference</a> (under "Valid deviceType values").</td>
          </tr>
          <tr>
            <td><code>Unknown signalType "X"</code></td>
            <td>The signal type isn't a recognized value</td>
            <td>Use one from the <a href="/device-template-schema">schema reference</a>. If we're missing a real one, file an issue and we'll add it.</td>
          </tr>
          <tr>
            <td><code>Unknown connectorType "X"</code></td>
            <td>Same as above for the physical connector</td>
            <td>Pick the closest match. Connector mismatches don't block imports — they're just visual.</td>
          </tr>
          <tr>
            <td><code>manufacturer is required</code></td>
            <td>No manufacturer field, or it's empty</td>
            <td>Add one. Use <code>"Generic"</code> if it really is vendor-agnostic — that also relaxes the modelNumber requirement.</td>
          </tr>
          <tr>
            <td><code>modelNumber is required</code></td>
            <td>Missing model number on a vendor device</td>
            <td>Add the model number. Or if it's a generic part, set manufacturer to <code>"Generic"</code>.</td>
          </tr>
          <tr>
            <td><code>referenceUrl must start with http:// or https://</code></td>
            <td>The URL is malformed</td>
            <td>Include the protocol. <code>www.foo.com</code> alone won't do.</td>
          </tr>
          <tr>
            <td><code>Row N: missing model_number</code></td>
            <td>A CSV row has no model_number on a non-Generic device</td>
            <td>Fill in the model number for that row.</td>
          </tr>
        </tbody>
      </table>

      <h2>Converting from common sources</h2>

      <h3>From Excel or Google Sheets</h3>
      <p>
        Build the row-per-port CSV directly in your sheet. Use the column names listed above, with
        device-level columns repeated across each port row. Export as CSV (<strong>File → Download → CSV</strong>{" "}
        in Sheets, <strong>Save As → CSV UTF-8</strong> in Excel) and upload.
      </p>

      <h3>From a vendor PDF or web spec sheet</h3>
      <p>
        Skim the I/O table on page two or three of the datasheet — every meaningful device documents
        its port count by signal type. Hand-build the JSON; for &lt;10 devices the minimal form is
        fastest to type.
      </p>

      <h3>From a manufacturer Visio (.vsdx) stencil</h3>
      <p>
        Visio stencils are ZIP archives of XML. Most major AV vendors (Extron, Crestron, Biamp, QSC,
        AMX, Shure) publish them with shape data containing model numbers, port counts, and physical
        dimensions. Right now we don't auto-parse them — but you can extract the data manually:
      </p>
      <ol>
        <li>Rename the <code>.vsdx</code> to <code>.zip</code> and extract</li>
        <li>Look in <code>visio/masters/</code> for shape definitions; each master XML has Prop / User cells with port counts and metadata</li>
        <li>Translate the Prop names into our schema (<code>Prop.HDMI_Inputs</code> → 4 ports of <code>signalType: "hdmi"</code> with <code>direction: "input"</code>, etc.)</li>
        <li>Build the JSON or CSV from there</li>
      </ol>
      <p>
        Direct Visio import is on the roadmap. Until then, this manual route works.
      </p>

      <h3>From scraped catalog data</h3>
      <p>
        Write a quick script that maps your source schema to ours, emits an array of device objects,
        and pipes it to the clipboard or a file. Drop it in the JSON tab. Forward-compatible by design:
        any extra fields your script tags devices with (cost center, asset tag, source URL) are
        silently ignored, so you can keep one canonical export shape across multiple downstream tools.
      </p>

      <h2>For developers writing converters</h2>

      <ul>
        <li>The schema is forward-compatible: <strong>unknown fields are silently dropped</strong>, never raised as errors</li>
        <li>Both single objects and arrays are accepted at the top level — pick whichever your generator outputs naturally</li>
        <li>Template <code>id</code> and port <code>id</code> are auto-generated if you omit them; supply your own only if you need to round-trip with an external system</li>
        <li>Validation runs entirely in the browser before anything is saved or submitted — feel free to point your CI at the import dialog and stage data through it during development</li>
        <li>
          The full list of accepted enum values is published as data on the{" "}
          <a href="/device-template-schema">schema reference page</a> — it's auto-derived from source,
          so it stays accurate as we add new types
        </li>
      </ul>
    </>
  );
}
