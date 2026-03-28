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
        only connect ports of the <strong>same signal type</strong>. EasySchematic includes 40 built-in signal types
        covering video, audio, data, power, and control:
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
          <tr><td colSpan={3}><strong>Video</strong></td></tr>
          <tr><td><strong>SDI</strong></td><td>Blue</td><td>Broadcast video (BNC)</td></tr>
          <tr><td><strong>HDMI</strong></td><td>Red</td><td>Consumer/prosumer video</td></tr>
          <tr><td><strong>NDI</strong></td><td>Green</td><td>Network video (NewTek)</td></tr>
          <tr><td><strong>DisplayPort</strong></td><td>Dark Teal</td><td>Display connections</td></tr>
          <tr><td><strong>HDBaseT</strong></td><td>Violet</td><td>HDMI over Cat cable</td></tr>
          <tr><td><strong>SRT</strong></td><td>Forest Green</td><td>Streaming protocol</td></tr>
          <tr><td><strong>Composite</strong></td><td>Yellow</td><td>Legacy analog video (BNC/RCA)</td></tr>
          <tr><td><strong>VGA</strong></td><td>Dark Blue</td><td>Analog video (DB15)</td></tr>
          <tr><td><strong>ST 2110</strong></td><td>Deep Indigo</td><td>SMPTE 2110 IP media transport</td></tr>

          <tr><td colSpan={3}><strong>Audio</strong></td></tr>
          <tr><td><strong>Dante</strong></td><td>Orange</td><td>Network audio</td></tr>
          <tr><td><strong>Analog Audio</strong></td><td>Brown</td><td>XLR/TRS audio</td></tr>
          <tr><td><strong>AES</strong></td><td>Purple</td><td>Digital audio</td></tr>
          <tr><td><strong>MADI</strong></td><td>Emerald</td><td>Multi-channel digital audio (BNC/fiber)</td></tr>
          <tr><td><strong>S/PDIF</strong></td><td>Light Violet</td><td>Digital audio (coaxial RCA)</td></tr>
          <tr><td><strong>ADAT</strong></td><td>Dark Cyan</td><td>Multi-channel optical audio (TOSLINK)</td></tr>
          <tr><td><strong>Ultranet</strong></td><td>Emerald</td><td>Behringer personal monitoring</td></tr>
          <tr><td><strong>AES50</strong></td><td>Purple</td><td>Klark Teknik/Behringer digital audio</td></tr>
          <tr><td><strong>StageConnect</strong></td><td>Orange</td><td>Yamaha digital audio</td></tr>
          <tr><td><strong>Word Clock</strong></td><td>Slate</td><td>Clock sync reference</td></tr>
          <tr><td><strong>AES67</strong></td><td>Deep Indigo</td><td>AoIP interoperability standard</td></tr>
          <tr><td><strong>YDIF</strong></td><td>Dark Cyan</td><td>Yamaha digital interface</td></tr>
          <tr><td><strong>MIDI</strong></td><td>Fuchsia</td><td>Musical instrument digital interface</td></tr>

          <tr><td colSpan={3}><strong>Data &amp; Control</strong></td></tr>
          <tr><td><strong>USB</strong></td><td>Pink</td><td>USB connections</td></tr>
          <tr><td><strong>Ethernet</strong></td><td>Teal</td><td>Network data</td></tr>
          <tr><td><strong>Fiber</strong></td><td>Amber</td><td>Fiber optic</td></tr>
          <tr><td><strong>Thunderbolt</strong></td><td>Indigo</td><td>High-speed I/O</td></tr>
          <tr><td><strong>DMX</strong></td><td>Dark Red</td><td>Lighting control (XLR-5)</td></tr>
          <tr><td><strong>Genlock</strong></td><td>Slate</td><td>Sync/timing reference</td></tr>
          <tr><td><strong>GPIO</strong></td><td>Warm Gray</td><td>General purpose I/O</td></tr>
          <tr><td><strong>RS-422</strong></td><td>Deep Violet</td><td>Machine control</td></tr>
          <tr><td><strong>Serial</strong></td><td>Gray</td><td>Generic serial</td></tr>
          <tr><td><strong>Tally</strong></td><td>Rose</td><td>Tally/status indicators</td></tr>

          <tr><td colSpan={3}><strong>Broadcast</strong></td></tr>
          <tr><td><strong>RF</strong></td><td>Magenta</td><td>Radio frequency (wireless, antenna)</td></tr>

          <tr><td colSpan={3}><strong>Power</strong></td></tr>
          <tr><td><strong>Power</strong></td><td>Dark Amber</td><td>Power connections</td></tr>
          <tr><td><strong>L1 (Phase A)</strong></td><td>Black</td><td>Three-phase power, Phase A</td></tr>
          <tr><td><strong>L2 (Phase B)</strong></td><td>Red</td><td>Three-phase power, Phase B</td></tr>
          <tr><td><strong>L3 (Phase C)</strong></td><td>Blue</td><td>Three-phase power, Phase C</td></tr>
          <tr><td><strong>Neutral</strong></td><td>Gray</td><td>Neutral conductor</td></tr>
          <tr><td><strong>Ground</strong></td><td>Green</td><td>Safety ground / earth</td></tr>

          <tr><td colSpan={3}><strong>Other</strong></td></tr>
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

      <h2>Connector types</h2>
      <p>
        Each port can have a <strong>connector type</strong> (XLR-3, HDMI, RJ45, etc.) that determines physical
        cable compatibility. Some connectors are <strong>combo types</strong> — for example, an XLR/TRS Combo jack
        accepts both XLR-3 and 1/4" TRS plugs. EasySchematic handles these automatically: connecting a TRS cable
        to a combo jack shows no mismatch and the cable schedule labels it correctly.
      </p>
      <table>
        <thead>
          <tr>
            <th>Connector</th>
            <th>Cable Type</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colSpan={2}><strong>Video</strong></td></tr>
          <tr><td>BNC</td><td>Coaxial</td></tr>
          <tr><td>HDMI</td><td>HDMI</td></tr>
          <tr><td>DisplayPort</td><td>DisplayPort</td></tr>
          <tr><td>DVI</td><td>DVI</td></tr>
          <tr><td>VGA (DB15)</td><td>VGA</td></tr>

          <tr><td colSpan={2}><strong>Audio</strong></td></tr>
          <tr><td>XLR-3</td><td>XLR</td></tr>
          <tr><td>XLR-5</td><td>XLR-5</td></tr>
          <tr><td>Mini XLR</td><td>Mini XLR</td></tr>
          <tr><td>XLR/TRS Combo</td><td>XLR</td></tr>
          <tr><td>{"1/4\" TRS"}</td><td>{"1/4\" TRS"}</td></tr>
          <tr><td>3.5mm TRS</td><td>3.5mm TRS</td></tr>
          <tr><td>RCA</td><td>RCA</td></tr>
          <tr><td>TOSLINK</td><td>TOSLINK</td></tr>
          <tr><td>DIN-5</td><td>DIN-5</td></tr>
          <tr><td>speakON</td><td>speakON</td></tr>

          <tr><td colSpan={2}><strong>Network / Data</strong></td></tr>
          <tr><td>RJ45</td><td>Cat6</td></tr>
          <tr><td>EtherCon</td><td>Cat6 (EtherCon)</td></tr>
          <tr><td>SFP/SFP+</td><td>SFP Fiber</td></tr>
          <tr><td>LC Fiber</td><td>LC Fiber</td></tr>
          <tr><td>SC Fiber</td><td>SC Fiber</td></tr>
          <tr><td>opticalCON</td><td>opticalCON Fiber</td></tr>
          <tr><td>QSFP</td><td>QSFP Fiber</td></tr>
          <tr><td>MPO/MTP</td><td>MPO Fiber</td></tr>

          <tr><td colSpan={2}><strong>USB / Thunderbolt</strong></td></tr>
          <tr><td>USB-A</td><td>USB</td></tr>
          <tr><td>USB-B</td><td>USB</td></tr>
          <tr><td>USB-C</td><td>USB-C</td></tr>

          <tr><td colSpan={2}><strong>Control / Serial</strong></td></tr>
          <tr><td>DB9</td><td>DB9</td></tr>
          <tr><td>DB15</td><td>DB15</td></tr>
          <tr><td>DB25</td><td>DB25</td></tr>
          <tr><td>D-Sub 7W2</td><td>D-Sub 7W2</td></tr>
          <tr><td>Phoenix</td><td>Phoenix</td></tr>
          <tr><td>Terminal Block</td><td>Terminal Block</td></tr>

          <tr><td colSpan={2}><strong>Power</strong></td></tr>
          <tr><td>powerCON</td><td>powerCON</td></tr>
          <tr><td>Edison</td><td>Edison</td></tr>
          <tr><td>IEC</td><td>IEC</td></tr>
          <tr><td>L5-20</td><td>L5-20</td></tr>
          <tr><td>L6-20</td><td>L6-20</td></tr>
          <tr><td>L6-30</td><td>L6-30</td></tr>
          <tr><td>L21-30</td><td>L21-30</td></tr>
          <tr><td>Cam-Lok</td><td>Cam-Lok</td></tr>
          <tr><td>Socapex</td><td>Socapex</td></tr>
          <tr><td>DC Barrel</td><td>DC Barrel</td></tr>

          <tr><td colSpan={2}><strong>Speaker</strong></td></tr>
          <tr><td>Banana</td><td>Speaker Wire</td></tr>
          <tr><td>Binding Post</td><td>Speaker Wire</td></tr>
          <tr><td>Binding Post/Banana</td><td>Speaker Wire</td></tr>

          <tr><td colSpan={2}><strong>Other</strong></td></tr>
          <tr><td>Multi-pin</td><td>Multi-pin</td></tr>
          <tr><td>None</td><td>—</td></tr>
          <tr><td>Other</td><td>Other</td></tr>
        </tbody>
      </table>

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
        <li>Press <strong>Ctrl+Enter</strong> (or <strong>Cmd+Enter</strong> on Mac) from any field to apply changes and close the editor</li>
      </ul>

      <h2>Port flipping</h2>
      <p>
        By default, input ports appear on the <strong>left</strong> side of a device and output ports on
        the <strong>right</strong>. Any port can be <strong>flipped</strong> to appear on the opposite side.
      </p>
      <ul>
        <li><strong>Right-click a port</strong> in the device editor to flip it</li>
        <li>Flipped ports show a small arrow indicator so you can tell at a glance</li>
        <li>Useful for creating left-to-right signal flow or matching physical rack layouts</li>
        <li>Bidirectional ports can also be flipped to swap which side they default to</li>
      </ul>

      <h2>Network configuration</h2>
      <p>
        Devices can have a <strong>hostname</strong> field, set in the device editor. Network-capable
        ports (Ethernet, NDI, Dante, SRT, HDBaseT, AES67, ST 2110) can also have per-port network
        configuration:
      </p>
      <ul>
        <li><strong>IP address</strong>, <strong>subnet mask</strong>, and <strong>gateway</strong></li>
        <li><strong>VLAN ID</strong></li>
        <li><strong>DHCP</strong> enabled/disabled</li>
        <li><strong>Link speed</strong></li>
        <li><strong>PoE power draw</strong> (watts)</li>
      </ul>
      <p>
        Network config is entered in the device editor under each port's settings. This data feeds
        into the <a href="/pack-list">Network Report</a>.
      </p>
    </>
  );
}
