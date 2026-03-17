import RoomDemo from "../components/demos/RoomDemo";

export default function RoomsAndGroupingPage() {
  return (
    <>
      <h1>Rooms &amp; Grouping</h1>

      <h2>Rooms</h2>
      <p>
        Rooms are <strong>containers</strong> that represent physical locations — a control booth, a stage, a
        rack room, etc. Devices inside a room move with it when you drag the room.
      </p>
      <RoomDemo />

      <h2>Creating rooms</h2>
      <ol>
        <li>Find "Room" in the device library sidebar</li>
        <li>Drag it onto the canvas</li>
        <li>Or <strong>double-click</strong> the canvas, type "room", and press Enter</li>
        <li>Double-click the room label to rename it</li>
      </ol>

      <h2>Parenting devices</h2>
      <ul>
        <li><strong>Drag a device onto a room</strong> — the device becomes a child of that room</li>
        <li><strong>Drag a device out of a room</strong> — the device detaches and becomes independent</li>
        <li>Parenting is based on where the <strong>center</strong> of the device lands</li>
      </ul>
      <p>When a device is parented to a room:</p>
      <ul>
        <li>Its position is stored <strong>relative</strong> to the room</li>
        <li>Moving the room moves all its children</li>
        <li>The device stays visually inside the room's dashed border</li>
      </ul>

      <h2>Resizing rooms</h2>
      <p>
        Select a room to see resize handles on its corners and edges. Drag them to make the room larger or smaller.
        Resize handles snap to other rooms' edges with blue guide lines for precise alignment.
      </p>

      <h2>Room styling</h2>
      <p>
        <strong>Right-click</strong> a room to open the Room Properties editor. You can customize:
      </p>
      <ul>
        <li><strong>Label</strong> — the room's display name</li>
        <li><strong>Label size</strong> — adjustable from 9px to 24px</li>
        <li><strong>Background color</strong> — fill color for the room area</li>
        <li><strong>Border style</strong> — solid, dashed, or dotted</li>
        <li><strong>Border color</strong> — outline color for the room boundary</li>
      </ul>

      <h2>Snap guides</h2>
      <p>
        When dragging rooms near other rooms, <strong>blue dashed guide lines</strong> appear to help
        you align edges and centers. The same guides appear during room resizing. Devices also snap
        to room edges when dragged near them.
      </p>

      <h2>Deleting rooms</h2>
      <p>
        When you delete a room, its child devices are <strong>un-parented</strong> (converted to absolute positions)
        rather than deleted. This prevents accidentally losing device configurations.
      </p>
    </>
  );
}
