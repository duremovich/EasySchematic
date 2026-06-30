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
          <strong>Read</strong> — view the schematic, list devices, inspect one
          device, and search the device library.
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
          <strong>Delete a device.</strong>
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
