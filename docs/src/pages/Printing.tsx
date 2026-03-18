export default function PrintingPage() {
  return (
    <>
      <h1>Printing &amp; Title Block</h1>

      <p>
        EasySchematic has a full print workflow: page setup, a configurable title block, and multi-page PDF export.
      </p>

      <h2>Print View</h2>
      <p>
        Toggle <strong>Print View</strong> from the <strong>View</strong> menu or press <strong>F9</strong>. In Print View:
      </p>
      <ul>
        <li>Page boundaries appear as an overlay on the canvas</li>
        <li>Areas outside the canvas origin are dimmed</li>
        <li>Devices and connections within the page boundaries print as-is</li>
      </ul>

      <h2>Page setup</h2>
      <p>The Print View toolbar controls let you configure:</p>
      <ul>
        <li>
          <strong>Paper size</strong> — 11 options including Letter, Legal, Tabloid, ANSI C/D/E, and Arch A/B/C/D/E
        </li>
        <li><strong>Orientation</strong> — Landscape or Portrait</li>
        <li><strong>Scale</strong> — 0.25x to 2.0x, controlling how much of the canvas fits on each page</li>
      </ul>

      <h2>Show Info panel</h2>
      <p>
        Open the <strong>Show Info</strong> panel from the right sidebar to fill in project metadata. These fields
        populate the title block:
      </p>
      <ul>
        <li>Show / Project name</li>
        <li>Venue</li>
        <li>Designer</li>
        <li>Engineer</li>
        <li>Date</li>
        <li>Drawing title</li>
      </ul>

      <h2>Title Block</h2>
      <p>
        The title block appears at the bottom of each printed page. It has two configuration tabs:
      </p>

      <h3>Data tab</h3>
      <p>Edit the field values that appear in the title block, plus upload a <strong>logo</strong> (PNG or SVG).</p>

      <h3>Layout tab</h3>
      <p>
        An interactive grid editor for customizing the title block layout:
      </p>
      <ul>
        <li>Add or remove rows and columns</li>
        <li>Drag cell boundaries to resize</li>
        <li>Configure each cell's content type (text field, logo, static label)</li>
        <li>Set font size, weight, family, text alignment, and text color per cell</li>
        <li>Merge cells with row and column spans</li>
      </ul>

      <h2>PDF export</h2>
      <p>
        Open the <strong>Export</strong> menu in the menu bar, then choose <strong>Export PDF</strong> to generate a multi-page PDF
        document matching your Print View settings. Each page includes the title block.
      </p>
    </>
  );
}
