export default function OverviewPage() {
  return (
    <>
      <h1>EasySchematic</h1>

      <p>
        EasySchematic is a browser-based tool for designing <strong>AV signal flow diagrams</strong> (hook-up
        sheets). It's built for broadcast engineers, live production teams, and AV integrators who need to quickly map
        out how devices connect.
      </p>
      <p>
        Everything runs in the browser — no install required. Your work auto-saves to localStorage, or create a
        free account to save schematics to the cloud and access them from any browser.
      </p>
      <p>
        <strong>
          <a href="https://easyschematic.live/">Open EasySchematic &rarr;</a>
        </strong>
      </p>

      <h2>Key features</h2>
      <ul>
        <li>
          <strong>Devices</strong> with typed input/output ports (SDI, HDMI, NDI, Dante, AVB, DMX, MADI, and 68 signal types in total)
        </li>
        <li>
          <strong>Signal-type coloring</strong> — connections are color-coded by signal type, with customizable colors
        </li>
        <li>
          <strong>Smart connection routing</strong> — A* pathfinding routes connections around devices with parallel-connection nesting
        </li>
        <li>
          <strong>Room grouping</strong> — drag devices into room containers to organize by physical location, with lock/unlock to prevent accidental moves
        </li>
        <li>
          <strong>Notes &amp; annotations</strong> — rich text annotations with rectangle and ellipse shapes, plus formatting (bold, italic, bullets, font sizes)
        </li>
        <li>
          <strong>Cable ID labels</strong> — auto-assigned labels for connections, making it easy to reference specific cable runs
        </li>
        <li>
          <strong>Line jump arcs</strong> — arc markers at connection crossings for visual clarity
        </li>
        <li>
          <strong>Device library</strong> — 2,000+ real-world device templates from the community library — cameras,
          switchers, audio consoles, lighting consoles, LED processors, media servers, and more — fetched live with a
          bundled offline fallback
        </li>
        <li>
          <strong>Expansion slots</strong> — devices with swappable card bays; right-click a slot to swap I/O cards in or out
        </li>
        <li>
          <strong>User templates &amp; presets</strong> — save device configurations or set project-wide defaults for any template
        </li>
        <li>
          <strong>Favorites</strong> — star frequently-used devices for instant access
        </li>
        <li>
          <strong>Quick-add</strong> — double-click the canvas to search and place a device in one step
        </li>
        <li>
          <strong>Room styling</strong> — customize background color, border style, and label size via right-click context menu
        </li>
        <li>
          <strong>Cloud storage</strong> — save up to 10 schematics to the cloud with a free account; access from any browser
        </li>
        <li>
          <strong>Sharing</strong> — generate a link to share any cloud-saved schematic with anyone
        </li>
        <li>
          <strong>Dark mode</strong> — toggle between light and dark themes from the menu bar; preference is saved automatically and respects your OS setting on first visit
        </li>
        <li>
          <strong>Trackpad support</strong> — pinch-to-zoom and two-finger pan with configurable sensitivity
        </li>
        <li>
          <strong>Alignment tools</strong> — align and distribute selected devices horizontally or vertically
        </li>
        <li>
          <strong>Export</strong> — PNG, SVG, PDF, DXF (for CAD/Vectorworks), and JSON for sharing
        </li>
        <li>
          <strong>Print View</strong> — page boundary overlay with configurable paper size, orientation, and scale
        </li>
        <li>
          <strong>Title block editor</strong> — customizable grid layout with logo upload for professional print output
        </li>
        <li>
          <strong>Network &amp; power reports</strong> — IP address schedules, VLAN assignments, PoE budgets, and power distribution analysis
        </li>
        <li>
          <strong>Patch panel schedule</strong> — per-port report of every patch panel in the schematic, including
          unconnected ports, with occupancy badges and group-by Panel / Room / Signal / Face
        </li>
        <li>
          <strong>Connector gender</strong> — auto-derived per port, with M-M / F-F suffixes on cables that need
          like-gendered plugs so the pack list matches what you actually buy
        </li>
        <li>
          <strong>Estimated cable length</strong> — auto-populated from room-to-room distances when both endpoints
          live in placed rooms
        </li>
        <li>
          <strong>Owned Gear library</strong> — maintain an inventory of gear you own; the pack list reports used vs.
          needed counts so you know what to pull and what to rent
        </li>
        <li>
          <strong>Bulk device-template import</strong> — import many user templates at once from a JSON or CSV file
          (e.g. a vendor catalog dump)
        </li>
        <li>
          <strong>Label case</strong> — display preference (As-typed / UPPERCASE / lowercase / Capitalize Words),
          saved with the schematic
        </li>
        <li>
          <strong>Signal type filter</strong> — narrow device search to templates exposing a chosen signal type
        </li>
        <li>
          <strong>IO counts</strong> — optional badges on devices showing connected vs. total ports per direction
        </li>
        <li>
          <strong>Custom label expansion</strong> — embed <code>{"{{cableId}}"}</code> and other tokens in device
          labels for inline cable references
        </li>
        <li>
          <strong>CSV import</strong> — import cable schedule spreadsheets to auto-generate schematics
        </li>
        <li>
          <strong>Auto-route toggle</strong> — disable smart routing for lag-free editing on large schematics
        </li>
        <li>
          <strong>Quick-create routers</strong> — generate matrix routers with configurable input/output counts and signal type
        </li>
        <li>
          <strong>Adapters</strong> — automatic adapter insertion between incompatible ports, with direct-attach,
          barrels, gender labels, and per-adapter show/hide controls
        </li>
        <li>
          <strong>Connection line styles</strong> — solid, dashed, dotted, or dash-dot per connection or per signal type
        </li>
        <li>
          <strong>Subrooms</strong> — nested room containers for locations within locations
        </li>
        <li>
          <strong>Rack builder</strong> — dedicated rack elevation pages with 2-post / 4-post racks at standard heights, drag-to-rack with snap-to-U placement, half-rack support, accessories (shelves, vent panels, blank panels, drawers, cable managers), and front / rear / side views — see the <a href="/racks">Rack Builder guide</a>
        </li>
        <li>
          <strong>Auto-shelf</strong> — small non-rack-mountable devices (DI boxes, half-width DSPs, desktop gear) drop onto a slot and auto-create a 1U shelf at natural width; oversize devices are rejected with a clear error
        </li>
        <li>
          <strong>Face-plate editor</strong> — drag connectors to custom positions on a device&apos;s front panel with snap-to-grid, multi-select align / distribute, custom labels, and undo / redo. 59 connector types rendered at mm-accurate dimensions with three zoom levels
        </li>
        <li>
          <strong>Room ↔ rack linking</strong> — link a schematic room to a rack so &quot;Auto-populate&quot; can propose placements for every device in the room; rack header shows a click-to-jump link badge
        </li>
        <li>
          <strong>Print sheets</strong> — paper-sized layout pages (Letter, Tabloid, A3, A4, custom) for composing rack viewports into a printable drawing; multi-select group resize, alignment guides, vector PDF export — see the <a href="/print-sheets">Print Sheets guide</a>
        </li>
        <li>
          <strong>Equipment-rack rooms</strong> — mark a schematic room as an equipment rack for rack-style rendering directly on the schematic (separate from the dedicated Rack Builder pages above)
        </li>
        <li>
          <strong>BOM cost tracking</strong> — unit cost fields on devices and cables for budgeting
        </li>
        <li>
          <strong>Mobile support</strong> — mobile detection with hamburger menu and touch-friendly controls
        </li>
        <li>
          <strong>Google OAuth</strong> — sign in with Google or magic-link email
        </li>
        <li>
          <strong>Offline cloud cache</strong> — cloud schematics cached to IndexedDB for offline access
        </li>
        <li>
          <strong>Physical dimensions</strong> — device height, width, depth (mm) and weight (kg) drive rack auto-shelf classification, side-view depth conflicts, and per-rack stats (U used, total weight, power)
        </li>
        <li>
          <strong>Hostname</strong> — per-device hostname field feeding into the network report
        </li>
        <li>
          <strong>Auxiliary data</strong> — customizable text lines at the bottom of each device
        </li>
        <li>
          <strong>Venue-provided gear</strong> — flag devices as venue-provided for pack list distinction
        </li>
        <li>
          <strong>Nested slots</strong> — expansion cards with sub-slots (e.g., SFP transceivers in network cards)
        </li>
        <li>
          <strong>Port flipping</strong> — move any port to the opposite side of the device
        </li>
        <li>
          <strong>Port notes</strong> — per-port notes field for documentation
        </li>
      </ul>
    </>
  );
}
