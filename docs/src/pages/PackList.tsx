export default function PackListPage() {
  return (
    <>
      <h1>Pack List &amp; Reports</h1>

      <p>
        The <strong>Pack List</strong> generates a bill of materials from your schematic — a summary of every device
        and cable you need. Open it from the <strong>Reports</strong> menu in the menu bar.
      </p>

      <h2>Browsing the pack list</h2>
      <p>
        The pack list dialog has two tabs:
      </p>
      <ul>
        <li><strong>Devices</strong> — every device in your schematic with quantity, model, type, and room</li>
        <li><strong>Cables</strong> — cable counts summarized by cable type, signal type, and route</li>
      </ul>
      <p>
        Both tabs support a <strong>Group by</strong> toggle — group devices by room, or cables by signal path.
        When grouping is off, identical items are merged into a single row with a combined count.
      </p>

      <h2>CSV export</h2>
      <p>
        Click <strong>CSV</strong> to download a spreadsheet-friendly file with both device and cable tables.
        Open it in Excel, Google Sheets, or any spreadsheet tool.
      </p>

      <h2>PDF export &amp; print preview</h2>
      <p>
        Click <strong>PDF</strong> to open the print preview. This is a full report layout editor — what you see
        in the preview is what the exported PDF will look like.
      </p>

      <h3>Page setup</h3>
      <ul>
        <li><strong>Paper size</strong> — Letter, Legal, A4, or Tabloid</li>
        <li><strong>Orientation</strong> — Portrait or Landscape</li>
      </ul>

      <h3>Header &amp; footer</h3>
      <p>
        The header and footer are interactive grid editors, just like the title block editor.
        Click a cell in the preview to select it, then use the sidebar to change its content.
      </p>
      <p>Each cell can display:</p>
      <ul>
        <li><strong>Field</strong> — a value from your show info (show name, venue, designer, date, etc.)</li>
        <li><strong>Static text</strong> — any custom text (e.g., "Pack List")</li>
        <li><strong>Logo</strong> — your uploaded logo image</li>
        <li><strong>Page number</strong> — auto-filled "Page X of Y"</li>
      </ul>
      <p>
        Right-click cells for more options: insert or delete rows and columns, merge cells,
        or change cell content type. Drag the borders between cells to resize columns and rows.
      </p>

      <h3>Table columns</h3>
      <p>
        The sidebar has checkboxes for each column in each table. Uncheck a column to hide it
        from the report. Drag the borders between column headers in the preview to resize columns.
      </p>

      <h3>Grouping</h3>
      <p>
        Each table has a <strong>Group by</strong> dropdown. Devices can be grouped by room,
        and cables can be grouped by signal path. Group headers appear as shaded rows in the report.
      </p>

      <h3>Sorting</h3>
      <p>
        Each table has a <strong>Sort by</strong> dropdown — pick any visible column to sort by,
        then toggle ascending/descending with the arrow button.
      </p>

      <h3>Multi-page preview</h3>
      <p>
        When your data spans multiple pages, use the <strong>page navigation arrows</strong> in the
        toolbar to preview each page. The preview respects page margins and shows accurate page breaks.
        When a table continues on the next page, column headers are repeated with
        a "(Cont'd)" label.
      </p>

      <h3>Zoom</h3>
      <p>
        Use the <strong>+</strong> / <strong>&minus;</strong> buttons or <strong>Reset</strong> in
        the toolbar to zoom the preview in or out.
      </p>

      <h2>Saving your layout</h2>
      <p>
        All report layout preferences — paper size, orientation, header/footer layout, column visibility,
        grouping, and sorting — are saved with your schematic file. When you export and re-import a
        schematic, your pack list layout comes with it.
      </p>
    </>
  );
}
