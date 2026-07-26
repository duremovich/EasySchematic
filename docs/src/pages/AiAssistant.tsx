export default function AiAssistantPage() {
  return (
    <>
      <h1>AI Assistant (MCP)</h1>

      <p>
        EasySchematic can connect to an AI assistant (such as Claude) so it can{" "}
        <strong>read and edit your schematic live</strong> — searching the device
        library, adding devices, setting device properties, and making
        connections, with the results appearing on your canvas as it works. This
        is an early <strong>Beta</strong> and is turned off by default.
      </p>

      <div
        className="border-l-4 border-blue-400 bg-blue-50 p-4 rounded-r my-4"
        role="note"
      >
        <strong>How it works:</strong> a small program called the{" "}
        <em>MCP server</em> runs on your own computer. The assistant talks to that
        server, and the server talks to your open EasySchematic tab over a
        connection that stays on your machine (<code>127.0.0.1</code> only). Your
        drawing is reachable only while you turn the setting on, and only after a
        one-time <strong>pairing token</strong> is matched.
      </div>

      <h2>1. Start the MCP server</h2>

      <p>
        The server lives in the <code>mcp-server</code> folder of the project. Build
        it once, then run it:
      </p>

      <pre>
        <code>{`cd mcp-server
npm install
npm run build

node dist/index.js`}</code>
      </pre>

      <p>
        On startup it prints a <strong>pairing token</strong> and the port it is
        listening on (default <code>8765</code>).
      </p>

      <h2>2. Turn it on in EasySchematic</h2>

      <ol>
        <li>
          Open <strong>Preferences → AI (Beta)</strong>.
        </li>
        <li>Paste the <strong>pairing token</strong> the server printed.</li>
        <li>
          Make sure the <strong>port</strong> matches the server (default 8765).
        </li>
        <li>
          Turn on <strong>“Let Claude read &amp; edit this schematic.”</strong> The
          status should change to <em>Connected</em>.
        </li>
      </ol>

      <p>
        Only one tab is connected at a time — the most recent tab where you turn
        the setting on takes over, and any earlier tab shows <em>Not connected</em>.
      </p>

      <h2>3. Register the server with your assistant</h2>

      <p>
        Point your assistant's MCP configuration at the server. With Claude Code,
        for example:
      </p>

      <pre>
        <code>{`claude mcp add easyschematic -- node /absolute/path/to/EasySchematic/mcp-server/dist/index.js`}</code>
      </pre>

      <p>
        Then you can ask things like <em>“search for a 4K display, add it, and
        connect the laptop's HDMI output to it.”</em>
      </p>

      <h2>What it can do in Beta</h2>

      <p>The assistant has a core set of tools:</p>

      <ul>
        <li>
          <strong>Read</strong> — view the schematic (its devices, connections,
          rooms and notes), list devices, inspect one device, and search the device
          library.
        </li>
        <li>
          <strong>Add a device</strong> from a library template.
        </li>
        <li>
          <strong>Set device properties</strong> — a safe set such as label,
          short name, manufacturer, model number, note, serial number, unit cost,
          and power figures. Structural fields (ports, slots) are not editable yet
          and are refused.
        </li>
        <li>
          <strong>Connect two devices</strong>. For two-sided ports the assistant
          specifies a face — bidirectional ports use <code>in</code>/<code>out</code>,
          passthrough ports use <code>rear</code>/<code>front</code>. Every
          connection is validated before it is made.
        </li>
        <li>
          <strong>Move a device</strong> to a new position. The device stays in its
          current room or rack — this does not move it into or out of one.
        </li>
        <li>
          <strong>Create a room</strong> — a labelled container devices can sit
          inside. Size is optional (defaults to 400×300). Any devices already inside
          the new room's outline are pulled into it.
        </li>
        <li>
          <strong>Place a device in a room.</strong> The position is given relative
          to the room's top-left corner. If the spot is outside the room the request
          is refused and nothing changes, so a device is never reported as placed
          when it isn't. To nudge a device that is already in a room, use move a
          device instead.
        </li>
        <li>
          <strong>Add, edit, and delete notes</strong> — text note cards placed on
          the canvas to annotate or explain the schematic. The text is shown literally
          and line breaks are kept. Existing notes show up when the assistant reads the
          schematic, so it can rewrite a note's text or remove it. Editing replaces the
          whole note, so a note you formatted in the editor (bold, lists) becomes plain
          text when the assistant rewrites it.
        </li>
        <li>
          <strong>Remove a single connection.</strong> Stubbed connections can't be
          removed this way yet — delete one of their devices, or remove them in the
          editor.
        </li>
        <li>
          <strong>Delete a device.</strong>
        </li>
        <li>
          <strong>Fill a modular chassis</strong> — for a device with slots, the
          assistant can see its slots (via the device details), list the expansion
          cards that fit a slot, install a card into an empty slot, and remove a card
          to empty a slot. A card is only installed when its slot family matches the
          slot's, and installing never silently replaces a card already in a slot.
          (Defining new slots is still done in the editor.)
        </li>
        <li>
          <strong>Build a rack elevation</strong> — the assistant can see your rack
          elevations, create a rack (it makes a rack-elevation page if you don't have
          one), mount a device into a rack at a given U position (front or rear), and
          remove a device from a rack. It won't stack two devices in the same space,
          place a device that's already in another rack, or use the rear of a 2-post
          frame. Full- and half-rack gear is placed automatically from each device's
          physical size; very small gear that needs a shelf is dropped onto a shelf the
          assistant adds for it, and removing that device later clears the shelf too —
          unless you've made the shelf your own (renamed, resized, moved it, or put
          another device on it), in which case the assistant leaves it alone. Removing
          the device any other way (deleting it, or unracking it in the editor) keeps the
          empty shelf, just as the editor always has. Other rack accessories like blanking
          panels are still added in the editor.
        </li>
        <li>
          <strong>Work in batches</strong> — add many devices, make many
          connections, install many chassis cards, or mount many devices into racks,
          each in a single request. Each item is handled on its own: if one fails, the
          rest still go through, and the assistant gets back a per-item list of what
          succeeded and what didn't. Items are applied in order, so an earlier one can
          affect a later one (for example, filling a slot or a rack position the next
          item wanted). Undo works just like doing each action one at a time (so a
          batch takes a few presses of undo to fully reverse, not one).
        </li>
      </ul>

      <div
        className="border-l-4 border-amber-400 bg-amber-50 p-4 rounded-r my-4"
        role="note"
      >
        <strong>Security:</strong> the connection never leaves your computer, is
        off until you enable it, and requires the pairing token. If you self-host
        EasySchematic on a non-localhost address, set{" "}
        <code>EASYSCHEMATIC_MCP_ORIGINS</code> on the server to allow that origin.
      </div>
    </>
  );
}
