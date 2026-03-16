import RoutingDemo from "../components/demos/RoutingDemo";

export default function EdgeRoutingPage() {
  return (
    <>
      <h1>Connection Routing</h1>

      <h2>Smart routing</h2>
      <p>
        EasySchematic uses an <strong>A* pathfinding algorithm</strong> to route connections around
        devices. Instead of simple straight lines or basic smooth-step paths, connections find intelligent paths that:
      </p>
      <ul>
        <li><strong>Avoid overlapping</strong> with devices</li>
        <li><strong>Nest parallel connections</strong> when multiple connections run between the same pair of devices</li>
        <li><strong>Minimize crossings</strong> with other connections</li>
        <li>
          <strong>Use orthogonal paths</strong> (horizontal and vertical segments only) for a clean, professional look
        </li>
      </ul>

      <h2>See it in action</h2>
      <p>Drag the devices around and watch the connections re-route in real time:</p>
      <RoutingDemo />

      <h2>How it works</h2>
      <ol>
        <li>
          <strong>Obstacle map</strong> — All devices are converted into rectangular obstacle zones with padding
          for port stubs
        </li>
        <li>
          <strong>A* pathfinding</strong> — Each connection runs A* from its source port to its target port, avoiding
          obstacles
        </li>
        <li>
          <strong>Parallel connection nesting</strong> — Connections sharing endpoints are grouped and offset so they nest
          without overlapping
        </li>
        <li>
          <strong>Iterative refinement</strong> — Routes are computed centrally so all connections are aware of each other
        </li>
      </ol>

      <h3>Routing priorities</h3>
      <p>The algorithm optimizes for these aesthetics (in order):</p>
      <ol>
        <li>No connection-through-device collisions</li>
        <li>Minimal total path length</li>
        <li>Minimal number of turns</li>
        <li>Parallel connections nest cleanly (outermost connection has the widest span)</li>
        <li>Consistent horizontal flow (left-to-right preference)</li>
      </ol>

      <h2>Manual routing</h2>
      <p>
        Sometimes the auto-router doesn't produce the exact path you want. You can override
        routing on any connection by adding <strong>manual handles</strong> — waypoints that the
        connection must pass through.
      </p>

      <h3>Adding a handle</h3>
      <ol>
        <li><strong>Right-click</strong> on any connection to open the context menu</li>
        <li>Select <strong>Add Handle</strong></li>
        <li>A handle appears on the connection at the click position</li>
      </ol>
      <p>
        The connection is re-routed using A* pathfinding between each pair of handles,
        so it still avoids devices and maintains smooth orthogonal turns — it just passes
        through your chosen points along the way.
      </p>

      <h3>Moving handles</h3>
      <p>
        Click the connection to select it, then <strong>drag any handle</strong> to reposition it.
        Handles snap to the 20px grid (the same grid devices snap to), so connections align
        cleanly with ports.
      </p>

      <h3>Removing handles</h3>
      <p>
        Right-click near an existing handle and select <strong>Remove Handle</strong> to delete it.
        The connection re-routes automatically around the remaining handles (or fully
        auto-routes if no handles remain).
      </p>

      <h3>Resetting to auto-routing</h3>
      <p>
        Right-click a manually-routed connection and select <strong>Reset Route</strong> to remove
        all handles and return the connection to fully automatic routing.
      </p>

      <h3>How manual routing interacts with auto-routing</h3>
      <ul>
        <li>
          <strong>Manual connections route first</strong> — they get priority over auto-routed
          connections when claiming corridors
        </li>
        <li>
          <strong>Other connections yield</strong> — auto-routed connections see the manual
          connection's path and route around it
        </li>
        <li>
          <strong>A* still works</strong> — each leg between handles uses full A* pathfinding
          with obstacle avoidance, just constrained to pass through your handles
        </li>
        <li>
          <strong>Undo/redo</strong> — all handle operations are undoable with Ctrl+Z
        </li>
      </ul>

      <h2>Performance</h2>
      <p>
        Routes are recomputed when devices move or connections change, but <strong>frozen during drag</strong> for
        smooth interaction. A small delay after drag-stop lets the canvas measure port positions before routing
        kicks in.
      </p>

      <h2>Debug mode</h2>
      <p>
        Press <strong>Ctrl+B</strong> to toggle debug connection overlay, which shows connection IDs and routing metadata at
        both endpoints of each connection.
      </p>
    </>
  );
}
