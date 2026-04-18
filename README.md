<p align="center">
  <img src="public/favicon.svg" width="128" alt="EasySchematic logo"/>
</p>

<h1 align="center">EasySchematic</h1>

<p align="center">A drag-and-drop AV signal flow diagram tool for designing and documenting AV system hook-ups.<br>Built for broadcast, live production, and AV integration workflows.</p>

<p align="center"><b><a href="https://easyschematic.live">Try it live →</a></b> · <b><a href="https://docs.easyschematic.live">Documentation →</a></b> · <b><a href="https://devices.easyschematic.live">Device Database →</a></b> · <b><a href="https://discord.gg/dxXn3Jk2a6">Discord →</a></b> · <b><a href="https://ko-fi.com/duremovich">Support the project →</a></b></p>

<h3 align="center">Supported by</h3>

<p align="center">
  <a href="https://cumoratek.com/">
    <img src="https://avatars.githubusercontent.com/u/137531034?v=4" height="64" alt="Cumoratek AV Solutions" title="Cumoratek AV Solutions"/>
  </a>
</p>

<p align="center"><sub><b>Individual supporters</b><br/>Sean Curtis</sub></p>

## Features

### Canvas & Devices

- **500+ built-in device templates** across 21 categories — Sources, Peripherals, Switching, Processing, Distribution, Monitoring, Projection, Recording, Audio, Speakers, Amplifiers, Networking, KVM/Extenders, Wireless, LED Video, Media Servers, Lighting, Control, Infrastructure, Cloud Services, Cable Accessories
- **User templates** — save modified devices as reusable templates
- **Favorite devices** — star templates in the library for quick access; favorites pin to the top and sort first in search
- **Template presets** — save a device configuration as the project default for that template; new placements auto-apply the preset
- **Quick-add** — double-click empty canvas to open a search dialog; type to find any device, note, or room and place it instantly
- **Expansion slots** — devices with swappable card bays (e.g. router chassis with SDI/HDMI/fiber cards); right-click a slot to swap cards in or out
- **Quick-create routers** — generate routers with configurable input/output counts and signal type
- **Notes & annotations** — text annotations on the canvas with rectangle and ellipse shapes
- **Rooms** — resizable dashed-border containers for grouping devices, with lock/unlock to prevent accidental moves
- **Auto-numbering** — dropped devices auto-increment (Camera → Camera 1, Camera 2, …)
- **Demo schematic** loaded for first-time visitors
- **Collapsible device library sidebar**
- **Dark mode** — toggle light/dark themes from the menu bar; saved automatically, respects OS setting on first visit
- **Mobile support** — mobile detection with hamburger menu and touch-friendly pan controls
- **Physical dimensions** — height, width, depth (mm) and weight (kg) fields on devices
- **Auxiliary data block** — up to 5 custom lines at the bottom of a device, either free text or bound to device properties (hostname, power, weight, port counts, etc.) via a `{{field}}` picker that keeps values in sync automatically
- **Hostname** — per-device hostname field, feeding into the network report
- **Venue-provided gear flag** — mark devices as provided by venue; distinguished in the pack list
- **Nested slots** — expansion cards with their own sub-slots (e.g., SFP/QSFP transceivers in network cards)

### Connections

- **Click-to-connect** — click a source handle, preview line follows cursor, snaps to nearby valid targets (green = valid, red = incompatible signal type), click target to connect or click device body to auto-connect first compatible port
- **Drag-to-connect** with the same preview/snap/validity behavior
- **Network ports connect in any direction** — Ethernet, Dante, NDI, and other network signal types allow input-to-input and output-to-output connections
- **Smart edge routing** — A\* pathfinding avoids device crossings with automatic parallel edge nesting
- **Auto-route toggle** — disable A\* routing for lag-free editing on large schematics; click the status chip in the top-right corner
- **Manual route editing** — right-click a connection to add draggable waypoints; A\* routes each leg between waypoints while other connections yield
- **Cable length** — editable per-connection field, tracked in cable schedule and pack list
- **Multicable support** — cable accessory templates (snakes, socapex), trunk ports, break-in/break-out devices
- **Cable ID labels** — auto-assigned with type-prefix naming (e.g. "SDI-1", "HDMI-2") or sequential ("Cable 1", "Cable 2")
- **Line jump arcs** at connection crossings
- **Stubbed connections** — render as short stubs with destination labels (device name, room, page) instead of full routed lines; drag labels to reposition, add intermediate waypoints via right-click
- **Connector mismatch override** — force-connect ports with incompatible connectors
- **Bare wire compatibility** — Phoenix and Terminal Block connectors connect to any connector type without adapter warnings
- **57 signal types**, all color-coded (see below)
- **Connection line styles** — solid, dashed, dotted, or dash-dot per connection or per signal type
- **Adapters** — automatic adapter insertion between incompatible ports, with direct-attach support, barrels, gender labels, and per-adapter visibility controls

### Ports

- Input, output, and **bidirectional** directions
- **Port sections** — group related ports under headers
- **Drag-and-drop reordering** in the device editor
- Add, remove, and rename ports per device
- **Port notes** — optional notes field per port for documenting specific usage
- **Flip ports** — move any port to the opposite side of the device for flexible signal flow layouts

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
- **Equipment racks** — mark a room as an equipment rack via right-click for rack-style rendering
- **Shift+click toggle selection** — add/remove items from selection; Shift+drag for AutoCAD-style directional selection

### Signal Types

SDI · HDMI · NDI · Dante · Analog Audio · AES · AES67 · DMX · MADI · USB · Ethernet · Fiber · DisplayPort · HDBaseT · SRT · ST 2110 · Genlock · Word Clock · GPIO · RS-422 · Serial · Thunderbolt · Composite · S-Video · VGA · DVI · RF · Power · L1 · L2 · L3 · Neutral · Ground · MIDI · Tally · S/PDIF · ADAT · YDIF · Ultranet · AES50 · StageConnect · Art-Net · sACN · IR · Timecode · GigaACE · DX5 · SLink · SoundGrid · fibreACE · DX Link · GPS · DARS · RTMP · RTSP · MPEG-TS · Custom

**Signal color panel** — collapsible right sidebar with per-signal color pickers. Custom colors are saved in schematic files and persist across sessions. Reset to defaults anytime.

**View options** — hide connections by signal type, toggle device type labels, cable labels, and line jumps on/off

### Pack List & Reports

- **Pack list** — auto-generated bill of materials from your schematic (devices + cables)
- **Cable schedule** — per-connection wiring report with editable cable IDs, connector info, cable types, signal types, and room assignments; fill series support for batch renaming
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
- **Moderation workflow** — submissions are reviewed by moderators before going live; each approved device is stamped with the reviewer and schema version, moderators keep internal notes on devices, and flagged devices can be sent back into the review queue if users report issues
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
- **DXF** — CAD export with organized layer hierarchy (`EasySchematic-Devices`, `EasySchematic-Connections-SDI`, etc.) for Vectorworks, AutoCAD
- **Template import/export** — export and import user device templates as JSON
- **Google OAuth** — sign in with Google as an alternative to magic-link email
- **Offline cloud cache** — cloud schematics cached to IndexedDB for offline access

### Editing

- **Undo/redo** — full history
- **Copy/paste** with offset positioning
- **Double-click device** to open device editor (label, type, ports, presets); **Ctrl+Enter** applies and closes from any field
- **Double-click canvas** to quick-add a device via search dialog
- **Preferences** — scroll wheel configuration, trackpad support with sensitivity sliders, via Edit menu
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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, architecture notes, and guidelines.

## License

AGPL-3.0
