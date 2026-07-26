export default function RacksPage() {
  return (
    <>
      <h1>Rack Builder</h1>

      <p>
        Rack pages give you a dedicated drawing surface for designing rack elevations alongside your
        signal flow. Devices live in one place — drop them on the schematic, place them in a rack,
        and edits to either side stay in sync. Connections, port assignments, and device specs are
        shared by reference; nothing is duplicated.
      </p>

      <h2>Pages and tabs</h2>
      <p>
        A schematic file can hold multiple pages. The tab bar at the bottom of the canvas shows the
        main schematic plus any rack pages and print sheets you&apos;ve added. Click a tab to switch
        views, drag tabs to reorder, and right-click for rename / duplicate / delete.
      </p>
      <ul>
        <li><strong>Schematic</strong> — the signal flow page (always present, always first)</li>
        <li><strong>Rack page</strong> — holds one or more rack elevations side by side</li>
        <li><strong>Print sheet</strong> — paper-sized layout page for composing rack views into a printable drawing (see <a href="/print-sheets">Print Sheets</a>)</li>
      </ul>
      <p>
        Add a rack page with the <strong>+</strong> button at the right end of the tab bar. Add a
        print sheet with the <strong>📄+</strong> button next to it.
      </p>

      <h2>Creating a rack</h2>
      <p>
        On a rack page, click <strong>Add Rack</strong> in the sidebar to open the rack wizard.
        Choose a preset or build a custom rack:
      </p>
      <ul>
        <li><strong>42U Floor Rack</strong> — standard full-height AV rack</li>
        <li><strong>25U / 16U Floor Rack</strong> — half-height and short floor-standing</li>
        <li><strong>12U / 6U Wall Mount</strong> — wall-mounted enclosure</li>
        <li><strong>4U / 8U Desktop</strong> — tabletop or portable</li>
        <li><strong>45U / 12U Open 2-Post</strong> — relay racks (open frame, no rear rails)</li>
        <li><strong>42U Open 4-Post</strong> — open-frame 4-post rack</li>
      </ul>
      <p>
        Custom mode lets you set rack type, height in U, and depth in mm directly. You can place
        multiple racks on a single page — useful for laying out an equipment room.
      </p>
      <p>
        Double-click a rack&apos;s label to rename it, either on the rack itself or in the sidebar.
      </p>

      <h2>Placing devices</h2>
      <p>
        The rack page sidebar shows all devices on the schematic that aren&apos;t yet placed in a
        rack. Drag from the sidebar onto a rack to place a device. The drop preview shows exactly
        where the device will land — green for valid, red for blocked.
      </p>
      <p>
        EasySchematic uses each device&apos;s physical dimensions (<strong>widthMm</strong>,{" "}
        <strong>heightMm</strong>, <strong>depthMm</strong>, set in the device editor or on the
        community template) to decide how it fits:
      </p>
      <ul>
        <li>
          <strong>Full-rack devices</strong> (≈482 mm panel, whole-U height) snap directly into rack
          slots, occupying the panel from rail to rail.
        </li>
        <li>
          <strong>Half-rack devices</strong> (≈220 mm panel) snap to the left side by default; drop
          a second half-rack on the same row and it lands on the right. Half-rack collisions are
          detected automatically.
        </li>
        <li>
          <strong>Shelf-only devices</strong> (small DI boxes, half-width DSPs, desktop gear that
          isn&apos;t rack-mountable) auto-create a 1U shelf and sit on top at their natural width.
          The drop preview shows a slim shelf bar so you can see what&apos;s about to happen.
        </li>
        <li>
          <strong>Oversize devices</strong> (anything wider than a 19&quot; panel — speakers, large
          consoles) are rejected with a toast. They won&apos;t fit.
        </li>
        <li>
          <strong>Unknown</strong> (no dimensions on the template) falls through to standard
          full-width placement, the same way racks worked before this feature.
        </li>
      </ul>
      <p>
        You can override the heuristic per-device with the <strong>Rack Form</strong> dropdown in
        the device editor&apos;s Physical Dimensions section (<strong>Auto</strong> /{' '}
        <strong>Full width</strong> / <strong>Half width</strong> / <strong>Shelf only</strong>) —
        useful for edge cases like desktop units with optional rack ears.
      </p>
      <p>
        Right-click a device on the schematic and choose <strong>Place in Rack</strong> to send it
        straight to a target rack from the schematic side, or <strong>Show in Rack</strong> to jump
        to its current placement.
      </p>

      <h2>Front, rear, and side views</h2>
      <p>
        Toggle between <strong>Front</strong>, <strong>Rear</strong>, and <strong>Side</strong>{" "}
        views from the rack toolbar.
      </p>
      <ul>
        <li>
          <strong>Front view</strong> renders devices with their face plates, connector icons, and
          mounting holes.
        </li>
        <li>
          <strong>Rear view</strong> shows the back of each device. Front-mounted gear appears as a
          striped occupancy ghost so you can see what&apos;s on the other side. Rear placement is
          blocked on 2-post racks (no rear rails to mount to).
        </li>
        <li>
          <strong>Side view</strong> shows a cross-section: device depth from front and rear rails,
          shelf-mounted gear at real depth, and any depth conflicts that would prevent the rack
          door from closing.
        </li>
      </ul>

      <h2>Accessories</h2>
      <p>
        Right-click an empty slot to add a rack accessory:
      </p>
      <ul>
        <li><strong>Shelf</strong> — surface for non-rack devices (auto-created when you drop a shelf-only device)</li>
        <li><strong>Vent panel</strong> — passive ventilation, rendered with hatching</li>
        <li><strong>Blank panel</strong> — solid filler</li>
        <li><strong>Drawer</strong> — pull-out drawer</li>
        <li><strong>Cable manager</strong> — horizontal cable management</li>
        <li><strong>Fan unit</strong> — active cooling</li>
      </ul>
      <p>
        Accessories live in the schematic file alongside placements and survive rack moves and
        page duplication.
      </p>

      <h2>Shelf-mounted devices</h2>
      <p>
        Devices on a shelf can be dragged horizontally to position them along the shelf, or dragged
        across to a different shelf. Snap guides appear during drag — gravity-snap to the shelf
        floor or stack on top of another device. Rotated devices wrap their labels and recompute
        truncation as needed.
      </p>

      <h2>Linking rooms to racks</h2>
      <p>
        A schematic room can be linked to a rack so the rack page knows which devices belong in it.
        Open the room editor (right-click → <strong>Edit Properties</strong>) and pick a rack from
        the <strong>Linked Rack</strong> dropdown.
      </p>
      <p>Once linked:</p>
      <ul>
        <li>
          The rack header shows a <strong>link badge</strong> with the room name. Click it to jump
          back to the room on the schematic.
        </li>
        <li>
          The rack sidebar groups unracked devices by linked room. An <strong>Auto-populate</strong>{" "}
          button proposes placements for every device in the linked room — review and accept the
          full set or pick individual devices to place.
        </li>
        <li>
          Devices outside any linked room land in an <strong>Other</strong> group at the bottom of
          the sidebar.
        </li>
      </ul>

      <h2>Context menus</h2>
      <p>Right-click anywhere on a rack for context-aware options:</p>
      <ul>
        <li>
          <strong>Empty slot</strong> — Add accessory, paste device (if one is in the clipboard).
        </li>
        <li>
          <strong>Device</strong> — Edit Face-Plate, Edit Device, Show on Schematic, Remove from Rack.
        </li>
        <li>
          <strong>Accessory</strong> — Resize, Remove.
        </li>
        <li>
          <strong>Rack frame</strong> — Rename, Delete, Duplicate, Move to Page.
        </li>
      </ul>

      <h2>Face-plate editor</h2>
      <p>
        Double-click a placed device or choose <strong>Edit Face-Plate</strong> from its context
        menu to open the face-plate editor — a WYSIWYG layout tool for arranging connectors on the
        device&apos;s front panel.
      </p>
      <ul>
        <li>Drag ports to custom positions; snap-to-grid for clean alignment</li>
        <li>Shift+click and Ctrl+A for multi-select; align (left/center/right/top/middle/bottom) and distribute (horizontal/vertical) tools</li>
        <li>Add custom labels — drag, resize, edit text, set typography</li>
        <li>Reset to auto-layout to start over</li>
        <li>Undo and redo (Ctrl+Z / Ctrl+Shift+Z) inside the modal</li>
        <li>Renders at canonical rack dimensions — what you see in the editor matches what the rack page draws</li>
      </ul>
      <p>
        Connector icons are drawn at real-world millimeter dimensions from manufacturer specs. The
        rack view picks an appropriate level of detail based on zoom: dots far out, silhouettes at
        mid-zoom, and detailed icons (with pin patterns, slot orientations, etc.) when zoomed in
        close. EasySchematic ships with 59 connector types covering virtually every connector
        you&apos;d find on AV gear.
      </p>

      <h2>Auto-shelf at a glance</h2>
      <p>
        If you&apos;ve been hitting the &quot;but this device isn&apos;t rack-mountable&quot; wall —
        DI boxes, half-width DSPs, line drivers, lavalier receivers, anything desktop-sized — drop
        it on an empty slot anyway. EasySchematic creates a 1U shelf and centers the device on it
        at its real width. No more 90 mm boxes painted as full 19&quot; panels.
      </p>

      <h2>Cascading deletions</h2>
      <p>
        Removing a device from the schematic also removes its rack placement (and the toast message
        tells you which rack). Deleting a rack removes all placements and accessories on it but
        leaves the underlying schematic devices alone — they go back to the unracked sidebar.
        Deleting a rack page asks for confirmation if any racks are linked to rooms.
      </p>

      <h2>Saving and undo</h2>
      <p>
        Rack pages, racks, placements, and accessories are saved alongside the schematic in the
        same file (and to cloud storage). Every meaningful change captures an undo snapshot —
        Ctrl+Z works the same as on the schematic page, including across page boundaries.
      </p>
    </>
  );
}
