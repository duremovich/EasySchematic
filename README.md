# EasySchematic

A drag-and-drop AV signal flow diagram tool for designing and documenting audio/video system hook-ups. Built for broadcast, live production, and AV integration workflows.

**[Try it live →](https://easy-schematic.pages.dev/)**

<!-- ![EasySchematic screenshot](screenshot.png) -->

## Features

- **Drag-and-drop device library** — cameras, switchers, converters, routers, monitors, audio mixers, NDI encoders/decoders, and more
- **Smart connection routing** — edges route around nodes with automatic nesting to minimize crossings
- **Signal type awareness** — connections are color-coded by signal type (SDI, HDMI, NDI, Dante, Ethernet, USB, etc.)
- **Rooms** — group devices into resizable room containers
- **Port management** — drag-and-drop port reordering, rename ports, add/remove ports per device
- **Custom devices** — save modified devices as reusable templates
- **Snap alignment** — nodes snap to alignment guides while dragging
- **Undo/redo** — full history with Ctrl+Z / Ctrl+Y
- **Copy/paste** — duplicate selected devices
- **Save/load** — export and import schematics as JSON files
- **Auto-save** — work is persisted to browser localStorage

## Export Options

- **Print** — configurable paper size, orientation, and scale
- **PNG** — high-resolution (4x) raster export
- **SVG** — vector export
- **DXF** — CAD-compatible export with organized layers for Vectorworks, AutoCAD, etc.
  - `EasySchematic-Devices` / `Connections` / `Labels` / `Ports` / `Rooms`
  - Connections sub-categorized by signal type (e.g., `EasySchematic-Connections-SDI`)

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

- [React](https://react.dev) + [TypeScript](https://www.typescriptlang.org/)
- [React Flow](https://reactflow.dev) (@xyflow/react) — node/edge canvas
- [Zustand](https://zustand.docs.pmnd.rs/) — state management
- [Tailwind CSS](https://tailwindcss.com) — styling
- [Vite](https://vite.dev) — build tool

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` + drag | Pan canvas |
| `Delete` / `Backspace` | Delete selected |
| `Ctrl+C` | Copy selected |
| `Ctrl+V` | Paste |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| Double-click device | Open device editor |

## License

MIT
