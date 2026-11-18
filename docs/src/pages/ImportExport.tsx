export default function ImportExportPage() {
  return (
    <>
      <h1>Files & Exports</h1>

      <h2>Cloud storage</h2>
      <p>
        Cloud storage is separate from file export — it saves the full schematic to EasySchematic's servers so you
        can access it from any browser.
      </p>
      <ul>
        <li>Create a free account via magic-link email or Google sign-in (no password needed)</li>
        <li>Save via <strong>File → Save to Cloud</strong> or manage all saved schematics via <strong>File → My Schematics</strong></li>
        <li>Up to 10 schematics per account</li>
        <li>Cloud schematics are cached to IndexedDB for <strong>offline access</strong> — recently opened cloud files are available even without internet</li>
        <li>Toggle sharing on any saved schematic in My Schematics to generate a link anyone can open</li>
      </ul>

      <h3>New file template</h3>
      <p>
        You can designate any cloud-saved schematic as your <strong>new file template</strong>. When you
        click <strong>File → New</strong>, the template is loaded with all its devices, title block settings,
        print layout, and custom devices pre-filled — so you don't have to re-enter the same information every time.
      </p>
      <ul>
        <li>Open <strong>File → My Schematics</strong> and click the <strong>star icon</strong> on any schematic to set it as your template</li>
        <li>Click the star again to remove the template designation</li>
        <li>Only one template can be active at a time — setting a new one replaces the old one</li>
        <li>The template schematic itself is not affected — it stays in your file list as a normal save</li>
        <li>If no template is set, <strong>File → New</strong> creates a blank schematic as usual</li>
      </ul>

      <h2>JSON (native format)</h2>
      <p>
        The JSON format is EasySchematic's native file format. It contains the complete schematic — all devices,
        connections, rooms, and configuration.
      </p>

      <h3>Export</h3>
      <p>
        Click <strong>Save</strong> in the menu bar to export a <code>.json</code> file with:
      </p>
      <ul>
        <li>Schema version (for forward compatibility)</li>
        <li>Schematic name</li>
        <li>All devices, rooms, and notes</li>
        <li>All connections (with signal type metadata)</li>
        <li>All <a href="/racks">rack pages</a> — racks, device placements (referenced by ID, not duplicated), and accessories</li>
        <li>All <a href="/print-sheets">print sheets</a> — paper size, orientation, and rack viewports</li>
        <li>Custom templates (if any)</li>
        <li>Signal color customizations (if any)</li>
        <li>Print settings (paper size, orientation, scale)</li>
        <li>Title block data and layout</li>
        <li>Report layout preferences (pack list column visibility, sorting, header/footer layout)</li>
      </ul>

      <h3>Import</h3>
      <p>
        Click <strong>Open...</strong> in the menu bar to import a previously exported file. Schema migrations run automatically if
        the file was saved with an older version.
      </p>

      <h2>Device templates</h2>
      <p>
        You can export and import your user device templates separately from full schematics.
        This is useful for sharing your custom device library with colleagues or backing it up.
      </p>
      <ul>
        <li>
          <strong>Export templates</strong> — saves your user device templates as a <code>.json</code> file
        </li>
        <li>
          <strong>Import templates</strong> — loads templates from a file, merging them with your existing user templates
        </li>
      </ul>
      <p>
        This is separate from schematic <strong>Save / Open</strong>, which handles full schematics
        (devices, connections, rooms, and all configuration).
      </p>
      <p>
        Looking to bulk-import devices from a vendor catalog, spreadsheet, or other external source?
        See <a href="/import-devices">Import Devices</a> for the JSON / CSV import workflow.
      </p>

      <h2>CSV import (cable schedule)</h2>
      <p>
        Import a cable schedule spreadsheet to auto-generate a schematic with devices, rooms, and connections.
        Access it via <strong>File</strong> menu → <strong>Import Cable Schedule...</strong>
      </p>
      <p>
        <a href="/examples/cable-schedule-sample.csv" download>cable-schedule-sample.csv</a> —
        a small schedule with a handful of realistic rows, including the <code>Room &gt; Subroom</code> path
        syntax described below. Download it, or open the link to inspect the column layout.
      </p>
      <p>The import wizard has two steps:</p>
      <ol>
        <li>
          <strong>Upload &amp; map columns</strong> — paste CSV data or upload a file. Map your spreadsheet columns
          to roles: Source Device, Source Port, Destination Device, Destination Port, Signal Type, Source Room, and
          Destination Room. The wizard auto-detects common column names, so most spreadsheets work with minimal
          adjustment. Only Source Device and Destination Device are required.
        </li>
        <li>
          <strong>Review device matches</strong> — each unique device name from your spreadsheet is matched against
          the device library. Review and adjust matches as needed; unmatched devices create generic placeholders
          with ports inferred from the cable schedule data.
        </li>
      </ol>
      <p>
        After import, devices are placed on the canvas organized by room (if room columns are mapped) with all
        connections drawn. This is useful for converting existing cable schedules from Excel, Google Sheets, or
        any other tool that can export CSV into a visual schematic.
      </p>

      <h3>Nested subrooms via room paths</h3>
      <p>
        Room columns accept a <strong>room path</strong> using <code>&gt;</code> as a separator, so a cable
        schedule can create <a href="/rooms-and-grouping">subrooms</a> in bulk:
      </p>
      <table>
        <thead>
          <tr>
            <th>Room column value</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>Sanctuary</code></td><td>Device is placed in a top-level room "Sanctuary"</td></tr>
          <tr><td><code>Sanctuary &gt; FOH</code></td><td>Device is placed in a subroom "FOH" nested inside "Sanctuary"</td></tr>
        </tbody>
      </table>
      <ul>
        <li>Whitespace around the <code>&gt;</code> is ignored — <code>Sanctuary&gt;FOH</code> and <code>Sanctuary &gt; FOH</code> are the same subroom — and empty path segments are skipped</li>
        <li>Paths can nest to any depth, e.g. <code>Campus &gt; Sanctuary &gt; FOH</code></li>
        <li>Every room along the path is created automatically, even if no device sits directly in it</li>
        <li>The cable schedule CSV export writes its Src Room / Tgt Room columns in this same path syntax, so an exported schedule re-imports with its subroom nesting intact</li>
        <li>The separator cannot be escaped: a room whose name literally contains <code>&gt;</code> (e.g. <code>A &gt; B</code>) re-imports as a subroom "B" nested inside "A"</li>
      </ul>

      <h2>PNG / SVG (image export)</h2>
      <ul>
        <li><strong>Export PNG</strong> — high-resolution raster image rendered at 4× pixel density, suitable for documents and presentations</li>
        <li><strong>Export SVG</strong> — vector image, scalable to any size without quality loss</li>
      </ul>
      <p>
        Both capture the entire schematic — every device on the canvas, framed to its bounds with a small
        margin — regardless of how the canvas is currently panned or zoomed.
      </p>

      <h2>DXF (CAD export)</h2>
      <p>
        <strong>Export DXF</strong> generates an AutoCAD 2004 (AC1018) DXF file with canvas-faithful visuals —
        device shapes, port handles, signal-colored connections, line styles, and labels all carry over to your CAD
        tool with the geometry that was on screen. Compatible with:
      </p>
      <ul>
        <li><strong>Vectorworks</strong> (primary target)</li>
        <li>AutoCAD</li>
        <li>Most CAD software that reads DXF</li>
      </ul>

      <h3>DXF layer structure</h3>
      <p>
        Layers use a <code>-</code> separator for Vectorworks class hierarchy:
      </p>
      <table>
        <thead>
          <tr>
            <th>Layer</th>
            <th>Contents</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>EasySchematic-Devices</code></td><td>Device rectangles and labels</td></tr>
          <tr><td><code>EasySchematic-Rooms</code></td><td>Room container outlines and labels</td></tr>
          <tr><td><code>EasySchematic-Connections-SDI</code></td><td>SDI connections (one layer per signal type)</td></tr>
          <tr><td><code>EasySchematic-Connections-HDMI</code></td><td>HDMI connections</td></tr>
          <tr><td>...</td><td>One layer per signal type in use</td></tr>
        </tbody>
      </table>

      <h3>DXF colors</h3>
      <p>
        Each signal type maps to an AutoCAD Color Index (ACI) color that approximates the on-screen signal color.
      </p>

      <h3>DXF lineweights</h3>
      <p>
        Connections export at 0.25 mm. A connection given a heavier or lighter{" "}
        <a href="/connections">line width</a> exports at the nearest standard lineweight (1 px → 0.13 mm up to
        8 px → 1.00 mm). Turn on lineweight display in your CAD tool (<code>LWDISPLAY</code> in AutoCAD) to see
        the difference.
      </p>

      <h2>PDF</h2>
      <p>
        <strong>Export PDF</strong> generates a multi-page document matching your Print View settings. Each page includes
        the title block. See <a href="/printing">Printing &amp; Title Block</a> for page setup details.
      </p>

      <p>
        For full details on page setup, title block configuration, and PDF export,
        see <a href="/printing">Printing &amp; Title Block</a>.
      </p>
    </>
  );
}
