export default function PrintSheetsPage() {
  return (
    <>
      <h1>Print Sheets</h1>

      <p>
        Print sheets are paper-sized layout pages for composing rack views into a printable
        drawing. Drop one or more rack viewports onto a sheet, position and resize them on a
        real paper grid, and export the whole thing as a vector PDF. Think of it as the rack
        deliverable — what you hand to the install team, the venue, or the project archive.
      </p>
      <p>
        This is distinct from the schematic <a href="/printing">Print View</a>, which prints the
        signal flow diagram itself. Print sheets are for racks.
      </p>

      <h2>Creating a print sheet</h2>
      <p>
        Click the <strong>📄+</strong> button at the right end of the page tab bar to add a print
        sheet. The new tab opens to an empty paper page with the rack viewport sidebar on the left.
      </p>
      <p>
        Right-click any tab for rename / duplicate / delete.
      </p>

      <h2>Paper size and orientation</h2>
      <p>
        Pick paper size and orientation from the toolbar at the top of the print sheet.
      </p>
      <ul>
        <li><strong>Letter</strong> (8.5 × 11&quot;)</li>
        <li><strong>Tabloid</strong> (11 × 17&quot;)</li>
        <li><strong>A4</strong> (210 × 297 mm)</li>
        <li><strong>A3</strong> (297 × 420 mm)</li>
        <li><strong>Custom</strong> — type any width and height in inches</li>
      </ul>
      <p>
        Toggle between <strong>Landscape</strong> and <strong>Portrait</strong>. Changing paper or
        orientation captures an undo snapshot, so you can go back if you don&apos;t like how it
        re-flows.
      </p>

      <h2>Adding rack viewports</h2>
      <p>
        The sidebar lists every rack from your rack pages. Drag a rack onto the sheet to drop a
        viewport — front view by default, with rear and side variants available. Each viewport is a
        live window into that rack: edit the rack on its rack page and the viewport updates.
      </p>
      <p>
        Drop multiple viewports on a single sheet to lay out a multi-rack drawing. Drop the same
        rack twice to show front and rear side by side.
      </p>

      <h2>Positioning and sizing</h2>
      <ul>
        <li>
          <strong>Drag</strong> a viewport to reposition it. Alignment guides appear when an edge
          comes within 3 mm of another viewport edge or a page margin — blue dashed lines snap on
          contact.
        </li>
        <li>
          <strong>Resize</strong> from the bottom-right corner. Aspect ratio is locked to the rack&apos;s
          natural dimensions by default. Hold <strong>Shift</strong> to escape aspect lock and
          stretch freely (useful for visual grouping).
        </li>
        <li>
          Press <strong>R</strong> with one or more viewports selected to <strong>reset size</strong>
          back to the natural width-for-height aspect.
        </li>
        <li>
          <strong>Multi-select</strong> with Shift+click, marquee drag, or Ctrl+A. Selected
          viewports drag together as a group. Resizing the group preserves each viewport&apos;s
          relative position and applies a uniform scale.
        </li>
        <li>
          <strong>Delete</strong> or <strong>Backspace</strong> removes selected viewports.
        </li>
      </ul>

      <h2>Title block, face label, stats</h2>
      <p>
        Each viewport renders a chrome strip below the rack drawing:
      </p>
      <ul>
        <li><strong>Italic face label</strong> — &quot;Front&quot;, &quot;Rear&quot;, or &quot;Side&quot; depending on the viewport&apos;s view</li>
        <li><strong>Stats line</strong> — rack name, U used / U total, weight, power draw</li>
        <li><strong>Caveat line</strong> — optional notes or warnings (e.g. depth conflicts, half-rack pairing)</li>
      </ul>
      <p>
        Toggle the stats line per viewport from the right-click menu. Typography is matched to the
        rack page exactly — Inter for body text, Inter Italic for face labels — so the print sheet
        and the live rack view look the same.
      </p>

      <h2>Pan and zoom</h2>
      <p>
        Print sheets respect your <strong>scroll preferences</strong> (Edit &gt; Preferences &gt;
        Canvas). With Trackpad input selected, pinch-to-zoom and two-finger pan work alongside middle-click drag and Space+drag -
        all the same gestures as the schematic canvas.
      </p>

      <h2>Vector PDF export</h2>
      <p>
        Click <strong>Export PDF</strong> in the toolbar to render the sheet to a vector PDF. The
        export is pixel-aligned with the live preview:
      </p>
      <ul>
        <li>Rack frames with mounting holes and inner pseudo-rails</li>
        <li>Device face plates with connector icons, port labels, and section dividers</li>
        <li>Occupancy ghosts (real diagonal stripe pattern, clipped to viewport bounds)</li>
        <li>Vent-panel hatching, blank panels, drawers, cable managers</li>
        <li>Side-view U gridlines and depth indicators</li>
        <li>Shelf-mounted devices positioned at the correct shelf offset and rotation</li>
        <li>Half-rack devices on the correct side</li>
        <li>Multi-line device labels with proper word wrapping</li>
        <li>U-height (1U, 2U, …) badges next to device names</li>
        <li>Italic face label and stats line below each viewport</li>
        <li>Multiple sheets become multiple PDF pages</li>
      </ul>
      <p>
        Font sizes and stroke widths use SVG-px-to-pt conversion so visual sizes match the on-screen
        sheet. Inter Italic is bundled (Latin subset, ~70 KB) so the face label renders italic in
        the PDF without depending on system fonts.
      </p>

      <h2>Tips</h2>
      <ul>
        <li>
          Hold <strong>Shift</strong> while dragging a corner to escape aspect lock when you need a
          stretched viewport (e.g. tall rack drawn extra-tall for visual emphasis).
        </li>
        <li>
          Use <strong>Ctrl+A</strong> then <strong>R</strong> to reset every viewport on the sheet
          back to natural aspect.
        </li>
        <li>
          Duplicate a print sheet via the tab right-click menu when you want a second variant —
          paper size A vs B, landscape vs portrait, or front-only vs front-and-rear.
        </li>
        <li>
          Edits on a rack page are reflected immediately in any print sheet showing that rack — no
          re-import or refresh needed.
        </li>
      </ul>
    </>
  );
}
