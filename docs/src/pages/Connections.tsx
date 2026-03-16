import ConnectionDemo from "../components/demos/ConnectionDemo";

export default function ConnectionsPage() {
  return (
    <>
      <h1>Connections</h1>

      <h2>Drawing connections</h2>
      <p>There are two ways to connect devices:</p>

      <h3>Click-to-connect</h3>
      <ol>
        <li><strong>Click</strong> an output port (right side of a device)</li>
        <li>A preview line follows your cursor</li>
        <li><strong>Click</strong> a compatible input port on another device</li>
        <li>Press <strong>Escape</strong> to cancel</li>
      </ol>

      <h3>Drag-to-connect</h3>
      <ol>
        <li><strong>Click and drag</strong> from an output port</li>
        <li>Drag to a compatible input port</li>
        <li>Release to complete the connection</li>
      </ol>

      <h2>Connection rules</h2>
      <ul>
        <li>Connections go from <strong>output → input</strong> (left to right)</li>
        <li>Only ports with <strong>matching signal types</strong> can connect (SDI to SDI, HDMI to HDMI, etc.)</li>
        <li>Each <strong>input</strong> port accepts only <strong>one</strong> connection</li>
        <li><strong>Output</strong> ports can feed multiple inputs</li>
        <li>
          <strong>Bidirectional</strong> ports connect on one side at a time — connecting one side disables the other
        </li>
      </ul>

      <h2>Try it</h2>
      <p>One connection is already drawn. Try connecting the Camera's remaining outputs to the Switcher:</p>
      <ConnectionDemo />

      <h2>Reconnecting</h2>
      <p>To <strong>move</strong> an existing connection to a different port:</p>
      <ol>
        <li>Hover over the connected port until you see a blue glow</li>
        <li><strong>Drag</strong> from the port — the old connection detaches</li>
        <li>Drop on a new compatible port</li>
      </ol>

      <h2>Disconnecting</h2>
      <p>To <strong>remove</strong> a connection:</p>
      <ul>
        <li><strong>Drag</strong> from a connected port and release on empty space</li>
        <li>Or <strong>click</strong> the connection to select it, then press <strong>Delete</strong></li>
      </ul>

      <h2>Signal colors</h2>
      <p>
        Connections inherit the <strong>signal type color</strong> from the source port. This makes it easy to
        visually trace signal flow across a complex schematic — all SDI paths are blue, all HDMI paths are red, etc.
      </p>

      <h3>Customizing colors</h3>
      <p>
        Open the <strong>Signal Colors</strong> panel from the right sidebar to customize connection colors:
      </p>
      <ul>
        <li>Each signal type has its own <strong>color picker</strong> — click to choose a new color</li>
        <li>Changes apply immediately to all connections of that signal type on the canvas</li>
        <li>Click <strong>Reset to Defaults</strong> to restore the original color scheme</li>
        <li>Custom colors are saved with your schematic and persist across sessions</li>
      </ul>
    </>
  );
}
