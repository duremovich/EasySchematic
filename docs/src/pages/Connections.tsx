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
        <li>Ports with <strong>matching signal types</strong> connect directly. Mismatched signal types can connect via an <strong>adapter</strong> (see below)</li>
        <li>Each <strong>input</strong> port accepts only <strong>one</strong> connection</li>
        <li><strong>Output</strong> ports can feed multiple inputs</li>
        <li>
          <strong>Bidirectional</strong> ports connect on one side at a time — connecting one side disables the other
        </li>
        <li>
          <strong>Network signal types</strong> (Ethernet, Dante, AVB, NDI, SRT, HDBaseT, AES67, ST 2110) can connect
          in <strong>any direction</strong> — input-to-input, output-to-output, or any combination
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

      <h3>Estimated cable length</h3>
      <p>
        When both endpoints of a connection live inside <strong>placed rooms</strong>, EasySchematic estimates a cable
        length from the geometry between the two rooms (room-to-room distance, plus a small slack allowance). The
        estimate appears in a separate <strong>Est. Length</strong> column in both the cable schedule and the patch
        panel schedule, so you can compare it against the manual <strong>Cable Length</strong> column or use it as a
        starting point when filling in your final lengths. Devices outside any room don't get an estimate — the tool
        needs both endpoints anchored in real space to do the math.
      </p>

      <h2>Line styles</h2>
      <p>
        Each connection can have a custom <strong>line style</strong> — solid (default),
        dashed, dotted, or dash-dot. Set it per-connection by right-clicking the connection
        and hovering the <strong>Line Style</strong> submenu, which previews each option as a
        swatch before you commit. Or set a default line style per signal type in the{" "}
        <strong>Signal Colors</strong> panel.
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

      <h2>Multi-connect ports</h2>
      <p>
        By default, each port accepts <strong>one connection</strong>. Some signals don't work that way in real life —
        an SRT decoder can listen for many sender streams on a single UDP port, a wireless mic receiver pairs with
        multiple transmitters, and a streaming encoder can broadcast one feed to many destinations. For these cases,
        a port can be marked <strong>multi-connect</strong> to allow N connections to or from a single port.
      </p>
      <ul>
        <li>
          Toggle multi-connect per port in the <strong>device editor</strong> — look for the
          <strong> M</strong> badge on each port row (next to the multicable <strong>T</strong> toggle)
        </li>
        <li>
          New ports default to multi-connect when their signal type is <strong>SRT</strong> or <strong>Custom</strong>,
          or when their connector type is <strong>Wireless</strong>
        </li>
        <li>
          Multi-connect handles show an <strong>amber hover ring</strong> and crosshair cursor so you know you can
          pull additional threads from a port that already has connections attached
        </li>
        <li>
          Each connection still appears as its own line on the canvas and its own row in the cable schedule —
          multi-connect only relaxes the connection-count rule
        </li>
      </ul>

      <h2>Adapters</h2>
      <p>
        When you connect ports with incompatible signal types or different connector types, EasySchematic
        can automatically insert an <strong>adapter</strong> device between them.
      </p>

      <h3>Connection preview colors</h3>
      <p>While dragging a connection, the preview line color tells you what will happen:</p>
      <ul>
        <li><strong style={{ color: "#22c55e" }}>Green</strong> — compatible, connection will be made directly</li>
        <li><strong style={{ color: "#eab308" }}>Yellow</strong> — incompatible, but an adapter is available and will be inserted</li>
        <li><strong style={{ color: "#ef4444" }}>Red</strong> — incompatible, no adapter available</li>
      </ul>

      <h3>Auto-insertion</h3>
      <p>When you complete an incompatible connection:</p>
      <ul>
        <li>If exactly <strong>one</strong> adapter template matches, it's inserted automatically between the two devices</li>
        <li>If <strong>multiple</strong> adapters match, a dialog lets you choose which one to insert</li>
        <li>You can also click <strong>Connect Anyway</strong> to force the connection without an adapter</li>
      </ul>

      <h3>Adapters vs converters</h3>
      <ul>
        <li>
          <strong>Adapters</strong> are passive devices (dongles, cable adapters, barrels) — they appear
          in the <strong>cables</strong> section of the pack list
        </li>
        <li>
          <strong>Converters</strong> are active devices (e.g., Decimator, BMD Mini Converter) — they appear
          in the <strong>devices</strong> section and must be placed manually from the device library
        </li>
      </ul>

      <h3>Gender labeling (M/F)</h3>
      <p>
        Adapter templates include gender labels — e.g., "USB-C (M) → HDMI (F) Adapter".
        <strong> M</strong> = male plug, <strong>F</strong> = female socket. This distinction matters for
        pack lists so you know exactly which adapter to pull.
      </p>

      <h3>Direct attach</h3>
      <p>
        Some adapter ports are <strong>direct-attach</strong> — they plug directly into a device with no
        separate cable needed. For example, a USB-C dongle's USB-C end plugs straight into a laptop.
      </p>
      <ul>
        <li>Direct-attach connections render as <strong>thin gray lines</strong> instead of colored cable lines</li>
        <li>They don't appear in the cable schedule or get cable ID numbers</li>
        <li>They're excluded from pack list cable counts</li>
        <li>
          Toggle direct-attach per port in the <strong>device editor</strong> — look for the
          <strong> DA</strong> badge on each port row (only visible on adapter devices)
        </li>
      </ul>

      <h3>Barrels</h3>
      <p>
        Barrel couplers (F↔F) join two cables end-to-end — for example, an HDMI barrel connects two HDMI
        cables. They have no direct-attach ports since both sides need cables. Search "barrel" in the device
        library to find them.
      </p>

      <h3>Hiding adapters</h3>
      <p>For cleaner schematics, you can hide adapter devices from the canvas:</p>
      <ul>
        <li>
          <strong>Hide all adapters</strong> — open the <strong>View Options</strong> panel (right sidebar)
          → <strong>Adapters</strong> section → check <strong>Hide all adapters</strong>
        </li>
        <li>
          <strong>Hide one adapter</strong> — right-click any connection to an adapter and
          select <strong>Hide Adapter</strong>
        </li>
        <li>
          <strong>Show a hidden adapter</strong> — right-click the merged connection line where the adapter
          was and select <strong>Show Adapter</strong>
        </li>
        <li>Hidden adapters collapse into a single connection line between the real devices</li>
        <li>When a hidden adapter bridges different signal types, the line renders as a <strong>color gradient</strong></li>
      </ul>
      <p>
        For finer control, double-click an adapter → <strong>Advanced</strong> →
        <strong> Visibility</strong> dropdown:
      </p>
      <ul>
        <li><strong>Default</strong> — follows the global "Hide all adapters" toggle</li>
        <li><strong>Always Show</strong> — stays visible even when "Hide all adapters" is on</li>
        <li><strong>Always Hide</strong> — hidden even when "Hide all adapters" is off</li>
      </ul>
      <p>
        Hidden adapters <strong>still appear in the pack list</strong> — the pack list is always the
        complete bill of materials regardless of what's visible on the canvas.
      </p>

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
        right-click a connection to set a custom <strong>Cable ID</strong>, or hide the label on a single connection
        by choosing <strong>Hide Cable ID</strong>. To start fresh, use the option to
        <strong>Clear All Cable IDs</strong> from the same menu.
      </p>

      <h2>Line jump arcs</h2>
      <p>
        When connections cross over each other, EasySchematic can render small <strong>arc markers</strong> at each
        crossing point. This makes it much easier to trace individual paths through a dense schematic. Toggle line
        jump arcs on or off from the <strong>View</strong> menu.
      </p>

      <h2>Bulk editing connections</h2>
      <p>
        Select multiple connections and edit their properties all at once. Use box-select or Shift+click to build up
        a selection — crossing-select (right-to-left drag) picks up any connection whose path crosses the box,
        not just those with both endpoints inside.
      </p>
      <p>
        Whenever 2 or more items are selected, a <strong>selection bar</strong> appears at the bottom center of the
        canvas showing a chip for each kind of entity in your selection. Click a chip to <strong>solo</strong> that
        kind (keep only those items selected). Ctrl/⌘+click to <strong>deselect</strong> that kind instead.
      </p>
      <p>
        When connections are among the selected items, an <strong>Edit N connections…</strong> button appears in the
        selection bar. Click it to open the bulk edit panel, which lets you apply changes to all selected connections
        in one undo step:
      </p>
      <ul>
        <li><strong>Label</strong> — overwrite all labels with new text, or append text to each existing label. Use the Clear button to remove labels from all selected connections.</li>
        <li><strong>Line style</strong> — set solid, dashed, dotted, or dash-dot across the whole selection. A highlighted button shows the current style when all connections match; shows "(mixed)" when they differ.</li>
        <li><strong>Direct Attach</strong> — toggle the direct-attach flag (thin gray line, excluded from cable schedule).</li>
        <li><strong>Hide Cable ID</strong> — hide or show the auto-generated cable ID label.</li>
        <li><strong>Hide Custom Label</strong> — hide or show the custom label independently of the cable ID.</li>
      </ul>
      <p>
        The panel stays open even if you accidentally click the canvas and deselect everything — re-select
        connections and the controls become active again.
      </p>

      <h2>Stubbed connections</h2>
      <p>
        Connections can be rendered as short <strong>stubs</strong> from each port instead of full routed lines. This
        is useful for reducing visual clutter on busy schematics where the routing itself isn't important. Right-click
        a connection and select <strong>Stub Connection</strong> to toggle between stubbed and fully routed display.
      </p>
      <p>
        Each stub end displays a <strong>label</strong> showing where the connection goes — the destination device
        name, room (if applicable), and page number (in print view). Labels are <strong>draggable</strong> — grab
        and move them to reposition the stub endpoint.
      </p>
      <ul>
        <li>Stub lines follow <strong>orthogonal routing</strong> with curved corners, matching normal connections</li>
        <li>Right-click a stub to <strong>Add Handle</strong> for intermediate waypoints, just like normal connections</li>
        <li>Stubbed connections are excluded from <strong>line jump</strong> detection — they won't cause arc markers on other connections</li>
        <li>Stubbed connections don't generate <strong>page-break crossing labels</strong></li>
      </ul>

      <h3>Customizing stub labels</h3>
      <p>
        Two options in <strong>Preferences → Display → Stub labels</strong> control what appears on stub labels
        across the whole schematic:
      </p>
      <ul>
        <li>
          <strong>Show port name on stub labels</strong> — adds the destination port in brackets after the device,
          e.g. <code>→ Projector [HDMI In 1] (Main Hall) Pg 3</code>. Useful when a device has many ports of the
          same signal type.
        </li>
        <li>
          <strong>Page number on stub labels</strong> — choose <em>Cross-page only</em> (default), <em>Always</em>,
          or <em>Never</em>. Cross-page only suppresses the <code>Pg N</code> tag when both ends of a stub
          happen to land on the same printed page, which is usually noise.
        </li>
      </ul>
      <p>
        Both settings can also be overridden on a single connection. Right-click a stubbed connection and use
        <strong>Stub Port</strong> or <strong>Stub Page</strong> — each cycles through <em>Default</em>
        (use the global setting) and explicit values, so an individual stub can opt in or out independently.
      </p>

      <h2>Connector compatibility</h2>
      <p>
        Ports have a <strong>connector type</strong> (XLR-3, RJ45, HDMI, etc.) in addition to their signal type.
        EasySchematic automatically handles connector compatibility:
      </p>
      <ul>
        <li>
          <strong>Native acceptance</strong> — some connectors physically accept other plug types with no adapter.
          EtherCon accepts RJ45, opticalCON accepts LC, and XLR/TRS Combo jacks accept both XLR-3 and 1/4" TRS.
        </li>
        <li>
          <strong>Adapter required</strong> — when two ports have the same signal type but different connectors
          (e.g., IEC to Edison, USB-C to USB-A), EasySchematic will prompt you to insert an adapter device
          or auto-insert one if there's a single match.
        </li>
        <li>
          <strong>Bare wire connectors</strong> — Phoenix and Terminal Block connectors are universally compatible
          with any other connector type, since there's no physical connector — the cable goes straight into the block.
        </li>
      </ul>

      <h2>Force-connecting incompatible ports</h2>
      <p>
        If no adapter template exists for a connector or signal mismatch, you can still force the connection.
        The dialog offers a <strong>Connect Anyway</strong> button, or you can right-click an existing
        connection and select <strong>Allow Incompatible Connectors</strong>. Use this sparingly — forced
        connections won't accurately reflect your cable needs in the pack list.
      </p>
    </>
  );
}
