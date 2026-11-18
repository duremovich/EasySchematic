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
        <li>
          Each port — input <em>or</em> output — accepts <strong>one</strong> connection by default. To let a
          single port carry several connections (one source feeding many destinations, or vice versa), mark it{" "}
          <strong>multi-connect</strong> — see <em>Multi-connect ports (1:many)</em> below
        </li>
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

      <h2>Shaping the cable path</h2>
      <p>
        Connections auto-route around devices, but you can shape any run by hand
        with <strong>path handles</strong>:
      </p>
      <ul>
        <li><strong>Right-click</strong> a connection and choose <strong>Add Handle</strong> — a handle appears where you clicked</li>
        <li><strong>Click</strong> the connection to select it, then <strong>drag</strong> a handle to reshape the run (handles snap to the grid)</li>
        <li>Right-click <strong>near a handle</strong> and choose <strong>Remove Handle</strong> to delete it</li>
        <li>Right-click and choose <strong>Reset Route</strong> to drop all handles and return to auto-routing</li>
      </ul>
      <p>
        Selecting a connection that has no handles yet shows a small{" "}
        <strong>"Right-click cable to add a path handle"</strong> hint at its midpoint. For the full
        story on how manual handles interact with auto-routing, see the{" "}
        <a href="/connection-routing">Connection Routing guide</a>.
      </p>

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

      <h2>Line width</h2>
      <p>
        Connections draw at <strong>2 px</strong> by default. To make one heavier — a bus carrying many feeds, say —
        right-click it and pick from the <strong>Line Width</strong> submenu (1–8 px). With several connections
        selected, the <strong>Edit connections</strong> panel has a <strong>Line Width</strong> row that sets them all
        at once. A selected connection draws 1 px wider. The width carries into PNG, SVG and PDF exports, and DXF
        exports map it onto the nearest standard lineweight. Direct-attach connections stay a thin grey line.
      </p>
      <p>
        On a <strong>bundle</strong>, every member runs along the same trunk, so the trunk shows as wide as its
        widest member — select the bundle's connections and set a width to make the whole bundle heavier.
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
        <li>Trunk ports only connect to other trunk ports — a trunk can't land on a normal device port</li>
        <li>Right-click a trunk connection to set a <strong>cable label</strong></li>
      </ul>

      <h2>Bundling connections</h2>
      <p>
        <strong>Bundling</strong> lets you route several connections along one shared <strong>trunk</strong> — the way
        you'd run a multicore, snake, or a taped-together bundle of cables down a single path in the real world. Unlike
        a <strong>multicable accessory</strong> (which is a physical device with trunk ports), a bundle is a routing
        choice you make over connections that already exist: it changes how they're drawn, not what they are. Each
        bundled connection stays its own cable.
      </p>
      <ul>
        <li>
          Select <strong>2 or more connections</strong>, then in the <strong>Edit connections</strong> panel
          click <strong>Bundle onto one trunk</strong>. The connections gather at one end, run together along a single
          trunk, and fan back out at the other end.
        </li>
        <li>
          You can bundle connections with <strong>mixed signal types</strong>. The trunk draws in a
          neutral grey with an <strong>N×</strong> badge showing how many connections it carries, while each
          connection keeps its own signal color at the gather/fan ends.
        </li>
        <li>
          Give the bundle a <strong>label</strong> (e.g. "Stage Snake A") in the same panel — it appears in the
          cable schedule's optional <strong>Bundle</strong> column.
        </li>
        <li>
          <strong>Click the trunk</strong> to select all of its connections at once.
        </li>
        <li>
          <strong>Right-click</strong> a bundled connection for <strong>Select Bundle Members</strong>,
          <strong> Remove from Bundle</strong>, and <strong>Dissolve Bundle</strong>.
        </li>
      </ul>
      <p>
        Bundling never changes your <strong>cable counts</strong>: every connection in a bundle is still its own row in
        the cable schedule and its own cable in the pack list. Converting a bundled connection to a{" "}
        <strong>stub</strong> removes it from the bundle, and a bundle automatically dissolves back into normal
        connections when fewer than two members remain. The cable schedule can also <strong>group by bundle</strong> if
        you want all of a bundle's cables listed together.
      </p>
      <p>
        Bundling is the deliberate opposite of the auto-router's usual job: instead of keeping connections separable,
        you're telling EasySchematic that these specific cables <em>should</em> share one physical path.
      </p>

      <h2>Multi-connect ports (1:many)</h2>
      <p>
        By default, each port accepts <strong>one connection</strong>. Some signals don't work that way in real life —
        one Dante flow can feed many destinations, an SRT decoder can listen for many sender streams on a single UDP
        port, a wireless mic receiver pairs with multiple transmitters, and a streaming encoder can broadcast one
        feed to many destinations. For these cases, a port can be marked <strong>multi-connect</strong> to allow N
        connections to or from a single port — 1:many fan-out from a source, or many:1 fan-in to a destination.
      </p>
      <ul>
        <li>
          Toggle multi-connect per port in the <strong>device editor</strong> (double-click the device) — click the
          <strong> M</strong> badge on the row of badges under the port (next to the multicable <strong>T</strong>{" "}
          toggle). It lights up amber when the port is multi-connect
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

      <h3>Example: one Dante source, many destinations</h3>
      <p>To show a Dante flow from one console output feeding several receivers:</p>
      <ol>
        <li><strong>Double-click</strong> the source device to open the device editor</li>
        <li>Click the <strong>M</strong> badge under the Dante port so it lights up amber</li>
        <li>
          Draw a connection from that port to each destination — every destination gets its own line on the
          canvas and its own row in the cable schedule
        </li>
      </ol>
      <p>
        If a destination should also accept several flows on one port, mark that port multi-connect too.
      </p>

      <h2>Adapters</h2>
      <p>
        When you connect ports with incompatible signal types or different connector types, EasySchematic
        can automatically insert an <strong>adapter</strong> device between them. There is no separate
        "add adapter" action — just draw the connection between the two mismatched ports, and if the
        device library has a matching adapter it's inserted for you (or offered in a dialog when
        several match). For example, connecting a
        laptop's <strong>USB-A</strong> port to an <strong>RJ45</strong> port on a network switch
        automatically inserts a <strong>USB-A (M) → RJ45 (F) Adapter</strong>, wired to both devices.
        The library also ships EU/UK power adapters (Schuko, Europlug, UK BS 1363, IEC C13), so a Schuko
        output dragged onto a UK input inserts a <strong>Schuko (M) → UK BS 1363 (F) Adapter</strong>. The
        Edison → Schuko and Edison → UK adapters are plug adapters only — they do not convert 120V to 230V.
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
        <li>
          If <strong>multiple</strong> adapters match, a dialog lets you choose which one to insert —
          <strong> Connect Anyway</strong> is also available there to skip the adapter
        </li>
        <li>
          If <strong>no</strong> adapter matches, the dialog tells you no matching adapters were found —
          you can <strong>Cancel</strong>, or click <strong>Connect Anyway</strong> to force the
          connection without an adapter
        </li>
      </ul>
      <p>
        Matching works in <strong>either drag direction</strong> — a USB-A → RJ45 dongle is found whether
        you start the connection from the USB-A port or from the RJ45 port.
      </p>
      <p>
        Auto-insertion matches against the adapters <strong>built into the app</strong>, plus any{" "}
        <strong>custom adapter devices</strong> you've created yourself. Adapters from the online
        community library don't auto-insert until they're bundled into an app update — but you can
        always place one manually from the <strong>device library</strong> and connect through it
        like any other device.
      </p>

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
          <strong> DA</strong> badge under each port row (only visible on adapter devices)
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
        Cable IDs are <strong>permanent</strong>: each connection's ID is assigned once, saved in your schematic
        file, and never renumbered — so printed labels and pull sheets stay valid as the drawing evolves. Switching
        the naming scheme only affects connections that don't have an ID yet; new connections continue numbering
        from the highest stored ID. Duplicating or pasting a connection gets a fresh ID (it's a new physical cable).
      </p>
      <p>
        Use the <strong>View</strong> menu to toggle cable labels on or off across the entire canvas. You can also
        hide the label on a single connection by right-clicking it and choosing <strong>Hide Cable ID</strong>.
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
        <li><strong>Line width</strong> — set 1–8 px across the whole selection, with the same highlight / "(mixed)" behaviour. Hidden when the selection includes a direct-attach connection.</li>
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
        name, its far-end port (shown by default at both ends), room (if applicable), and page number (in print
        view). Labels are <strong>draggable</strong> — grab and move them to reposition the stub endpoint.
      </p>
      <p>
        Whole selections stub at once. Select several connections, then either right-click one of them and choose{" "}
        <strong>Stub N Selected Connections</strong>, or use the <strong>Stubs</strong> section of the bulk edit panel
        (the <strong>Stub N connections</strong> button). Connections already stubbed are left alone, and{" "}
        <strong>Show N Selected Connections in Full</strong> — <strong>Show N connections in full</strong> in the bulk
        edit panel — reverses it for the stubbed ones. Either way the whole batch is one undo step.
      </p>
      <ul>
        <li>Stub lines follow <strong>orthogonal routing</strong> with curved corners, matching normal connections</li>
        <li>Right-click a stub to <strong>Add Handle</strong> for intermediate waypoints, just like normal connections</li>
        <li>Stubbed connections are excluded from <strong>line jump</strong> detection — they won't cause arc markers on other connections</li>
        <li>Stubbed connections don't generate <strong>page-break crossing labels</strong></li>
      </ul>

      <h3>Customizing stub labels</h3>
      <p>
        These options in <strong>Preferences → Display → Stub labels</strong> control what appears on stub labels
        across the whole schematic:
      </p>
      <ul>
        <li>
          <strong>Show direction arrow on stub labels</strong> — prefixes the label with an arrow pointing toward
          the far end, e.g. <code>→ Projector</code>. Off by default: the destination name already says where the
          connection goes, and the arrow costs width on an already-tight box.
        </li>
        <li>
          <strong>Show port name on stub labels</strong> — adds the destination port in brackets after the device,
          e.g. <code>Projector [HDMI In 1] (Main Hall) Pg 3</code>. Useful when a device has many ports of the
          same signal type.
        </li>
        <li>
          <strong>Show room name on stub labels</strong> — adds the destination room in parentheses, e.g.{" "}
          <code>Projector (Main Hall)</code>. The room only appears when the far device is in a{" "}
          <em>different</em> room from the device at the stub's own end. A stub between two devices in the same
          room leaves the room off, since it tells the reader nothing.
        </li>
        <li>
          <strong>Page number on stub labels</strong> — choose <em>Cross-page only</em> (default), <em>Always</em>,
          or <em>Never</em>. Cross-page only suppresses the <code>Pg N</code> tag when both ends of a stub
          happen to land on the same printed page, which is usually noise.
        </li>
      </ul>
      <p>
        All of these can also be overridden on a single stub. Right-click the <strong>stub label</strong> itself
        and use <strong>Show arrow</strong>, <strong>Show port</strong>, <strong>Show room</strong> or{" "}
        <strong>Page mode</strong> — each cycles through <em>Default</em> (use the global setting) and explicit
        values, so an individual stub can opt in or out independently. Setting <strong>Show room</strong> to{" "}
        <em>On</em> on a single stub shows the room even when both devices share it.
      </p>

      <h3>Cable-ID-only tags</h3>
      <p>
        Sometimes a stub is wanted purely as a <strong>cable tag</strong> — the cable ID at the port and no
        destination information at all. Right-click the stub label and set <strong>Tag text</strong> to{" "}
        <em>Cable ID only</em>: the box then shows just the cable ID, e.g. <code>HDMI-001</code>. The arrow, port,
        room and page options no longer apply and drop off the menu; switch <strong>Tag text</strong> back to{" "}
        <em>Destination</em> to get them back.
      </p>
      <p>
        Both stub labels of a connection are the same cable, so switching <strong>Tag text</strong> on one end
        switches the other end with it, and a single undo puts both back. It applies to the canvas, PDF export and
        DXF export alike. A connection with no cable ID — a direct-attach one, for instance — shows a dash instead.
      </p>
      <p>
        To choose what newly stubbed connections start as, use <strong>Preferences → Display → Stub labels →
        Tag text for new stubs</strong>. It defaults to <em>Destination</em> and applies to every project on this
        computer. <strong>This project only</strong>, just below it, overrides that for the open schematic and is
        saved in the schematic file. Neither setting changes stub labels already on the canvas.
      </p>

      <h3>Drawing new connections as stubs</h3>
      <p>
        If stubs are how you draw most of the time, set <strong>Preferences → Canvas → New Connections →
        Draw new connections as</strong> to <em>Stub</em>. Connections you draw from then on arrive already stubbed
        at both ends — identical to drawing one and then choosing <strong>Stub Connection</strong> from its
        right-click menu — and a single undo still removes the whole connection. Connections that already exist are
        untouched when you change the setting. The one exception is a connection that needs an adapter: when
        EasySchematic inserts one for you, the two halves either side of the adapter stay as wires, since stubbing
        both would scatter four stub labels around a device you did not place. Force one through with{" "}
        <strong>Connect anyway</strong> and it is stubbed like any other.
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
