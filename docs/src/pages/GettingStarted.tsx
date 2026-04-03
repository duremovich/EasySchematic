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
          <tr><td><strong>Pan</strong></td><td>Hold Space + drag, or middle-mouse drag</td></tr>
          <tr><td><strong>Zoom</strong></td><td>Scroll wheel</td></tr>
          <tr><td><strong>Select</strong></td><td>Click a device or connection. Shift+click for multi-select</td></tr>
          <tr><td><strong>Box select</strong></td><td>Click and drag on empty canvas</td></tr>
          <tr><td><strong>Delete</strong></td><td>Select items, then press Delete or Backspace</td></tr>
          <tr><td><strong>Connect</strong></td><td>Click an output port, then click a compatible input</td></tr>
          <tr><td><strong>Reconnect</strong></td><td>Drag from a connected port to move the connection</td></tr>
          <tr><td><strong>Disconnect</strong></td><td>Drag from a connected port and release on empty space</td></tr>
          <tr><td><strong>Copy/Paste</strong></td><td>Ctrl+C / Ctrl+V</td></tr>
          <tr><td><strong>Undo/Redo</strong></td><td>Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y)</td></tr>
          <tr><td><strong>Align</strong></td><td>Select multiple items, then use the Align menu in the menu bar</td></tr>
          <tr><td><strong>Quick-add device</strong></td><td>Double-click empty canvas or room background</td></tr>
          <tr><td><strong>Room properties</strong></td><td>Right-click a room</td></tr>
          <tr><td><strong>Print View</strong></td><td>Press F9</td></tr>
          <tr><td><strong>Dark mode</strong></td><td>Sun/moon icon in the menu bar (right side)</td></tr>
        </tbody>
      </table>

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

      <h3>Scroll wheel configuration</h3>
      <p>
        Assign actions for each scroll modifier combination:
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
          <strong>Trackpad mode</strong> — enable trackpad detection for pinch-to-zoom and two-finger pan
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
          <strong>Cloud save</strong> — create a free account (magic-link email login, no password) to save up to
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
