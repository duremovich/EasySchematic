# Edge Routing Aesthetic Rules

These are the aesthetic rules that the A* edge routing system must always satisfy.
They are ordered by priority — earlier rules take precedence over later ones.
When fixing routing bugs or adding features, verify all rules still hold.

---

## Hard Constraints (never violate)

### R1. Never cross through a device node
Edges must route around device obstacle rects (node bounds + PAD padding).
Room and Note nodes are not obstacles.

### R2. Always connect to handles horizontally
The final segment arriving at both source and target handles must be horizontal — never vertical. An edge exits a source handle going RIGHT and enters a target handle going LEFT (or RIGHT for wrap-arounds). The A* goal test must reject vertical arrivals.

### R3. Maintain orthogonal paths
Every segment of every edge must be either perfectly horizontal or perfectly vertical. No diagonal segments. This must hold after all offsets and jog insertions.

### R4. Horizontal stub at each end
Every edge begins with a horizontal stub (minimum STUB=30px) exiting the source handle to the right, and ends with a horizontal stub entering the target handle from the left. These stubs prevent edges from turning immediately at the handle.

---

## Separation Rules (prevent overlap)

### R5. Parallel edges must not share vertical segments
Edges whose midpoints (centerX) are close together (within CX_THRESHOLD=15px) are grouped. Within a group, each edge gets an X-offset (`overlapOffset`) applied to interior waypoints, spreading their vertical segments apart. Gap: EDGE_GAP=12px per edge.

### R6. Parallel edges must not share horizontal segments
Same overlap groups as R5. The `overlapOffset` is also applied as a Y-shift to interior waypoints (excluding the first/last stub points), with jog segments at the stubs to maintain orthogonality (R3). This separates wrap-around edges that would otherwise share the same horizontal corridor.

### R7. Sibling edges from the same device get spread stubs
Edges sharing the same source device get a per-edge `stubSpread` (STUB_GAP=6px) that pushes their stub lengths apart, preventing their initial vertical segments from overlapping.

---

## Aesthetic Preferences (soft, enforced via A* cost)

### R8. Minimize turns
The A* applies a TURN_PENALTY=100 for each direction change. Fewer turns = cleaner paths. A straight 2-turn path is strongly preferred over a wiggly 6-turn path, even if the 6-turn path is shorter in distance.

### R9. Prefer shorter paths (after turn count)
Among paths with the same number of turns, prefer the one with less total Manhattan distance. This is the base A* heuristic behavior.

### R10. Edges should stay close to their source/target Y levels
Edges should not detour far from their natural Y corridor when a closer path exists with the same turn count. (Currently emergent from Manhattan distance preference, not explicitly penalized.)

### R11. Different signal types should have extra separation
When edges of different signal types run in parallel corridors, the proximity threshold doubles from SEPARATION_PX (10px) to CROSS_TYPE_SEPARATION (20px). This visually groups same-type edges together and adds breathing room between signal type groups (e.g., an ethernet column vs an SDI column). Penalty zones are tagged with their source edge's signal type; the A* uses wider exclusion and wider grid lines only for cross-type zones. Same-type routing is identical to pre-R11 behavior.

---

## Architecture Notes

### How routing works (the pipeline)

1. **OffsetEdge.tsx** computes `overlapOffset` (R5/R6) and `stubOffset` (R7) from the store.
2. **computeEdgePath()** in pathfinding.ts:
   a. Short-circuit: aligned handles with clear path → straight line (no stubs/offset)
   b. Compute stub positions (sourceX + STUB + stubSpread, targetX - STUB - stubSpread)
   c. Build sparse grid from obstacle boundaries
   d. Run A* from source stub to target stub (direction-aware, starts RIGHT, must arrive HORIZONTAL)
   e. Assemble waypoints: source handle → stub → jog to offset Y → A* interior (shifted X+Y) → jog back → stub → target handle
   f. Simplify collinear points, generate SVG path with rounded corners

### What each offset does
- **overlapOffset (X+Y)**: Separates parallel edges in the middle of their paths. Applied to interior waypoints. X-shift separates vertical segments, Y-shift separates horizontal segments.
- **stubSpread (X only)**: Separates the initial/final stubs of edges leaving the same device. Applied to stub length calculation.

### Key constants
| Constant | Value | Purpose |
|---|---|---|
| PAD | 20 | Obstacle padding around device nodes |
| GAP | 8 | Routing channel width outside obstacles |
| STUB | 30 | Minimum horizontal stub length at handles |
| TURN_PENALTY | 100 | A* cost for each direction change |
| CORNER_RADIUS | 8 | Rounded corner radius in SVG path |
| ESCAPE_MARGIN | 40 | Grid expansion beyond bounding box |
| EDGE_GAP | 12 | Spacing between parallel edges (overlap offset) |
| STUB_GAP | 6 | Spacing between sibling stubs |
| CX_THRESHOLD | 15 | Max centerX difference for overlap grouping |
| Y_GAP_THRESHOLD | 50 | Max Y gap for overlap grouping neighbors |
| GRID_SIZE | 20 | Canvas snap grid (node positions, port heights) |

### Grid alignment invariants
- Node positions snap to GRID_SIZE (20px)
- Device header: 40px (2 grid units)
- Port rows: 20px (1 grid unit)
- Handle Y = nodeY + 40 + (portIndex * 20) + 10
- Two ports at the same index on grid-aligned nodes share the same Y → straight horizontal connection possible
