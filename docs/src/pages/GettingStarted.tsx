export default function GettingStartedPage() {
  return (
    <>
      <h1>Getting Started</h1>

      <h2>Quick start</h2>
      <ol>
        <li>
          <strong>Open</strong>{" "}
          <a href="https://easyschematic.live/">EasySchematic</a> in your browser
        </li>
        <li>
          <strong>Drag a device</strong> from the library sidebar on the left onto the canvas
        </li>
        <li>
          Or <strong>double-click</strong> the canvas to search and place a device without dragging
        </li>
        <li>
          <strong>Connect ports</strong> by clicking an output port, then clicking a matching input port
        </li>
        <li>
          <strong>Save</strong> happens automatically to your browser's localStorage. Optionally, create a free
          account to save to the cloud
        </li>
      </ol>

      <h2>Controls</h2>
      <table>
        <thead>
          <tr>
            <th>Action</th>
            <th>How</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><strong>Pan</strong></td><td>Hold Space + drag, middle-mouse drag, or two-finger trackpad movement when Trackpad input is selected. In "Drag to pan" mode, left drag also pans.</td></tr>
          <tr><td><strong>Zoom</strong></td><td>Scroll wheel in Mouse wheel mode, or pinch in Trackpad/Automatic mode</td></tr>
          <tr><td><strong>Select</strong></td><td>Click a device or connection</td></tr>
          <tr><td><strong>Toggle selection</strong></td><td>Shift+click to add/remove items from the current selection</td></tr>
          <tr><td><strong>Box select</strong></td><td>Click and drag on empty canvas (default mode). In "Drag to pan" mode, hold Shift and drag instead.</td></tr>
          <tr><td><strong>Directional select</strong></td><td>Drag right to enclose (only items fully inside), drag left to crossing-select (anything the box touches) — AutoCAD-style. Crossing mode also picks up connections whose routed paths cross the box.</td></tr>
          <tr><td><strong>Selection bar</strong></td><td>Appears at the bottom of the canvas when 2+ items are selected. Shows a chip per entity kind — click to solo that kind, Ctrl/⌘+click to deselect it. When connections are selected, an <strong>Edit N connections…</strong> button opens the bulk edit panel.</td></tr>
          <tr><td><strong>Delete</strong></td><td>Select items, then press Delete or Backspace</td></tr>
          <tr><td><strong>Connect</strong></td><td>Click an output port, then click a compatible input</td></tr>
          <tr><td><strong>Reconnect</strong></td><td>Drag from a connected port to move the connection</td></tr>
          <tr><td><strong>Disconnect</strong></td><td>Drag from a connected port and release on empty space</td></tr>
          <tr><td><strong>Copy/Paste</strong></td><td>Ctrl+C / Ctrl+V</td></tr>
          <tr><td><strong>Undo/Redo</strong></td><td>Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y)</td></tr>
          <tr><td><strong>Align</strong></td><td>Select multiple items, then use the Align menu in the menu bar</td></tr>
          <tr><td><strong>Quick-add device</strong></td><td>Double-click empty canvas or room background</td></tr>
          <tr><td><strong>Room properties</strong></td><td>Right-click a room</td></tr>
          <tr><td><strong>Connection menu</strong></td><td>Right-click a connection — add waypoints, toggle stub, override connector mismatch, hide label, reset route</td></tr>
          <tr><td><strong>Print View</strong></td><td>Press F9</td></tr>
          <tr><td><strong>Dark mode</strong></td><td>Sun/moon icon in the menu bar (right side)</td></tr>
        </tbody>
      </table>

      <h2>Pages</h2>
      <p>
        A schematic file can hold multiple pages, shown as tabs at the bottom of the canvas:
      </p>
      <ul>
        <li>
          <strong>Schematic</strong> — the signal flow diagram (always present, always first)
        </li>
        <li>
          <strong>Rack pages</strong> — drag-to-rack elevation drawings with snap-to-U placement,
          front / rear / side views, and accessories. Add via the <strong>+</strong> button at the
          right end of the tab bar. See the <a href="/racks">Rack Builder guide</a>.
        </li>
        <li>
          <strong>Print sheets</strong> — paper-sized layout pages for composing rack viewports
          into a printable drawing with vector PDF export. Add via the <strong>📄+</strong> button.
          See <a href="/print-sheets">Print Sheets</a>.
        </li>
      </ul>
      <p>
        Right-click a tab to rename, duplicate, or delete the page. Devices are shared by reference
        across pages — placing a device on a rack doesn&apos;t duplicate it; the rack page just
        references the schematic device by ID. Edit it in either place and both stay in sync.
      </p>

      <h2>Dark mode</h2>
      <p>
        Click the <strong>sun/moon icon</strong> in the right side of the menu bar to toggle between light and dark
        themes. The preference is saved to your browser and automatically applied on future visits. On first visit,
        EasySchematic follows your OS dark mode setting.
      </p>
      <p>
        The dark mode toggle is also available in the <strong>devices database</strong> (devices.easyschematic.live)
        via the same icon in the top navigation bar.
      </p>

      <h2>Preferences</h2>
      <p>
        Open <strong>Edit → Preferences</strong> to customize application behavior.
      </p>

      <h3>Navigation (left-drag behavior)</h3>
      <p>
        Controls what left drag does on the canvas background. The full button map is always
        shown in Preferences so you can see exactly what each input does at a glance:
      </p>
      <table>
        <thead>
          <tr>
            <th>Input</th>
            <th>Drag to select (default)</th>
            <th>Drag to pan</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><strong>Left drag</strong></td><td>Selection box</td><td>Pan canvas</td></tr>
          <tr><td><strong>Shift + left drag</strong></td><td>Add to selection</td><td>Selection box</td></tr>
          <tr><td><strong>Middle drag</strong></td><td colSpan={2}>Pan canvas (always)</td></tr>
          <tr><td><strong>Space + drag</strong></td><td colSpan={2}>Pan canvas (always)</td></tr>
        </tbody>
      </table>
      <p>
        "Drag to pan" is useful if you're coming from Figma, Miro, or draw.io and prefer left drag
        to navigate rather than select.
      </p>

      <h3>Scroll wheel configuration</h3>
      <p>
        In <strong>Mouse wheel</strong> input mode, assign actions for each scroll modifier combination:
      </p>
      <table>
        <thead>
          <tr>
            <th>Input</th>
            <th>Default action</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><strong>Scroll</strong></td><td>Zoom</td></tr>
          <tr><td><strong>Shift + Scroll</strong></td><td>Pan left / right</td></tr>
          <tr><td><strong>Ctrl + Scroll</strong></td><td>Pan up / down</td></tr>
        </tbody>
      </table>
      <p>
        Available actions: <strong>Zoom</strong>, <strong>Pan left/right</strong>, and <strong>Pan up/down</strong>.
        Use the <strong>Reset to defaults</strong> button to restore the default bindings.
      </p>

      <h3>Trackpad support</h3>
      <ul>
        <li>
          <strong>Input device</strong> — choose <strong>Trackpad</strong> in Preferences &gt; Canvas to use pinch-to-zoom and two-finger pan from the first movement
        </li>
        <li>
          <strong>Automatic</strong> — preserves the previous trackpad detection behavior for users who do not choose an explicit input device
        </li>
        <li>
          <strong>Sensitivity</strong> — zoom speed and pan speed sliders (0.25x–3x) to fine-tune trackpad responsiveness
        </li>
      </ul>

      <h3>Connection hitbox</h3>
      <p>
        Adjusts how close your cursor needs to be to a connection to select it. Increase the hitbox
        size if you find connections hard to click on. Available in{" "}
        <strong>Edit → Preferences</strong>.
      </p>

      <h3>Label case</h3>
      <p>
        Forces the display case of device names, port labels, slot labels, and card labels across
        the canvas and in all exports (PDF, DXF, pack list, cable schedule, patch panel schedule,
        network / power reports):
      </p>
      <ul>
        <li><strong>As-typed</strong> — default; labels appear exactly as entered</li>
        <li><strong>UPPERCASE</strong> — forces everything to uppercase</li>
        <li><strong>lowercase</strong> — forces everything to lowercase</li>
        <li>
          <strong>Capitalize Words</strong> — capitalizes the first letter of each word; leaves
          existing uppercase letters alone so acronyms like HDMI and SDI stay intact
        </li>
      </ul>
      <p>
        The preference is display-only — your underlying label data is never modified, so you can
        switch back to <strong>As-typed</strong> at any time to see the original casing. The
        preference is saved with the schematic, so shared files arrive with the same setting.
      </p>

      <h2>View options</h2>
      <p>
        Open the <strong>View Options</strong> panel from the right sidebar (or via the{" "}
        <strong>View</strong> menu) to control what's visible on the canvas:
      </p>
      <ul>
        <li>
          <strong>Signal type visibility</strong> — toggle individual signal types on/off to focus on
          specific signal flows. "Show All" button resets.
        </li>
        <li>
          <strong>Hide unconnected ports</strong> — hides ports with no connections for a cleaner look
        </li>
        <li>
          <strong>Show device types</strong> — toggle device type labels under device names
        </li>
        <li>
          <strong>Show line jumps</strong> — arc markers at connection crossings for visual clarity
        </li>
        <li>
          <strong>Show cable labels</strong> — display cable ID labels on connections
        </li>
        <li>
          <strong>Hide adapters</strong> — collapse adapter devices into single connection lines (see
          Connections guide for details)
        </li>
      </ul>

      <h2>Saving your work</h2>
      <ul>
        <li>
          <strong>Auto-save</strong> — saves to localStorage after every change (always on, no account needed)
        </li>
        <li>
          <strong>Cloud save</strong> — create a free account (magic-link email or Google sign-in, no password needed) to save up to
          10 schematics to the cloud. Access them from any browser via <strong>File → My Schematics</strong>
        </li>
        <li>
          <strong>Share</strong> — toggle sharing on any cloud-saved schematic to generate a link anyone can open
        </li>
        <li>
          <strong>Save as file</strong> — exports a <code>.json</code> file you can re-import later
        </li>
        <li>
          <strong>Export → PNG/SVG</strong> — image export for documentation
        </li>
        <li>
          <strong>Export → DXF</strong> — CAD-compatible export for Vectorworks and other tools
        </li>
        <li>
          <strong>Export → PDF</strong> — multi-page document matching your Print View settings
        </li>
      </ul>
    </>
  );
}
