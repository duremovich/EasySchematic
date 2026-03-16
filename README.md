<p align="center">
  <img src="public/favicon.svg" width="128" alt="EasySchematic logo"/>
</p>

<h1 align="center">EasySchematic</h1>

<p align="center">A drag-and-drop AV signal flow diagram tool for designing and documenting audio/video system hook-ups.<br>Built for broadcast, live production, and AV integration workflows.</p>

<p align="center"><b><a href="https://easyschematic.live">Try it live →</a></b> · <b><a href="https://docs.easyschematic.live">Documentation →</a></b></p>

## Features

### Canvas & Devices

- **60 built-in device templates** across 11 categories — Sources, Peripherals, Switching, Processing, Distribution, Monitoring, Projection, Recording, Audio, Networking, KVM/Extenders
- **Custom device templates** — save modified devices for reuse
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
- **21 signal types**, all color-coded (see below)

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
- **Space + drag** to pan (Vectorworks-style)

### Signal Types

SDI · HDMI · NDI · Dante · Analog Audio · AES · USB · Ethernet · Fiber · DisplayPort · HDBaseT · SRT · Genlock · GPIO · RS-422 · Serial · Thunderbolt · Composite · VGA · Power · Custom

**Signal color panel** — collapsible right sidebar with per-signal color pickers. Custom colors are saved in schematic files and persist across sessions. Reset to defaults anytime.

**View options** — hide connections by signal type, toggle device type labels on/off

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
- **Double-click** to open device editor (label, type, ports, sections)

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
| `Ctrl+C` | Copy selected |
| `Ctrl+V` | Paste |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| Double-click device | Open device editor |
| Right-click connection | Add/remove routing handles, reset route |
| `Ctrl+B` | Toggle routing debug overlay |

## License

AGPL-3.0
