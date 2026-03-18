export default function ApiPage() {
  return (
    <>
      <h1>Public API</h1>

      <p>
        The device database at <code>api.easyschematic.live</code> exposes public read-only endpoints.
        No authentication required. Responses are JSON, cached for 5 minutes.
      </p>
      <p>
        This data is free to use. If you're building AV tooling and need a structured database of professional
        video/audio equipment with port definitions, signal types, and connector types, help yourself.
      </p>

      <h2>Endpoints</h2>

      <h3>GET /templates</h3>
      <p>Returns all device templates.</p>
      <pre><code>GET https://api.easyschematic.live/templates</code></pre>
      <p>Each template includes:</p>
      <ul>
        <li><code>id</code> — unique template ID</li>
        <li><code>version</code> — incremented on each edit</li>
        <li><code>label</code> — display name (e.g. "BMD SDI→HDMI")</li>
        <li><code>deviceType</code> — category (e.g. "converter", "camera", "audio-mixer")</li>
        <li><code>manufacturer</code> — brand name (optional)</li>
        <li><code>modelNumber</code> — model identifier (optional)</li>
        <li><code>referenceUrl</code> — manufacturer product page URL (optional)</li>
        <li><code>color</code> — hex color for the device (optional)</li>
        <li><code>searchTerms</code> — array of search keywords (optional)</li>
        <li><code>ports</code> — array of port objects (see below)</li>
      </ul>

      <h4>Port object</h4>
      <ul>
        <li><code>id</code> — unique port ID within the template</li>
        <li><code>label</code> — display name (e.g. "SDI In 1")</li>
        <li><code>signalType</code> — one of: <code>sdi</code>, <code>hdmi</code>, <code>ndi</code>, <code>dante</code>,
          {" "}<code>analog-audio</code>, <code>aes</code>, <code>dmx</code>, <code>madi</code>, <code>usb</code>, <code>ethernet</code>, <code>fiber</code>,
          {" "}<code>displayport</code>, <code>hdbaset</code>, <code>srt</code>, <code>genlock</code>, <code>gpio</code>,
          {" "}<code>rs422</code>, <code>serial</code>, <code>thunderbolt</code>, <code>composite</code>, <code>vga</code>,
          {" "}<code>power</code>, <code>custom</code></li>
        <li><code>direction</code> — <code>input</code>, <code>output</code>, or <code>bidirectional</code></li>
        <li><code>connectorType</code> — physical connector (e.g. <code>bnc</code>, <code>hdmi</code>, <code>xlr-3</code>,
          {" "}<code>rj45</code>, <code>usb-c</code>) (optional)</li>
        <li><code>section</code> — port group label (optional)</li>
      </ul>

      <h3>GET /templates/:id</h3>
      <p>Returns a single template by ID, including contributor attribution.</p>
      <pre><code>GET https://api.easyschematic.live/templates/c0a80101-0006-4000-8000-000000000006</code></pre>
      <p>
        In addition to the standard template fields, this endpoint includes <code>submittedBy</code> and{" "}
        <code>lastEditedBy</code> objects (each with a <code>name</code> field) when the template was contributed
        or edited by a community member.
      </p>

      <h3>GET /templates/device-types</h3>
      <p>Returns a sorted array of all distinct <code>deviceType</code> values currently in the database.</p>
      <pre><code>GET https://api.easyschematic.live/templates/device-types</code></pre>
      <pre><code>["adapter", "audio-embedder", "audio-interface", "av-over-ip", "camera", ...]</code></pre>

      <h3>GET /templates/search-terms</h3>
      <p>Returns a sorted array of all search terms across all templates (lowercase, deduplicated).</p>
      <pre><code>GET https://api.easyschematic.live/templates/search-terms</code></pre>
      <pre><code>["3g", "8x8", "aja", "blackmagic", "bolt", "capture", ...]</code></pre>

      <h3>GET /contributors</h3>
      <p>Returns the top 50 community contributors ranked by approved submission count.</p>
      <pre><code>GET https://api.easyschematic.live/contributors</code></pre>
      <p>Each entry includes <code>id</code>, <code>name</code> (display name or anonymized email), and <code>approvedCount</code>.</p>

      <h2>Authentication</h2>
      <p>
        Write operations (submitting devices, moderation, admin) require session-based authentication via magic link
        email. These endpoints are not documented here as they are intended for use through the{" "}
        <a href="https://devices.easyschematic.live" target="_blank" rel="noopener noreferrer">devices site</a> UI.
      </p>

      <h2>Rate limits</h2>
      <p>
        Read endpoints are not rate-limited beyond standard Cloudflare protections. Responses include{" "}
        <code>Cache-Control</code> headers — please respect them to avoid unnecessary load.
      </p>
    </>
  );
}
