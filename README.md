<p align="center">
  <img src="public/favicon.svg" width="128" alt="EasySchematic logo"/>
</p>

<h1 align="center">EasySchematic</h1>

<p align="center">A drag-and-drop AV signal flow diagram tool for designing and documenting AV system hook-ups.<br>Built for broadcast, live production, and AV integration workflows.</p>

<p align="center"><b><a href="https://easyschematic.live">Try it live →</a></b> · <b><a href="https://docs.easyschematic.live">Documentation →</a></b> · <b><a href="https://docs.easyschematic.live/dev/">Developer Reference →</a></b> · <b><a href="https://devices.easyschematic.live">Device Database →</a></b> · <b><a href="https://discord.gg/dxXn3Jk2a6">Discord →</a></b> · <b><a href="https://ko-fi.com/duremovich">Support the project →</a></b></p>

<h3 align="center">Supported by</h3>

<p align="center">
  <a href="https://cumoratek.com/">
    <img src="https://avatars.githubusercontent.com/u/137531034?v=4" height="64" alt="Cumoratek AV Solutions" title="Cumoratek AV Solutions"/>
  </a>
</p>

<p align="center"><sub><b>Individual supporters</b><br/>Sean Curtis</sub></p>

## Features

### Canvas & Devices

- **2,000+ device templates** drawn from the [community device library](https://devices.easyschematic.live) — fetched live when you're online, with a bundled offline fallback so the app stays usable without a connection
- **User templates** — save modified devices as reusable templates
- **Favorite devices** — star templates in the library for quick access; favorites pin to the top and sort first in search
- **Template presets** — save a device configuration as the project default for that template; new placements auto-apply the preset
- **Quick-add** — double-click empty canvas to open a search dialog; type to find any device, note, or room and place it instantly
- **Signal type filter** — narrow device search to templates exposing a chosen signal type, in both the app and the devices site
- **Expansion slots** — devices with swappable card bays (e.g. router chassis with SDI/HDMI/fiber cards); right-click a slot to swap cards in or out, or build a custom card from scratch
- **Swap Device** — right-click any device → **Swap Device...** to replace it with a different model (e.g. AJA Kumo 3232 → 6464, or graduate a placeholder into a real device). A port-mapping dialog auto-suggests where each existing connection lands on the new device, carries over installed expansion cards by slot family, and auto-installs cards to satisfy connections the new chassis only supports via expansion. Direction-crossing remaps require explicit user opt-in; everything is a single undo step.
- **Custom devices** — design any device from scratch with a guided builder (matrix routers, breakout panels, anything with structured I/O sections)
- **Notes & annotations** — text annotations on the canvas with rectangle and ellipse shapes
- **Rooms** — resizable dashed-border containers for grouping devices, with lock/unlock to prevent accidental moves
- **Auto-numbering** — dropped devices auto-increment (Camera → Camera 1, Camera 2, …)
- **Dark mode** — toggle light/dark themes from the menu bar; saved automatically, respects OS setting on first visit
- **Mobile support** — mobile detection with hamburger menu and touch-friendly pan controls
- **Physical dimensions** — height, width, depth (mm) and weight (kg) fields on devices; drive rack auto-shelf classification, side-view depth conflicts, and per-rack stats
- **Auxiliary data block** — up to 5 custom lines at the bottom of a device, either free text or bound to device properties (hostname, power, weight, port counts, etc.) via a `{{field}}` picker that keeps values in sync automatically
- **Custom label expansion** — embed `{{cableId}}` and other tokens in device labels for inline cable references
- **IO counts** — optional badges on devices showing connected/total ports per direction (View Options)
- **Hostname** — per-device hostname field, feeding into the network report
- **Venue-provided gear flag** — mark devices as provided by venue; distinguished in the pack list
- **Owned Gear library** — track an inventory of gear you own; the pack list reports used vs. needed counts so you know what to buy or rent
- **Nested slots** — expansion cards with their own sub-slots (e.g., SFP/QSFP transceivers in network cards)

### Connections

- **Click-to-connect** — click a source handle, preview line follows cursor, snaps to nearby valid targets (green = valid, red = incompatible signal type), click target to connect or click device body to auto-connect first compatible port
- **Drag-to-connect** with the same preview/snap/validity behavior
- **Network ports connect in any direction** — Ethernet, Dante, NDI, and other network signal types allow input-to-input and output-to-output connections
- **Smart edge routing** — A\* pathfinding avoids device crossings with automatic parallel edge nesting
- **Auto-route toggle** — disable A\* routing for lag-free editing on large schematics; click the status chip in the top-right corner
- **Manual route editing** — right-click a connection to add draggable waypoints; A\* routes each leg between waypoints while other connections yield
- **Cable length** — editable per-connection field, tracked in cable schedule and pack list
- **Estimated cable length** — auto-populated from room-to-room distances when both endpoints are inside placed rooms; flows into the cable schedule, patch panel schedule, and pack list
- **Multicable support** — cable accessory templates (snakes, socapex), trunk ports, break-in/break-out devices
- **Cable ID labels** — auto-assigned with type-prefix naming (e.g. "SDI-1", "HDMI-2") or sequential ("Cable 1", "Cable 2"), with per-connection overrides from the right-click menu and cable schedule
- **Line jump arcs** at connection crossings
- **Stubbed connections** — render as short stubs with destination labels (device name, optional port, room, page) instead of full routed lines; drag labels to reposition, add intermediate waypoints via right-click. Globally toggle port-name display and page-number mode (cross-page only / always / never), or override per connection.
- **Connector mismatch override** — force-connect ports with incompatible connectors
- **Bare wire compatibility** — Phoenix and Terminal Block connectors connect to any connector type without adapter warnings
- **68 signal types**, all color-coded (see below)
- **Connection line styles** — solid, dashed, dotted, or dash-dot per connection or per signal type
- **Adapters** — automatic adapter insertion between incompatible ports, with direct-attach support, barrels, gender labels, and per-adapter visibility controls

### Ports

- Input, output, and **bidirectional** directions
- **Port sections** — group related ports under headers
- **Drag-and-drop reordering** in the device editor
- Add, remove, and rename ports per device
- **Port notes** — optional notes field per port for documenting specific usage
- **Flip ports** — move any port to the opposite side of the device for flexible signal flow layouts
- **Connector gender** — auto-derived from connector type and direction, with per-port overrides for connectors where gender varies (XLR, powerCON, IEC, Cam-Lok, BNC, TRS). The cable schedule adds an `M-M` or `F-F` suffix to cables that need two like-gendered plugs, so pack lists reflect what you actually need to buy.
- **Patch panels** — devices with `patch-panel` type render as front/rear instead of input/output, with column headers on the canvas; built-in templates for RJ45, BNC, XLR, fiber LC, and TT bantam patch bays in common port counts

### Organization

- **Snap-to-alignment guides** while dragging
- **Alignment operations** — left, center, right, top, middle, bottom
- **Distribution** — horizontal/vertical even spacing
- **MiniMap** and zoom controls
- **Grid snapping** (20px)
- **Room snap guides** — rooms and resize handles snap to other rooms' edges/centers with visible alignment guides
- **Room styling** — right-click a room to set background color, border color, border style, and label size
- **Space + drag** to pan (Vectorworks-style)
- **Subrooms** — nested room containers for representing locations within locations (e.g., rack bays inside a control room)
- **Equipment-rack rooms** — mark a room as an equipment rack via right-click for rack-style rendering on the schematic (separate from the dedicated Rack Builder pages — see below)
- **Shift+click toggle selection** — add/remove items from selection; Shift+drag for AutoCAD-style directional selection. Crossing (right-to-left) drag also selects connections whose routed paths cross the box.
- **Selection filter bar** — appears at the bottom of the canvas when 2+ items are selected; chip per entity kind with click-to-solo / Ctrl+click-to-deselect. When connections are in the selection, an **Edit N connections…** button opens a bulk edit panel for label, line style, direct attach, and label visibility — applied in one undo step.

### Signal Types

SDI · HDMI · NDI · Dante · AVB · Analog Audio · Speaker-Level · Bluetooth · AES · AES67 · DMX · MADI · USB · Ethernet · Fiber · DisplayPort · HDBaseT · SRT · ST 2110 · Genlock · Word Clock · GPIO · Contact Closure · RS-422 · Serial · Thunderbolt · Composite · Component Video · S-Video · VGA · DVI · RF · Power · L1 · L2 · L3 · Neutral · Ground · MIDI · Tally · S/PDIF · ADAT · YDIF · Ultranet · AES50 · StageConnect · Art-Net · sACN · IR · Timecode · GigaACE · DX5 · SLink · SoundGrid · fibreACE · dSnake · DX Link · Digilink · eBUS · Control Voltage · Extron Expansion · POTS · GPS · DARS · RTMP · RTSP · MPEG-TS · Custom

**Signal color panel** — collapsible right sidebar with per-signal color pickers. Custom colors are saved in schematic files and persist across sessions. Reset to defaults anytime.

**View options** — hide connections by signal type, toggle device type labels, cable labels, and line jumps on/off

### Rack Builder

A dedicated rack elevation surface that lives alongside the signal flow. Devices are shared by reference — place a device on a rack page and it stays linked to the same node on the schematic, so connections, ports, and edits are always in sync.

- **Multi-page workflow** — schematic, rack pages, and print sheets all live in the same file, switched via tabs at the bottom of the canvas
- **Rack presets** — 42U / 25U / 16U floor racks, 12U / 6U wall mounts, 4U / 8U desktop racks, 45U / 12U open 2-post relay racks, 42U open 4-post — or build a custom rack from rack type + height + depth
- **2-post and 4-post racks** — visual distinction with mounting holes (3 per U), inner pseudo-rails, dashed outline for open frame; 2-post rear placement blocked with explanation
- **Drag-to-rack** — drop devices from the unracked sidebar onto rack U slots with snap-to-U placement and collision detection
- **Half-rack support** — devices ≈220 mm wide auto-snap to left side; second half-rack lands on right; collisions detected
- **Auto-shelf** — small non-rack-mountable devices (DI boxes, half-width DSPs, desktop gear) drop onto a slot and atomically create a 1U shelf with the device centered at natural width; oversize devices are rejected with a toast
- **Per-template `rackForm` override** — `full` / `half` / `shelf-only` to bypass the size heuristic for edge cases (desktop unit with optional rack ears, etc.)
- **Front / rear / side views** — front shows face plates with connector icons; rear shows striped occupancy ghosts for front-mounted gear; side view shows depth conflicts and shelf-mounted gear at real depth
- **Accessories** — shelves, vent panels (with hatching), blank panels, drawers, cable managers, fan units; right-click an empty slot to add
- **Face-plate editor** — drag connectors to custom positions on a device's front panel with snap-to-grid, multi-select with align (L/CX/R/T/CY/B) and distribute (H/V), custom labels with drag/resize, undo/redo, and reset to auto-layout
- **59 connector types** rendered at mm-accurate dimensions with three zoom levels (dots → silhouettes → detailed icons with pin patterns and slot orientations)
- **Linked rooms** — link a schematic room to a rack so an "Auto-populate" button can propose placements for every device in the room; rack header shows a click-to-jump link badge
- **Cross-shelf drag** — shelf-mounted devices reposition along a shelf or jump across shelves with absolute canvas-to-mm tracking
- **Snap guides** during shelf drag — gravity-snap to shelf floor or stack on top of another device
- **Right-click context menus** for slot, device, accessory, and rack actions
- **Cascading delete** — removing a device from the schematic clears its rack placement (with toast); deleting a rack frees its devices back to the unracked sidebar

### Print Sheets

Paper-based layout pages for composing rack viewports into a printable drawing.

- **Paper sizes** — Letter, Tabloid, A3, A4, or custom dimensions in inches; landscape or portrait
- **Drag rack viewports** onto the sheet — front, rear, or side view; same rack can appear multiple times
- **Aspect-locked resize** by default; hold **Shift** to escape aspect lock and stretch freely
- **Reset size** — press **R** to snap a viewport back to its natural width-for-height aspect
- **Multi-select** — Shift+click, Ctrl+A, or marquee drag; group resize maintains relative position with uniform scale
- **Alignment guides** — blue dashed lines snap viewports to other viewports and page margins (3 mm threshold)
- **Title block, face label, stats line** below each viewport — italic face label, U used / U total, weight, power draw; typography matched pixel-for-pixel to the live rack page
- **Vector PDF export** — full-fidelity rack drawings with mounting holes, occupancy ghosts (real diagonal stripe pattern), shelf occupants at correct offset and rotation, vent-panel hatching, side-view U gridlines, multi-line device labels, and U-height badges
- **Inter Italic** font shipped (Latin subset, ~70 KB) so face labels render italic in PDF without depending on system fonts
- **Pan and zoom** parity with the schematic — trackpad pinch, two-finger pan, middle-click drag, Space+drag

### Pack List & Reports

- **Pack list** — auto-generated bill of materials from your schematic (devices + cables)
- **Cable schedule** — per-connection wiring report with editable cable IDs, connector info, cable types, signal types, room assignments, and an Est. Length column derived from room positions; fill series support for batch renaming
- **Patch panel schedule** — per-port inventory of every patch panel in the schematic, including unconnected ports; occupancy badges per panel, group by Panel / Room / Signal / Face; shares cable IDs and estimated lengths with the cable schedule
- **Owned Gear library** — track inventory of gear you own; the pack list reports used vs. needed counts so a single schematic tells you what to pull from the shop and what to rent or buy
- **Print preview** — WYSIWYG report editor with interactive header/footer grid, column visibility, grouping, sorting
- **Multi-page preview** with accurate page breaks, page navigation, zoom, and "Page X of Y" numbering
- **Header/footer grid editor** — assign fields (show name, venue, date, etc.), static text, logo, or page numbers to cells; merge, resize, add/delete rows and columns via right-click
- **Network report** — IP address schedule with hostname, IP, VLAN, DHCP, link speed, and PoE draw for all network ports
- **Power report** — device power draw tracking and distribution load analysis with capacity/status indicators
- **CSV export** for spreadsheet use
- **PDF export** matching the preview layout exactly
- Layout preferences saved per-schematic
- **BOM cost tracking** — unit cost field on devices and cables for budgeting

### Community Device Database

- **[devices.easyschematic.live](https://devices.easyschematic.live)** — browse, search, and submit device templates
- **Community submissions** — submit new devices or suggest edits to existing templates via magic-link email auth
- **Submit from the canvas** — right-click any device and choose "Submit to Community" to seed a submission with all the fields you've already filled in, instead of re-entering them on the devices site
- **Moderation workflow** — submissions are reviewed by moderators before going live
- **Reference URLs** — branded devices link to manufacturer product pages for spec verification
- **Contributor attribution** — approved submissions credit the contributor on the device page and the hall of fame
- **REST API** at `api.easyschematic.live` backed by Cloudflare D1 (SQLite) — open for read access, no auth required

#### Public API

If you're building AV tooling and need a structured database of professional audiovisual equipment with port definitions, signal types, and connector types, help yourself:

- `GET https://api.easyschematic.live/templates` — all device templates
- `GET https://api.easyschematic.live/templates/:id` — single template with contributor attribution

Responses are JSON, cached for 5 minutes. See the [full API reference](https://docs.easyschematic.live/#/api) for additional endpoints.

### Save & Export

- **Auto-save** to browser localStorage
- **Cloud storage** — create a free account to save up to 10 schematics to the cloud and access them from any browser
- **New file template** — designate any cloud save as your new-file template; File → New loads it with all devices, title block, and settings pre-filled
- **Sharing** — generate a shareable link for any cloud-saved schematic
- **JSON import/export** with schema versioning and automatic migrations
- **CSV cable schedule import** — import cable schedule spreadsheets to auto-generate schematics with device matching
- **Print** — configurable paper size (Standard, ISO A0–A4, ANSI, Architectural, or custom dimensions), orientation, scale, title block
- **PNG** — 4x resolution raster export
- **SVG** — vector export
- **DXF** — AutoCAD R2000 (AC1015) export with canvas-faithful visuals and organized layer hierarchy (`EasySchematic-Devices`, `EasySchematic-Connections-SDI`, etc.) for Vectorworks, AutoCAD, and similar CAD tools
- **Template import/export** — export and import user device templates as JSON
- **Bulk device-template import** — import many templates at once from a JSON or CSV file (e.g. a vendor catalog dump) straight into your user-template library
- **Google OAuth** — sign in with Google as an alternative to magic-link email
- **Offline cloud cache** — cloud schematics cached to IndexedDB for offline access

### Editing

- **Undo/redo** — full history
- **Copy/paste** with offset positioning
- **Double-click device** to open device editor (label, type, ports, presets); **Ctrl+Enter** applies and closes from any field
- **Double-click canvas** to quick-add a device via search dialog
- **Preferences** — navigation mode (left drag: selection box or pan canvas), scroll wheel configuration, trackpad support with sensitivity sliders, label case display (UPPERCASE / lowercase / Capitalize), via Edit menu
- **Right-click room** for context menu — edit properties (label, colors, border style) or lock/unlock the room

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Build

```bash
npm run build
```

Output goes to `dist/` — deploy as a static site anywhere.

## Self-Hosting with Docker

Run EasySchematic locally with Docker:

```bash
docker compose up -d
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

This builds the frontend from source and serves it with nginx. Cloud features (save to cloud, device submissions, sharing) still communicate with the hosted API at `api.easyschematic.live` — no account or API key required for read access.

### Docker commands

| Command | Description |
|---------|-------------|
| `make build` | Build the Docker image |
| `make up` | Start the container (port 8080) |
| `make down` | Stop the container |
| `make restart` | Restart the container |
| `make logs` | Tail container logs |
| `make build-clean` | Rebuild with no cache |

Or use `docker compose` directly — the `makefile` is just a convenience wrapper.

### Changing the port

Edit `compose.yml` and change the first number in the port mapping:

```yaml
ports:
  - "3000:80"  # now available at localhost:3000
```

See the [Self-Hosting docs](https://docs.easyschematic.live/self-hosting) for reverse proxy setup and more details.

## Install as Desktop App

EasySchematic can be installed as a standalone app that works offline — no download page, no account, no app store. Just visit [easyschematic.live](https://easyschematic.live) and install from your browser:

- **Chrome / Edge** — click the install icon in the address bar, or Menu → "Install EasySchematic"
- **Safari (macOS Sonoma+)** — File → Add to Dock
- **Safari (iOS / iPadOS)** — Share → Add to Home Screen
- **Android** — the browser will prompt you automatically, or Menu → "Install app"

The installed app opens in its own window without browser chrome, works fully offline, and updates automatically when you're back online. All your schematics are saved locally — nothing is lost if you lose your connection.

## Design Principles

1. **AV signal flow, nothing else.** This is a tool for designing audiovisual systems — not a general diagramming app. Every feature decision starts from "does this serve AV workflows?"

2. **Your workflow, your way.** Signal colors, display names, device templates, port layouts — customization is a first-class feature. Different shops work differently, and the tool should adapt to you, not the other way around.

3. **Simple to start, deep to master.** A student can drag devices and draw cables in five minutes. The depth is there when you need it, but it's never in your face on day one.

4. **Automate the tedious, not the creative.** Smart routing, auto-numbering, and sensible defaults handle the grunt work. When the algorithm gets it wrong, manual overrides put you back in control.

5. **Community-built device library.** The shared device database grows because users contribute to it. Submit a template, everyone benefits.

## Tech Stack

- [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org/)
- [@xyflow/react v12](https://reactflow.dev) — node/edge canvas
- [Zustand v5](https://zustand.docs.pmnd.rs/) — state management
- [Tailwind CSS v4](https://tailwindcss.com) — styling
- [Vite 8](https://vite.dev) — build tool

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Click port | Start click-to-connect |
| `Escape` | Cancel connection / deselect |
| `Space` + drag | Pan canvas |
| `Delete` / `Backspace` | Delete selected |
| `Ctrl+S` | Save schematic |
| `Ctrl+O` | Open schematic |
| `Ctrl+C` | Copy selected |
| `Ctrl+V` | Paste |
| `Ctrl+A` | Select all |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `F9` | Toggle Print View |
| Double-click device | Open device editor |
| Double-click canvas | Quick-add device search dialog |
| Double-click room background | Quick-add device inside room |
| Right-click room | Room context menu (edit properties, lock/unlock) |
| Right-click connection | Connection context menu (waypoints, stub, override connector mismatch, hide label, reset route) |
| `Ctrl+Shift+S` | Save As |
| `Shift+click` | Toggle item in selection |
| `Shift+drag` | Directional toggle selection |
| `R` (on a print sheet) | Reset selected rack viewports to natural aspect |
| `Shift` while resizing a print-sheet viewport | Escape aspect lock |
| Double-click rack label | Rename rack inline |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, architecture notes, and guidelines.

## License

AGPL-3.0
