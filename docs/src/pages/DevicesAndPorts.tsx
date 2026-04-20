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
        only connect ports of the <strong>same signal type</strong>. EasySchematic includes 57 built-in signal types
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
          <tr><td><strong>DisplayPort</strong></td><td>Dark Teal</td><td>Display connections</td></tr>
          <tr><td><strong>Composite</strong></td><td>Yellow</td><td>Legacy analog video (BNC/RCA)</td></tr>
          <tr><td><strong>VGA</strong></td><td>Dark Blue</td><td>Analog video (DB15)</td></tr>
          <tr><td><strong>S-Video</strong></td><td>Amber</td><td>Legacy Y/C video (Mini-DIN-4)</td></tr>
          <tr><td><strong>DVI</strong></td><td>Deep Blue</td><td>Digital Visual Interface</td></tr>

          <tr><td colSpan={3}><strong>Video over IP</strong></td></tr>
          <tr><td><strong>NDI</strong></td><td>Green</td><td>Network video (NewTek)</td></tr>
          <tr><td><strong>HDBaseT</strong></td><td>Violet</td><td>HDMI over Cat cable</td></tr>
          <tr><td><strong>SRT</strong></td><td>Forest Green</td><td>Streaming protocol</td></tr>
          <tr><td><strong>ST 2110</strong></td><td>Deep Indigo</td><td>SMPTE 2110 IP media transport</td></tr>

          <tr><td colSpan={3}><strong>Audio</strong></td></tr>
          <tr><td><strong>Dante</strong></td><td>Orange</td><td>Network audio (Audinate)</td></tr>
          <tr><td><strong>AVB</strong></td><td>Lime</td><td>Network audio (IEEE 802.1 / TSN, Avnu — Biamp, Meyer, MOTU, PreSonus)</td></tr>
          <tr><td><strong>Analog Audio</strong></td><td>Brown</td><td>XLR/TRS audio</td></tr>
          <tr><td><strong>AES</strong></td><td>Purple</td><td>Digital audio</td></tr>
          <tr><td><strong>MADI</strong></td><td>Emerald</td><td>Multi-channel digital audio (BNC/fiber)</td></tr>
          <tr><td><strong>S/PDIF</strong></td><td>Light Violet</td><td>Digital audio (coaxial RCA)</td></tr>
          <tr><td><strong>ADAT</strong></td><td>Dark Cyan</td><td>Multi-channel optical audio (TOSLINK)</td></tr>
          <tr><td><strong>Ultranet</strong></td><td>Emerald</td><td>Behringer personal monitoring</td></tr>
          <tr><td><strong>AES50</strong></td><td>Purple</td><td>Klark Teknik/Behringer digital audio</td></tr>
          <tr><td><strong>StageConnect</strong></td><td>Orange</td><td>Yamaha digital audio</td></tr>
          <tr><td><strong>AES67</strong></td><td>Deep Indigo</td><td>AoIP interoperability standard</td></tr>
          <tr><td><strong>YDIF</strong></td><td>Dark Cyan</td><td>Yamaha digital interface</td></tr>
          <tr><td><strong>GigaACE</strong></td><td>Violet</td><td>Allen &amp; Heath proprietary audio network</td></tr>
          <tr><td><strong>DX5</strong></td><td>Lighter Violet</td><td>Allen &amp; Heath DX5 audio network</td></tr>
          <tr><td><strong>SLink</strong></td><td>Light Violet</td><td>Allen &amp; Heath SLink audio network</td></tr>
          <tr><td><strong>SoundGrid</strong></td><td>Deep Violet</td><td>Waves SoundGrid audio network</td></tr>
          <tr><td><strong>fibreACE</strong></td><td>Purple</td><td>Allen &amp; Heath fiber audio network</td></tr>

          <tr><td colSpan={3}><strong>Network</strong></td></tr>
          <tr><td><strong>Ethernet</strong></td><td>Teal</td><td>Network data</td></tr>
          <tr><td><strong>Fiber</strong></td><td>Amber</td><td>Fiber optic</td></tr>

          <tr><td colSpan={3}><strong>Control / Data</strong></td></tr>
          <tr><td><strong>USB</strong></td><td>Pink</td><td>USB connections</td></tr>
          <tr><td><strong>Thunderbolt</strong></td><td>Indigo</td><td>High-speed I/O</td></tr>
          <tr><td><strong>DMX</strong></td><td>Dark Red</td><td>Lighting control (XLR-5)</td></tr>
          <tr><td><strong>GPIO</strong></td><td>Warm Gray</td><td>General purpose I/O</td></tr>
          <tr><td><strong>RS-422</strong></td><td>Deep Violet</td><td>Machine control</td></tr>
          <tr><td><strong>Serial</strong></td><td>Gray</td><td>Generic serial</td></tr>
          <tr><td><strong>Tally</strong></td><td>Rose</td><td>Tally/status indicators</td></tr>
          <tr><td><strong>Art-Net</strong></td><td>Amber</td><td>Lighting network protocol (Ethernet)</td></tr>
          <tr><td><strong>sACN</strong></td><td>Yellow</td><td>Streaming ACN lighting protocol</td></tr>
          <tr><td><strong>IR</strong></td><td>Orange</td><td>Infrared control</td></tr>
          <tr><td><strong>DX Link</strong></td><td>Blue</td><td>AMX/Harman control network</td></tr>
          <tr><td><strong>MIDI</strong></td><td>Fuchsia</td><td>Musical instrument digital interface</td></tr>

          <tr><td colSpan={3}><strong>Sync / Clock</strong></td></tr>
          <tr><td><strong>Genlock</strong></td><td>Slate</td><td>Sync/timing reference</td></tr>
          <tr><td><strong>Word Clock</strong></td><td>Slate</td><td>Clock sync reference</td></tr>
          <tr><td><strong>Timecode</strong></td><td>Cyan</td><td>Timecode synchronization</td></tr>
          <tr><td><strong>DARS</strong></td><td>Slate</td><td>Digital Audio Reference Signal</td></tr>
          <tr><td><strong>GPS</strong></td><td>Emerald</td><td>GPS timing reference</td></tr>

          <tr><td colSpan={3}><strong>Streaming</strong></td></tr>
          <tr><td><strong>RF</strong></td><td>Magenta</td><td>Radio frequency (wireless, antenna)</td></tr>
          <tr><td><strong>RTMP</strong></td><td>Red</td><td>Real-Time Messaging Protocol</td></tr>
          <tr><td><strong>RTSP</strong></td><td>Orange</td><td>Real-Time Streaming Protocol</td></tr>
          <tr><td><strong>MPEG-TS</strong></td><td>Gold</td><td>MPEG Transport Stream</td></tr>

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
      <p>
        Some expansion cards have their own <strong>sub-slots</strong> — for example, a network
        I/O card with SFP or QSFP bays for swappable transceivers. These nested slots work the
        same way: right-click to swap modules in or out. The sub-slot{"'"}s ports are added to the
        parent device alongside the card{"'"}s own ports.
      </p>

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
          <tr><td>Mini HDMI</td><td>Mini HDMI</td></tr>
          <tr><td>Mini DisplayPort</td><td>Mini DisplayPort</td></tr>
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
          <tr><td>XLR-4</td><td>XLR-4</td></tr>
          <tr><td>Mini-DIN 4-pin</td><td>S-Video cable</td></tr>
          <tr><td>Mini-DIN 7-pin</td><td>Mini-DIN-7</td></tr>
          <tr><td>2.5mm TRS</td><td>2.5mm TRS</td></tr>

          <tr><td colSpan={2}><strong>Network / Data</strong></td></tr>
          <tr><td>RJ45</td><td>Cat6</td></tr>
          <tr><td>EtherCon</td><td>Cat6 (EtherCon)</td></tr>
          <tr><td>SFP/SFP+</td><td>SFP Fiber</td></tr>
          <tr><td>LC Fiber</td><td>LC Fiber</td></tr>
          <tr><td>SC Fiber</td><td>SC Fiber</td></tr>
          <tr><td>opticalCON</td><td>opticalCON Fiber</td></tr>
          <tr><td>QSFP</td><td>QSFP Fiber</td></tr>
          <tr><td>MPO/MTP</td><td>MPO Fiber</td></tr>
          <tr><td>RJ11</td><td>RJ11</td></tr>
          <tr><td>RJ12</td><td>RJ12</td></tr>

          <tr><td colSpan={2}><strong>USB</strong></td></tr>
          <tr><td>USB-A</td><td>USB</td></tr>
          <tr><td>USB-B</td><td>USB</td></tr>
          <tr><td>USB-C</td><td>USB-C</td></tr>
          <tr><td>USB Mini-B</td><td>USB</td></tr>
          <tr><td>USB Micro-B</td><td>USB</td></tr>

          <tr><td colSpan={2}><strong>D-Sub / Serial</strong></td></tr>
          <tr><td>DB9</td><td>DB9</td></tr>
          <tr><td>DB15</td><td>DB15</td></tr>
          <tr><td>DB25</td><td>DB25</td></tr>
          <tr><td>DB37</td><td>DB37</td></tr>
          <tr><td>D-Sub 7W2</td><td>D-Sub 7W2</td></tr>
          <tr><td>Phoenix</td><td>Phoenix</td></tr>
          <tr><td>Terminal Block</td><td>Terminal Block</td></tr>

          <tr><td colSpan={2}><strong>Power</strong></td></tr>
          <tr><td>powerCON</td><td>powerCON</td></tr>
          <tr><td>powerCON TRUE1</td><td>powerCON TRUE1</td></tr>
          <tr><td>Edison</td><td>Edison</td></tr>
          <tr><td>IEC C14</td><td>IEC C14</td></tr>
          <tr><td>IEC C5</td><td>IEC C5</td></tr>
          <tr><td>IEC C7</td><td>IEC C7</td></tr>
          <tr><td>IEC C15</td><td>IEC C15</td></tr>
          <tr><td>IEC C20</td><td>IEC C20</td></tr>
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

          <tr><td colSpan={2}><strong>RF</strong></td></tr>
          <tr><td>Reverse TNC</td><td>Reverse TNC</td></tr>
          <tr><td>SMA</td><td>SMA</td></tr>

          <tr><td colSpan={2}><strong>Other</strong></td></tr>
          <tr><td>Multi-pin</td><td>Multi-pin</td></tr>
          <tr><td>Wireless</td><td>—</td></tr>
          <tr><td>None</td><td>—</td></tr>
          <tr><td>Other</td><td>Other</td></tr>
        </tbody>
      </table>

      <h2>Connector gender</h2>
      <p>
        Most connectors have a <strong>gender</strong> (male or female) that affects what cable you actually need. EasySchematic
        infers gender automatically from the connector type and direction — for example, an XLR-3 input is female and
        an XLR-3 output is male, while powerCON inlets are male and outlets are female. Fixed-gender connectors
        (RJ45, HDMI, USB-C, etc.) are always the same regardless of direction.
      </p>
      <p>
        For connectors where gender genuinely varies in real gear (XLR family, powerCON, IEC, Cam-Lok, banana, speakON,
        BNC, TRS), the port editor shows a <strong>gender override dropdown</strong> next to the connector type. Set this when
        the device's actual hardware doesn't follow the default convention — for instance, a ground-loop isolator with
        male XLR inputs.
      </p>
      <p>
        Gender flows into the <strong>cable schedule</strong>. A cable plug is always the <em>opposite</em> gender of the port it
        mates with — a male plug fits a female socket. For a normal device-to-device run (female input, male output),
        that's a standard M-F cable, and the pack list shows the plain cable name.
      </p>
      <p>
        When both endpoints share a gender, the cable label gets a suffix reflecting the cable's own ends:
      </p>
      <ul>
        <li>Two female ports (e.g. front and rear of a TT bantam patch bay) need an <strong>M-M</strong> cable — male plugs on both ends</li>
        <li>Two male ports (rare — e.g. two appliance-side IEC inlets wired back-to-back) need an <strong>F-F</strong> cable</li>
      </ul>

      <h2>Patch panels</h2>
      <p>
        Patch panels (RJ45 panels, BNC video bays, XLR audio bays, fiber panels, TT bantam patch bays) are bidirectional
        pass-throughs with ports on two physical faces. EasySchematic models them as a special device type:
      </p>
      <ul>
        <li>The port editor shows the two sides as <strong>Rear</strong> and <strong>Front</strong> instead of "Inputs" and "Outputs"</li>
        <li>The device on the canvas shows <strong>Rear</strong> on the left and <strong>Front</strong> on the right with a header above each column</li>
        <li>Rear and front ports default to the same gender — patch bays typically have female sockets on both faces, so a
            cable connecting two front ports correctly shows up as <code>M-M</code> (male plugs on both cable ends) in the pack list</li>
        <li>Connections work the same way as any other device — drag from one face to wherever the cable physically goes</li>
      </ul>
      <p>
        Built-in templates cover RJ45 (12/24/32/48-port), BNC video, XLR audio, fiber LC, and TT bantam audio patch bays
        in common port counts.
      </p>
      <p>
        A dedicated <strong>Patch Panel Schedule</strong> report (Menu → Reports → Patch Panels) lists every port of every
        patch panel in the schematic — one row per port, including unconnected ones. Each row shows the panel, room, face,
        position, connector, gender, and what's connected on the remote end (device, port, room, cable ID, cable type,
        signal, length). Group by Panel, Panel Room, Signal Type, or Face. An occupancy badge at the top of the report
        shows how many ports on each panel are used so you can spot free capacity at a glance.
      </p>

      <h2>Editing devices</h2>
      <p>
        <strong>Double-click</strong> any device to open the device editor. From there you can:
      </p>
      <ul>
        <li>Rename the device</li>
        <li>Edit identity fields — <strong>manufacturer</strong>, <strong>model number</strong>, <strong>category</strong>, and a <strong>reference URL</strong> (spec sheet link)</li>
        <li>Add, remove, or reorder ports</li>
        <li>Change port signal types and directions</li>
        <li>Set a custom body color, or use the separate <strong>header color picker</strong> to set the header bar color independently</li>
        <li>Save as a reusable user template, or set it as a project preset</li>
        <li>Revert to the original template defaults or the active preset</li>
        <li>Press <strong>Ctrl+Enter</strong> (or <strong>Cmd+Enter</strong> on Mac) from any field to apply changes and close the editor</li>
        <li>Set a <strong>hostname</strong> for network-addressable devices</li>
        <li>Toggle the <strong>venue-provided</strong> flag to mark devices supplied by the venue</li>
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

      <h2>Physical dimensions</h2>
      <p>
        Devices can store physical size data — <strong>height</strong>, <strong>width</strong>,
        and <strong>depth</strong> in millimeters, plus <strong>weight</strong> in kilograms.
        Set these in the device editor under the dimensions fields. This data is stored per
        device and included in device templates.
      </p>

      <h2>Auxiliary data</h2>
      <p>
        Each device can display up to 5 lines of <strong>auxiliary text</strong> at the bottom
        of the device node on the canvas. Use these for notes like serial numbers, firmware
        versions, or any other per-device metadata. Set auxiliary lines in the device editor
        under <strong>Auxiliary Data</strong>.
      </p>
      <p>Each line can be either free text, a bound device property, or a mix of both:</p>
      <ul>
        <li>
          <strong>Custom text</strong> — just type whatever you want in the row.
        </li>
        <li>
          <strong>Bind to a device property</strong> — click the <strong>+</strong> button next to
          a row and pick a field. A token like <code>{"{{hostname}}"}</code> gets inserted at the
          cursor. The device node shows the current value of that field and updates automatically
          whenever the field changes.
        </li>
        <li>
          <strong>Mix text and tokens</strong> — tokens can sit inside free text. For example,
          typing <code>IP: </code> and then inserting the Hostname field gives{" "}
          <code>IP: {"{{hostname}}"}</code>, which renders on the device as <code>IP: studio-mixer-3</code>.
        </li>
        <li>
          <strong>Live preview</strong> — rows containing a token show a muted{" "}
          <code>→ preview</code> line below the input while you edit, so you can see what the
          device will actually display.
        </li>
      </ul>
      <h3>Available fields</h3>
      <ul>
        <li><strong>Identity</strong> — Device Name, Hostname, Manufacturer, Model Number, Device Type</li>
        <li><strong>Power</strong> — Power Draw, Power Capacity, PoE Budget, Voltage</li>
        <li><strong>Physical</strong> — Weight, Width, Height, Depth</li>
        <li><strong>Cost</strong> — Unit Cost</li>
        <li><strong>Ports</strong> — Total, Input, Output, Bidirectional, Connected</li>
      </ul>
      <p>
        Units are added automatically — Power fields render as <code>450 W</code>, physical
        dimensions as <code>482 mm</code>, weight as <code>12.3 kg</code>, and cost as <code>$1,299.00</code>.
        If a bound field is empty on that device, the token resolves to nothing, so{" "}
        <code>Weight: {"{{weightKg}}"}</code> becomes <code>Weight: </code>. Unknown token names
        (typos) are left as literal text so mistakes are visible.
      </p>
      <p>
        <em>Not yet supported:</em> per-port fields like a specific port's IP address, VLAN, or
        MAC. Those live on individual ports rather than the device itself and aren't bindable in
        this version.
      </p>

      <h2>Port notes</h2>
      <p>
        Each port has an optional <strong>notes</strong> field for documenting specific usage —
        patch panel destinations, signal descriptions, or configuration details. Set notes per
        port in the device editor. Port notes appear in applicable reports.
      </p>

      <h2>Network configuration</h2>
      <p>
        Devices can have a <strong>hostname</strong> field, set in the device editor. Network-capable
        ports (Ethernet, NDI, Dante, AVB, SRT, HDBaseT, AES67, ST 2110) can also have per-port network
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
