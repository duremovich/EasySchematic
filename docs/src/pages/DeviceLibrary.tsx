export default function DeviceLibraryPage() {
  return (
    <>
      <h1>Device Library</h1>

      <h2>Built-in templates</h2>
      <p>
        The device library sidebar contains <strong>65+ real-world device templates</strong> organized by category:
      </p>
      <ul>
        <li><strong>Cameras</strong> — PTZ cameras, cinema cameras, camcorders</li>
        <li><strong>Switchers</strong> — video switchers, production switchers</li>
        <li><strong>Monitors</strong> — confidence monitors, multiviewers</li>
        <li><strong>Converters</strong> — SDI↔HDMI, fiber, format converters</li>
        <li><strong>Audio</strong> — mixers, audio interfaces, speakers</li>
        <li><strong>Recorders</strong> — disk recorders, capture devices</li>
        <li><strong>Streaming</strong> — encoders, decoders</li>
        <li><strong>Networking</strong> — switches, media converters</li>
        <li><strong>Graphics</strong> — CG systems, character generators</li>
        <li><strong>Displays</strong> — projectors, LED walls</li>
        <li><strong>KVM / Extenders</strong> — KVM switches, HDMI/SDI extenders</li>
        <li><strong>Wireless</strong> — wireless video transmitters/receivers</li>
        <li><strong>Control</strong> — control surfaces, tally systems</li>
        <li><strong>Peripherals</strong> — peripherals and accessories</li>
      </ul>

      <h2>Using templates</h2>
      <ol>
        <li><strong>Search</strong> by typing in the search box at the top of the sidebar</li>
        <li><strong>Drag</strong> a template from the library onto the canvas</li>
        <li>The device appears with pre-configured ports matching the real hardware</li>
      </ol>
      <p>
        Templates provide sensible defaults — the right signal types, port labels, and I/O configuration for each
        device type.
      </p>

      <h2>Custom templates</h2>
      <p>After editing a device's ports and configuration:</p>
      <ol>
        <li><strong>Double-click</strong> the device to open the editor</li>
        <li>Configure ports, labels, and signal types as needed</li>
        <li>Click <strong>Save as Template</strong> at the bottom of the editor</li>
        <li>The template appears in a "Custom" category in the library</li>
      </ol>
      <p>Custom templates persist in your browser's localStorage.</p>

      <h2>Auto-numbering</h2>
      <p>
        When you place multiple instances of the same device template, EasySchematic automatically numbers them:
        "Camera 1", "Camera 2", etc. Renaming a device manually removes it from auto-numbering.
      </p>

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
