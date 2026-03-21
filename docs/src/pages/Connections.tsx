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

      <h2>Cable length</h2>
      <p>
        Each connection has an optional <strong>cable length</strong> field. Set it in the cable schedule
        report — lengths are stored per-connection and appear in both the cable schedule and pack list.
        The pack list groups cables by length when summarizing.
      </p>

      <h2>Multicable connections</h2>
      <p>
        EasySchematic supports <strong>multicable accessories</strong> — cable snakes, socapex, and similar bundled
        cable assemblies. These use special device templates with <strong>trunk ports</strong> that carry multiple
        signals over a single physical cable.
      </p>
      <ul>
        <li><strong>Break-in devices</strong> fan out individual connections into a trunk</li>
        <li><strong>Break-out devices</strong> split a trunk back into individual connections</li>
        <li>Trunk connections display as thicker lines on the canvas</li>
        <li>Right-click a trunk connection to set a <strong>cable label</strong></li>
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

      <h2>Cable IDs &amp; labels</h2>
      <p>
        Every connection can have a <strong>cable ID</strong> label displayed on the canvas. EasySchematic offers two
        naming schemes:
      </p>
      <ul>
        <li>
          <strong>Type-prefix</strong> (default) — IDs based on the signal type, e.g. "SDI-1", "HDMI-2"
        </li>
        <li>
          <strong>Sequential</strong> — simple numbered IDs like "Cable 1", "Cable 2"
        </li>
      </ul>
      <p>
        Use the <strong>View</strong> menu to toggle cable labels on or off across the entire canvas. You can also
        hide the label on a single connection by right-clicking it and choosing <strong>Hide Label</strong>. To start
        fresh, use the option to <strong>Clear All Cable IDs</strong> from the same menu.
      </p>

      <h2>Line jump arcs</h2>
      <p>
        When connections cross over each other, EasySchematic can render small <strong>arc markers</strong> at each
        crossing point. This makes it much easier to trace individual paths through a dense schematic. Toggle line
        jump arcs on or off from the <strong>View</strong> menu.
      </p>

      <h2>Stubbed connections</h2>
      <p>
        Connections can be rendered as short <strong>stubs</strong> from each port instead of full routed lines. This
        is useful for reducing visual clutter on busy schematics where the routing itself isn't important. Right-click
        a connection and select <strong>Stub Connection</strong> to toggle between stubbed and fully routed display.
      </p>

      <h2>Connector compatibility</h2>
      <p>
        Ports have a <strong>connector type</strong> (XLR-3, RJ45, HDMI, etc.) in addition to their signal type.
        EasySchematic automatically handles connector compatibility:
      </p>
      <ul>
        <li>
          <strong>Combo connectors</strong> — some connectors natively accept multiple plug types. For example, an
          XLR/TRS Combo jack accepts both XLR-3 and 1/4" TRS plugs without adapters. The cable schedule automatically
          labels the cable based on the plug type, not the jack type.
        </li>
        <li>
          <strong>Adapter connections</strong> — some connector pairs are compatible but require an adapter cable
          (e.g. USB-A to USB-C, DVI to HDMI). These connections are allowed automatically and the cable schedule
          labels them as adapter cables.
        </li>
        <li>
          <strong>Native acceptance</strong> — connectors like EtherCon (accepts RJ45) and opticalCON (accepts LC)
          are physically compatible with no adapter needed.
        </li>
      </ul>

      <h2>Incompatible connector override</h2>
      <p>
        If you need to force-connect ports with truly mismatched connectors that aren't covered by the automatic
        compatibility rules, right-click a connection and select <strong>Allow Incompatible Connectors</strong> to
        override the check for that connection.
      </p>
    </>
  );
}
