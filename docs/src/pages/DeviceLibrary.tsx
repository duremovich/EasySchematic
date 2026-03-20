export default function DeviceLibraryPage() {
  return (
    <>
      <h1>Device Library</h1>

      <h2>Built-in templates</h2>
      <p>
        The device library sidebar contains <strong>350+ real-world device templates</strong> organized by category:
      </p>
      <ul>
        <li><strong>Sources</strong> — cameras, PTZ cameras, graphics, computers, media players</li>
        <li><strong>Switching</strong> — video switchers (ATEM family, Roland, Barco, Analog Way), routers</li>
        <li><strong>Processing</strong> — converters, scalers, frame syncs, multiviewers, capture cards</li>
        <li><strong>Distribution</strong> — DAs, video wall controllers</li>
        <li><strong>Monitoring</strong> — production monitors (SmartView, SmallHD, Marshall, Atomos)</li>
        <li><strong>Recording</strong> — HyperDecks, Ki Pro, Sound Devices</li>
        <li><strong>Audio</strong> — consoles (Yamaha CL/QL/TF, A&H dLive/SQ, DiGiCo SD7), stage boxes, DSP, wireless mics, intercom</li>
        <li><strong>Speakers & Amps</strong> — line arrays, powered speakers, subwoofers, amplifiers (Meyer, L'Acoustics, QSC, JBL)</li>
        <li><strong>Networking</strong> — NDI encoders/decoders, streaming encoders, network switches, AV-over-IP</li>
        <li><strong>LED Video</strong> — LED processors (Brompton Tessera, Novastar)</li>
        <li><strong>Media Servers</strong> — Disguise d3, Dataton WATCHPAX</li>
        <li><strong>Lighting</strong> — consoles (ETC, grandMA3, Road Hog), moving lights, LED fixtures, DMX splitters</li>
        <li><strong>Wireless</strong> — wireless video transmitters/receivers, intercom</li>
        <li><strong>KVM / Extenders</strong> — KVM switches, HDBaseT extenders</li>
        <li><strong>Control</strong> — control processors, tally systems, timecode generators, MIDI devices</li>
        <li><strong>Projection</strong> — large venue projectors</li>
        <li><strong>Infrastructure</strong> — patch panels, rack shelves, power distribution</li>
        <li><strong>Cloud Services</strong> — cloud platforms, streaming services, SaaS endpoints</li>
        <li><strong>Cable Accessories</strong> — snakes, breakout cables, stage boxes, multicables</li>
        <li><strong>Peripherals</strong> — mice, keyboards, adapters</li>
      </ul>

      <h2>Using templates</h2>
      <ol>
        <li><strong>Search</strong> by typing in the search box — multi-word queries are scored and ranked, with favorites boosted to the top</li>
        <li><strong>Drag</strong> a template from the library onto the canvas</li>
        <li>The device appears with pre-configured ports matching the real hardware</li>
      </ol>
      <p>
        Templates provide sensible defaults — the right signal types, port labels, and I/O configuration for each
        device type.
      </p>

      <h2>User templates</h2>
      <p>After editing a device's ports and configuration:</p>
      <ol>
        <li><strong>Double-click</strong> the device to open the editor</li>
        <li>Configure ports, labels, and signal types as needed</li>
        <li>Click <strong>Save as User Template</strong> at the bottom of the editor</li>
        <li>The template appears in a "User Templates" category in the library</li>
      </ol>
      <p>User templates persist in your browser's localStorage.</p>

      <h2>Favorites</h2>
      <p>
        Star any device template in the library to mark it as a favorite. Favorites are pinned to
        the top of the sidebar in their own <strong>Favorites</strong> category and are boosted to the
        top of search results.
      </p>
      <ul>
        <li>Click the <strong>star icon</strong> on any library item to toggle favorite status</li>
        <li>Favorites are saved in your schematic file and persist across sessions</li>
      </ul>

      <h2>Template presets</h2>
      <p>
        Presets let you save a device configuration as the <strong>project-wide default</strong> for
        that template. Every new placement of that device will automatically apply the preset
        configuration.
      </p>
      <ol>
        <li>Edit a device's ports, labels, or signal types</li>
        <li>Click <strong>Save as Preset</strong> in the device editor</li>
        <li>The library shows a <strong>preset badge</strong> on that template</li>
      </ol>
      <p>
        When editing a device that has a preset, a blue banner shows the active preset with
        a <strong>Clear</strong> button. If the device's configuration has drifted from the preset,
        you'll see <strong>Revert to Preset</strong> and <strong>Revert to Template</strong> buttons
        to restore either baseline.
      </p>

      <h2>Auto-numbering</h2>
      <p>
        When you place multiple instances of the same device template, EasySchematic automatically numbers them:
        "Camera 1", "Camera 2", etc. Renaming a device manually removes it from auto-numbering.
      </p>

      <h2>Expansion slots</h2>
      <p>
        Some devices have <strong>expansion slots</strong> — swappable card bays that accept different I/O cards.
        This mirrors how real hardware works: a video router chassis might ship with empty slots that you populate
        with SDI, HDMI, or fiber cards depending on the job.
      </p>
      <ul>
        <li><strong>Right-click a slot</strong> on a device to see available cards and swap one in</li>
        <li>Each card contributes its own ports to the parent device</li>
        <li>Slots show the currently installed card name (or "Empty" if unoccupied)</li>
        <li>Swapping a card removes the old card's ports and adds the new card's ports</li>
      </ul>

      <h2>Community device database</h2>
      <p>
        The <a href="https://devices.easyschematic.live" target="_blank" rel="noopener noreferrer">community device database</a> lets
        anyone browse, search, and contribute device templates.
      </p>
      <ul>
        <li><strong>Submit new devices</strong> — log in with your email, fill out the device form with ports and specs,
          and include a reference URL to the manufacturer's product page</li>
        <li><strong>Suggest edits</strong> — see a mistake or missing port? Propose changes to any existing template</li>
        <li><strong>Moderation</strong> — submissions are reviewed by moderators before going live to ensure accuracy</li>
        <li><strong>Reference URLs</strong> — branded devices link directly to the manufacturer's product page so
          moderators (and you) can verify specs</li>
        <li><strong>Contributor credit</strong> — approved submissions are attributed to you on the device page and
          the contributors hall of fame</li>
      </ul>
    </>
  );
}
