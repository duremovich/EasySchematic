export default function SelfHostingPage() {
  return (
    <>
      <h1>Self-Hosting</h1>

      <p>
        EasySchematic can be self-hosted using Docker. Two compose profiles are
        available: a <strong>production</strong> image that builds the frontend
        and serves it with nginx, and a <strong>development</strong> image that
        clones the repo at container start and runs the Vite dev server with hot
        reload. All offline canvas features work the same as the hosted version
        at <a href="https://easyschematic.live">easyschematic.live</a>.
      </p>

      <div
        className="border-l-4 border-blue-400 bg-blue-50 p-4 rounded-r my-4"
        role="note"
      >
        <strong>Note:</strong> Cloud features — save to cloud, device
        submissions, shared links — communicate with the hosted API at{" "}
        <code>api.easyschematic.live</code>. The API runs on Cloudflare Workers
        and is not included in the Docker image. No account or API key is
        required for read-only access (browsing the device library, loading
        shared schematics).
      </div>

      <h2>Production (nginx)</h2>

      <p>
        Builds the app inside the image and serves static files on port{" "}
        <strong>8080</strong>.
      </p>

      <pre>
        <code>{`git clone https://github.com/duremovich/EasySchematic.git
cd EasySchematic
docker compose up -d`}</code>
      </pre>

      <p>
        Open <a href="http://localhost:8080">http://localhost:8080</a> in your
        browser. The first build takes a few minutes while npm installs
        dependencies and Vite bundles the app.
      </p>

      <h3>Production commands</h3>

      <table>
        <thead>
          <tr>
            <th>Command</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>make build</code>
            </td>
            <td>Build the Docker image</td>
          </tr>
          <tr>
            <td>
              <code>make up</code>
            </td>
            <td>Start the container (port 8080)</td>
          </tr>
          <tr>
            <td>
              <code>make down</code>
            </td>
            <td>Stop the container</td>
          </tr>
          <tr>
            <td>
              <code>make restart</code>
            </td>
            <td>Restart the container</td>
          </tr>
          <tr>
            <td>
              <code>make logs</code>
            </td>
            <td>Tail container logs</td>
          </tr>
          <tr>
            <td>
              <code>make build-clean</code>
            </td>
            <td>Rebuild with no cache</td>
          </tr>
        </tbody>
      </table>

      <p>
        Or use <code>docker compose</code> directly — the makefile is a
        convenience wrapper around <code>compose.yml</code>.
      </p>

      <h2>Development (Vite, pull at runtime)</h2>

      <p>
        The dev profile uses <code>compose.dev.yml</code> and{" "}
        <code>docker/Dockerfile.dev</code>. On each start the container shallow-clones
        the GitHub repository into a named Docker volume, runs{" "}
        <code>npm ci</code>, and starts Vite on port <strong>3000</strong>. The
        clone persists between restarts, so later starts only fetch the latest
        commit and reinstall dependencies if the lockfile changed.
      </p>

      <pre>
        <code>{`git clone https://github.com/duremovich/EasySchematic.git
cd EasySchematic
make dev`}</code>
      </pre>

      <p>
        Open <a href="http://localhost:3000">http://localhost:3000</a>. The
        first start takes about 30–60 seconds (clone + install). Subsequent
        starts are faster (pull + verify).
      </p>

      <p>
        You only need the compose files and <code>docker/</code> directory on
        your machine; the application source lives inside the container volume.
        To point at a different branch or fork, set{" "}
        <code>REPO_URL</code> and <code>BRANCH</code> in{" "}
        <code>compose.dev.yml</code> or override them in your shell before
        running <code>make dev</code>.
      </p>

      <h3>Development commands</h3>

      <table>
        <thead>
          <tr>
            <th>Command</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>make dev</code>
            </td>
            <td>Clone or pull the repo and start the Vite dev server (foreground)</td>
          </tr>
          <tr>
            <td>
              <code>make dev-detach</code>
            </td>
            <td>Same as <code>make dev</code>, but run in the background</td>
          </tr>
          <tr>
            <td>
              <code>make dev-down</code>
            </td>
            <td>Stop the dev container</td>
          </tr>
          <tr>
            <td>
              <code>make dev-logs</code>
            </td>
            <td>Tail dev container logs</td>
          </tr>
          <tr>
            <td>
              <code>make dev-update</code>
            </td>
            <td>Restart the dev container (re-runs pull and <code>npm ci</code>)</td>
          </tr>
        </tbody>
      </table>

      <p>
        Equivalent compose invocation:
      </p>

      <pre>
        <code>docker compose -f compose.yml -f compose.dev.yml up</code>
      </pre>

      <p>
        To wipe the cloned source and start fresh from GitHub:
      </p>

      <pre>
        <code>{`docker compose -f compose.yml -f compose.dev.yml down -v
make dev`}</code>
      </pre>

      <h2>Configuring the API with <code>.env</code></h2>

      <p>
        By default the app talks to the hosted API at{" "}
        <code>https://api.easyschematic.live</code>. For the dev container you
        can override this with a <code>.env</code> file in the repository root
        (the same directory as <code>compose.yml</code>). The file is listed in{" "}
        <code>.gitignore</code> and is never committed.
      </p>

      <ol>
        <li>
          In the cloned EasySchematic directory, create a file named{" "}
          <code>.env</code>.
        </li>
        <li>
          Add the API URL Vite should use. Only variables prefixed with{" "}
          <code>VITE_</code> are exposed to the browser bundle.
        </li>
        <li>
          Start or restart the dev container so it picks up the new values (
          <code>make dev</code> or <code>make dev-update</code>).
        </li>
      </ol>

      <p>Example — use the hosted API (explicit default):</p>

      <pre>
        <code>VITE_TEMPLATE_API_URL=https://api.easyschematic.live</code>
      </pre>

      <p>Example — point at a local API (e.g. Wrangler on port 8787):</p>

      <pre>
        <code>VITE_TEMPLATE_API_URL=http://localhost:8787</code>
      </pre>

      <p>
        If you omit <code>.env</code>, the dev server uses the same default as a
        production build. Cloud login, saves, and templates against the hosted
        API work from <code>localhost:3000</code> because that origin is already
        allowed by the API CORS policy.
      </p>

      <p>
        The production nginx container does not read <code>.env</code> at
        runtime; the API URL is baked in at build time. To change it for
        production self-hosting you would need to pass{" "}
        <code>VITE_TEMPLATE_API_URL</code> as a build argument when building the
        image, or rebuild after setting it in the environment used by{" "}
        <code>npm run build</code>.
      </p>

      <h2>Changing the port</h2>

      <p>
        <strong>Production:</strong> edit <code>compose.yml</code> and change
        the host port (the first number):
      </p>

      <pre>
        <code>{`ports:
  - "3000:80"  # now available at localhost:3000`}</code>
      </pre>

      <p>
        <strong>Development:</strong> edit <code>compose.dev.yml</code> and
        change both sides of the mapping, and pass the same port to Vite in{" "}
        <code>docker/entrypoint-dev.sh</code> if you change the container port.
      </p>

      <h2>Reverse proxy</h2>

      <p>
        To serve EasySchematic behind a reverse proxy (nginx, Caddy, Traefik),
        point the proxy at the container port. For the production container, a
        simple HTTP proxy is sufficient since it serves static files only. For
        the dev server, the proxy must support WebSocket upgrades if you use
        Vite hot module replacement through the proxy.
      </p>

      <p>Example Caddy config (production on port 8080):</p>

      <pre>
        <code>{`easyschematic.example.com {
    reverse_proxy localhost:8080
}`}</code>
      </pre>

      <h2>What works offline</h2>

      <table>
        <thead>
          <tr>
            <th>Feature</th>
            <th>Works in Docker</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Canvas editing, device placement, connections</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Bundled offline device templates (~780)</td>
            <td>
              Yes (bundled at build time; live community library still loads
              when the hosted API is reachable)
            </td>
          </tr>
          <tr>
            <td>Export (PNG, SVG, DXF, PDF, JSON)</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Import (JSON, CSV cable schedule)</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Pack list, cable schedule, reports</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Auto-save to browser localStorage</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Print with title block</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Save to cloud</td>
            <td>Requires account (uses hosted API)</td>
          </tr>
          <tr>
            <td>Device submissions</td>
            <td>Requires account (uses hosted API)</td>
          </tr>
          <tr>
            <td>Shared links</td>
            <td>Requires hosted API</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
