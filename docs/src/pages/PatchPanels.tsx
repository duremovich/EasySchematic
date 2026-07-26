export default function PatchPanelsPage() {
  return (
    <>
      <h1>Patch Panels &amp; the Patch Bay</h1>

      <p>
        In a real installation a cable rarely runs straight from device to device — it lands on a
        patch panel, crosses a patch lead, and continues to its destination. The <strong>Patch Bay </strong>
        page lets you document that path <em>without</em> drawing the panel into your schematic: the
        drawing stays a clean single-line diagram, while the Patch Bay tracks exactly which panel
        port every cable lands on.
      </p>

      <h2>Adding the Patch Bay page</h2>
      <p>
        Click the <strong>🔌+</strong> button in the page tab bar (next to the rack and print sheet
        buttons). The Patch Bay is a single project-wide page — it shows every patch panel in the
        project, whether the panel is placed on the schematic or is <em>virtual</em>.
      </p>

      <h2>Virtual panels</h2>
      <p>
        Use <strong>+ Add panel</strong> in the Patch Bay sidebar to create a <strong>virtual panel </strong>
        from the device library. Virtual panels never appear on the schematic and never affect
        connection routing, but they are real project devices: they show up in the pack list, the
        patch panel schedule, and can be placed in rack elevations. You can convert a virtual panel
        to an on-schematic device (and back) from the sidebar — converting to virtual is only
        possible while the panel has no drawn connections.
      </p>

      <h2>Patching a connection</h2>
      <p>
        Two ways to route a connection through a panel port:
      </p>
      <ul>
        <li>
          On the Patch Bay page, find the connection in the sidebar cable list and click
          <strong> Patch…</strong> — open ports light up; click one to assign. Click a port on a
          second panel to add another hop (device → panel → panel → device), then press
          <strong> Done</strong> or <kbd>Esc</kbd>.
        </li>
        <li>
          On the schematic, right-click any connection and choose <strong>Patch via Panel…</strong> —
          you'll land on the Patch Bay with assign mode already active.
        </li>
      </ul>
      <p>
        <strong>Unpatch</strong> (sidebar) removes all hops from a connection. Deleting a panel
        removes its assignments but never deletes the connections themselves.
      </p>

      <h2>Cable numbering: one signal, several physical cables</h2>
      <p>
        A patched connection is one signal but two or three physical cables, and reports treat it
        that way. Each segment inherits the connection's cable ID with a letter suffix:
        <code> E001</code> becomes <code>E001-A</code> (device → panel), <code>E001-B</code> (panel →
        panel or panel → device), and so on. The schematic keeps showing the base ID.
      </p>
      <p>
        Double-click any segment chip in the Patch Bay to <strong>override its label</strong> (marked
        with ✏️) — useful when the tie lines have their own numbering scheme. Overrides flow through
        every report.
      </p>

      <h2>Reading the panel view</h2>
      <p>
        Each panel renders as a front face with one jack per port. Under every occupied port two
        chips show the circuit: <strong>◀</strong> the cable arriving at the rear (field) side and
        <strong> ▶</strong> the cable leaving the front (patch) side, each with its cable ID and
        far-end device. Hovering any chip, jack, or sidebar cable row highlights the whole circuit
        across every panel it passes through. Ports wired by drawing connections to an on-schematic
        panel appear too, read-only — manage those on the canvas.
      </p>

      <h2>Printing</h2>
      <ul>
        <li>
          <strong>Print strips (PDF)</strong> — designation strips at 100% physical scale, sized to
          the 19″ rack opening (450.85&nbsp;mm). Strips wider than the page are split into runs with
          cut marks: print at 100% (no fit-to-page), cut, join, and slide into the panel's label
          holder. Each port shows its incoming source over its outgoing destination.
        </li>
        <li>
          <strong>Schedule report…</strong> — opens the Patch Panel Schedule: one row per port with
          rear/front cable IDs, remote devices, rooms, and lengths. Patched (virtual) assignments and
          physically drawn connections appear side by side, with the same cable numbers as the
          schematic. Export to CSV or PDF from the Reports dialog.
        </li>
      </ul>

      <h2>Good to know</h2>
      <ul>
        <li>Copy/pasting a patched connection pastes it <em>unpatched</em> — two cables can't share one physical port.</li>
        <li>
          A connection can only be patched through a port whose connector actually mates with it —
          an SDI run on BNC won't land in an RJ45 panel. Signal type isn't checked, since a panel is
          signal-agnostic conduit: running AES3 through an analog XLR panel is fine.
        </li>
        <li>Estimated lengths (from room distances) apply to whole runs, not per-segment; enter segment lengths via the label override editor or the cable schedule.</li>
        <li>Audio patchbay normalling (full/half-normal) isn't modeled yet — the schedule reports it as "None".</li>
      </ul>
    </>
  );
}
