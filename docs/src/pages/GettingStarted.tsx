import ConnectionDemo from "../components/demos/ConnectionDemo";

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
          <strong>Connect ports</strong> by clicking an output port, then clicking a matching input port
        </li>
        <li>
          <strong>Save</strong> happens automatically to your browser's localStorage
        </li>
      </ol>

      <h2>Try it</h2>
      <p>
        This demo has a Camera and a Switcher. Try drawing a connection from the Camera's{" "}
        <strong>HDMI Out</strong> to the Switcher's <strong>HDMI In 1</strong>:
      </p>
      <ConnectionDemo />

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
          <tr><td><strong>Align</strong></td><td>Select multiple items, then use the Align menu in the toolbar</td></tr>
        </tbody>
      </table>

      <h2>Saving your work</h2>
      <p>
        EasySchematic auto-saves to your browser's localStorage after every change. To share or back up your work:
      </p>
      <ul>
        <li>
          <strong>File → Export JSON</strong> — saves a <code>.json</code> file you can re-import later
        </li>
        <li>
          <strong>File → Export PNG/SVG</strong> — image export for documentation
        </li>
        <li>
          <strong>File → Export DXF</strong> — CAD-compatible export for Vectorworks and other tools
        </li>
        <li>
          <strong>File → Export PDF</strong> — multi-page document matching your Print View settings
        </li>
      </ul>
    </>
  );
}
