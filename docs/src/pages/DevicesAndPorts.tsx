export default function DevicesAndPortsPage() {
  return (
    <>
      <h1>Devices &amp; Ports</h1>

      <h2>Devices</h2>
      <p>
        Each device in EasySchematic is a box on the canvas with labeled{" "}
        <strong>ports</strong> on its left and right sides:
      </p>
      <ul>
        <li><strong>Input ports</strong> (left side) — receive signals from other devices</li>
        <li><strong>Output ports</strong> (right side) — send signals to other devices</li>
        <li>
          <strong>Bidirectional ports</strong> (both sides) — can act as either input or output, but only one
          direction at a time
        </li>
      </ul>

      <h2>Signal types</h2>
      <p>
        Every port has a <strong>signal type</strong> that determines its color and connection compatibility. You can
        only connect ports of the <strong>same signal type</strong>.
      </p>
      <table>
        <thead>
          <tr>
            <th>Signal Type</th>
            <th>Color</th>
            <th>Use Case</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><strong>SDI</strong></td><td>Blue</td><td>Broadcast video (BNC)</td></tr>
          <tr><td><strong>HDMI</strong></td><td>Red</td><td>Consumer/prosumer video</td></tr>
          <tr><td><strong>NDI</strong></td><td>Green</td><td>Network video (NewTek)</td></tr>
          <tr><td><strong>Dante</strong></td><td>Orange</td><td>Network audio</td></tr>
          <tr><td><strong>Analog Audio</strong></td><td>Brown</td><td>XLR/TRS audio</td></tr>
          <tr><td><strong>AES</strong></td><td>Purple</td><td>Digital audio</td></tr>
          <tr><td><strong>DMX</strong></td><td>Dark Red</td><td>Lighting control (XLR-5)</td></tr>
          <tr><td><strong>MADI</strong></td><td>Emerald</td><td>Multi-channel digital audio (BNC/fiber)</td></tr>
          <tr><td><strong>USB</strong></td><td>Pink</td><td>USB connections</td></tr>
          <tr><td><strong>Ethernet</strong></td><td>Teal</td><td>Network data</td></tr>
          <tr><td><strong>Fiber</strong></td><td>Amber</td><td>Fiber optic</td></tr>
          <tr><td><strong>DisplayPort</strong></td><td>Dark Teal</td><td>Display connections</td></tr>
          <tr><td><strong>HDBaseT</strong></td><td>Violet</td><td>HDMI over Cat cable</td></tr>
          <tr><td><strong>SRT</strong></td><td>Forest Green</td><td>Streaming protocol</td></tr>
          <tr><td><strong>Genlock</strong></td><td>Slate</td><td>Sync/timing reference</td></tr>
          <tr><td><strong>GPIO</strong></td><td>Warm Gray</td><td>General purpose I/O</td></tr>
          <tr><td><strong>RS-422</strong></td><td>Deep Violet</td><td>Machine control</td></tr>
          <tr><td><strong>Serial</strong></td><td>Gray</td><td>Generic serial</td></tr>
          <tr><td><strong>Thunderbolt</strong></td><td>Indigo</td><td>High-speed I/O</td></tr>
          <tr><td><strong>Composite</strong></td><td>Yellow</td><td>Legacy analog video (BNC/RCA)</td></tr>
          <tr><td><strong>VGA</strong></td><td>Dark Blue</td><td>Analog video (DB15)</td></tr>
          <tr><td><strong>Power</strong></td><td>Dark Amber</td><td>Power connections</td></tr>
          <tr><td><strong>MIDI</strong></td><td>Fuchsia</td><td>Musical instrument digital interface</td></tr>
          <tr><td><strong>Tally</strong></td><td>Rose</td><td>Tally/status indicators</td></tr>
          <tr><td><strong>S/PDIF</strong></td><td>Light Violet</td><td>Digital audio (coaxial RCA)</td></tr>
          <tr><td><strong>ADAT</strong></td><td>Dark Cyan</td><td>Multi-channel optical audio (TOSLINK)</td></tr>
          <tr><td><strong>Custom</strong></td><td>User-defined</td><td>Custom signal types for anything not covered above</td></tr>
        </tbody>
      </table>

      <h2>Port sections</h2>
      <p>
        Devices with many ports can organize them into <strong>sections</strong> — logical groupings like "Video",
        "Audio", "Control". Sections appear as labeled dividers within the port columns.
      </p>

      <h2>Expansion slots</h2>
      <p>
        Some devices have <strong>expansion slots</strong> — swappable card bays that accept different I/O cards.
        This mirrors real hardware: a router chassis might have empty slots you populate with SDI, HDMI, or fiber
        cards depending on the job.
      </p>
      <ul>
        <li><strong>Right-click a slot</strong> on a device to see available cards and swap one in</li>
        <li>Each card contributes its own ports to the parent device</li>
        <li>Slots show the currently installed card name (or "Empty" if unoccupied)</li>
        <li>Swapping a card removes the old card's ports and adds the new card's ports</li>
      </ul>

      <h2>Editing devices</h2>
      <p>
        <strong>Double-click</strong> any device to open the device editor. From there you can:
      </p>
      <ul>
        <li>Rename the device</li>
        <li>Add, remove, or reorder ports</li>
        <li>Change port signal types and directions</li>
        <li>Set a custom body color, or use the separate <strong>header color picker</strong> to set the header bar color independently</li>
        <li>Save as a reusable user template, or set it as a project preset</li>
        <li>Revert to the original template defaults or the active preset</li>
      </ul>
    </>
  );
}
