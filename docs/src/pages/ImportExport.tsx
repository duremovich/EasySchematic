export default function ImportExportPage() {
  return (
    <>
      <h1>Import / Export</h1>

      <h2>JSON (native format)</h2>
      <p>
        The JSON format is EasySchematic's native file format. It contains the complete schematic — all devices,
        connections, rooms, and configuration.
      </p>

      <h3>Export</h3>
      <p>
        <strong>File → Export JSON</strong> saves a <code>.json</code> file with:
      </p>
      <ul>
        <li>Schema version (for forward compatibility)</li>
        <li>Schematic name</li>
        <li>All devices, rooms, and notes</li>
        <li>All connections (with signal type metadata)</li>
        <li>Custom templates (if any)</li>
        <li>Signal color customizations (if any)</li>
        <li>Print settings (paper size, orientation, scale)</li>
        <li>Title block data and layout</li>
      </ul>

      <h3>Import</h3>
      <p>
        <strong>File → Import JSON</strong> loads a previously exported file. Schema migrations run automatically if
        the file was saved with an older version.
      </p>

      <h2>PNG / SVG (image export)</h2>
      <ul>
        <li><strong>Export PNG</strong> — raster image at screen resolution, suitable for documents and presentations</li>
        <li><strong>Export SVG</strong> — vector image, scalable to any size without quality loss</li>
      </ul>
      <p>Both capture the current viewport contents.</p>

      <h2>DXF (CAD export)</h2>
      <p>
        <strong>Export DXF</strong> generates an AutoCAD R12 DXF file compatible with:
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

      <h2>PDF</h2>
      <p>
        <strong>Export PDF</strong> generates a multi-page document matching your Print View settings. Each page includes
        the title block. See <a href="#/printing">Printing &amp; Title Block</a> for page setup details.
      </p>

      <h2>Print</h2>
      <p>
        <strong>File → Print</strong> opens the browser's print dialog with a clean layout optimized for your Print View
        settings. For full details on page setup, title block configuration, and PDF export,
        see <a href="#/printing">Printing &amp; Title Block</a>.
      </p>
      <p>For best results, enable "Background graphics" in your browser's print settings.</p>
    </>
  );
}
