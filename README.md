<p align="center">
  <img src="public/favicon.svg" width="128" alt="EasySchematic logo"/>
</p>

<h1 align="center">EasySchematic</h1>

<p align="center">A drag-and-drop AV signal flow diagram tool for designing and documenting audio/video system hook-ups.<br>Built for broadcast, live production, and AV integration workflows.</p>

<p align="center"><b><a href="https://easyschematic.live">Try it live →</a></b> · <b><a href="https://docs.easyschematic.live">Documentation →</a></b> · <b><a href="https://devices.easyschematic.live">Device Database →</a></b></p>

## Features

### Canvas & Devices

- **210+ built-in device templates** across 17 categories — Sources, Peripherals, Switching, Processing, Distribution, Monitoring, Projection, Recording, Audio, Speakers & Amps, Networking, KVM/Extenders, Wireless, LED Video, Media Servers, Lighting, Control
- **User templates** — save modified devices as reusable templates
- **Favorite devices** — star templates in the library for quick access; favorites pin to the top and sort first in search
- **Template presets** — save a device configuration as the project default for that template; new placements auto-apply the preset
- **Quick-add** — double-click empty canvas to open a search dialog; type to find any device, note, or room and place it instantly
- **Quick-create routers** — generate routers with configurable input/output counts and signal type
- **Notes** — text annotations on the canvas
- **Rooms** — resizable dashed-border containers for grouping devices
- **Auto-numbering** — dropped devices auto-increment (Camera → Camera 1, Camera 2, …)
- **Demo schematic** loaded for first-time visitors
- **Collapsible device library sidebar**

### Connections

- **Click-to-connect** — click a source handle, preview line follows cursor, snaps to nearby valid targets (green = valid, red = incompatible signal type), click target to connect or click device body to auto-connect first compatible port
- **Drag-to-connect** with the same preview/snap/validity behavior
- **Smart edge routing** — A* pathfinding avoids device crossings with automatic parallel edge nesting
- **Manual route editing** — right-click a connection to add draggable waypoint handles; A* routes each leg between handles while other connections yield
- **23 signal types**, all color-coded (see below)

### Ports

- Input, output, and **bidirectional** directions
- **Port sections** — group related ports under headers
- **Drag-and-drop reordering** in the device editor
- Add, remove, and rename ports per device

### Organization

- **Snap-to-alignment guides** while dragging
- **Alignment operations** — left, center, right, top, middle, bottom
- **Distribution** — horizontal/vertical even spacing
- **MiniMap** and zoom controls
- **Grid snapping** (20px)
- **Room snap guides** — rooms and resize handles snap to other rooms' edges/centers with visible alignment guides
- **Room styling** — right-click a room to set background color, border color, border style, and label size
- **Space + drag** to pan (Vectorworks-style)

### Signal Types

SDI · HDMI · NDI · Dante · Analog Audio · AES · DMX · MADI · USB · Ethernet · Fiber · DisplayPort · HDBaseT · SRT · Genlock · GPIO · RS-422 · Serial · Thunderbolt · Composite · VGA · Power · Custom

**Signal color panel** — collapsible right sidebar with per-signal color pickers. Custom colors are saved in schematic files and persist across sessions. Reset to defaults anytime.

**View options** — hide connections by signal type, toggle device type labels on/off

### Pack List & Reports

- **Pack list** — auto-generated bill of materials from your schematic (devices + cables)
- **Print preview** — WYSIWYG report editor with interactive header/footer grid, column visibility, grouping, sorting
- **Multi-page preview** with accurate page breaks, page navigation, zoom, and "Page X of Y" numbering
- **Header/footer grid editor** — assign fields (show name, venue, date, etc.), static text, logo, or page numbers to cells; merge, resize, add/delete rows and columns via right-click
- **CSV export** for spreadsheet use
- **PDF export** matching the preview layout exactly
- Layout preferences saved per-schematic

### Community Device Database

- **[devices.easyschematic.live](https://devices.easyschematic.live)** — browse, search, and submit device templates
- **Community submissions** — submit new devices or suggest edits to existing templates via magic-link email auth
- **Moderation workflow** — submissions are reviewed by moderators before going live
- **Reference URLs** — branded devices link to manufacturer product pages for spec verification
- **Contributor attribution** — approved submissions credit the contributor on the device page and the hall of fame
- **REST API** at `api.easyschematic.live` backed by Cloudflare D1 (SQLite) — open for read access, no auth required

#### Public API

If you're building AV tooling and need a structured database of professional video/audio equipment with port definitions, signal types, and connector types, help yourself:

- `GET https://api.easyschematic.live/templates` — all device templates
- `GET https://api.easyschematic.live/templates/:id` — single template with contributor attribution

Responses are JSON, cached for 5 minutes. See the [full API reference](https://docs.easyschematic.live/#/api) for additional endpoints.

### Save & Export

- **Auto-save** to browser localStorage
- **JSON import/export** with schema versioning and automatic migrations
- **Print** — configurable paper size (Letter through Arch E), orientation, scale, title block
- **PNG** — 4x resolution raster export
- **SVG** — vector export
- **DXF** — CAD export with organized layer hierarchy (`EasySchematic-Devices`, `EasySchematic-Connections-SDI`, etc.) for Vectorworks, AutoCAD

### Editing

- **Undo/redo** — full history
- **Copy/paste** with offset positioning
- **Double-click device** to open device editor (label, type, ports, presets)
- **Double-click canvas** to quick-add a device via search dialog
- **Right-click room** to open room properties (label, colors, border style)

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

## Tech Stack

- [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org/)
- [@xyflow/react v12](https://reactflow.dev) — node/edge canvas
- [Zustand v5](https://zustand.docs.pmnd.rs/) — state management
- [Tailwind CSS v4](https://tailwindcss.com) — styling
- [Vite 8](https://vite.dev) — build tool

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Click handle | Start click-to-connect |
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
| Right-click room | Open room properties editor |
| Right-click connection | Add/remove routing handles, reset route |
| `Ctrl+B` | Toggle routing debug overlay |

## License

AGPL-3.0
