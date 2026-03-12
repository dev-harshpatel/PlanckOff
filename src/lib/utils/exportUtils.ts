/**
 * Export utilities — Excel (.xlsx) and PDF for the reports tabs.
 * Uses:
 *   - xlsx  (already in project) for Excel
 *   - jspdf + jspdf-autotable for PDF (client-side only, dynamic import)
 */

import * as XLSX from 'xlsx';

export interface ExportColumnDef {
  key: string;
  label: string;
  defaultEnabled: boolean;
  align?: 'left' | 'right' | 'center';
  /** Format applied in Excel/PDF cells */
  format?: 'currency' | 'number' | 'string';
}

export interface ExportRow {
  [key: string]: string | number | null | undefined;
}

export interface ExportConfig {
  /** Base filename (without extension) */
  filename: string;
  sheetName: string;
  columns: ExportColumnDef[];
  rows: ExportRow[];
}

// ─── Excel ────────────────────────────────────────────────────────────────────

export function exportToExcel(config: ExportConfig, enabledKeys: Set<string>): void {
  const cols = config.columns.filter((c) => enabledKeys.has(c.key));

  // Header row
  const header = cols.map((c) => c.label);

  // Data rows
  const data = config.rows.map((row) =>
    cols.map((c) => {
      const val = row[c.key];
      if (val == null) return '';
      return val;
    })
  );

  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);

  // Column widths — auto-fit to longest content
  const colWidths = cols.map((c, ci) => {
    const headerLen = c.label.length;
    const maxDataLen = data.reduce((max, row) => {
      const cell = String(row[ci] ?? '');
      return Math.max(max, cell.length);
    }, 0);
    return { wch: Math.max(headerLen, maxDataLen) + 2 };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, config.sheetName);
  XLSX.writeFile(wb, `${config.filename}.xlsx`);
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

export async function exportToPdf(config: ExportConfig, enabledKeys: Set<string>): Promise<void> {
  // Dynamic import to avoid SSR issues
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const cols = config.columns.filter((c) => enabledKeys.has(c.key));

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  // Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(config.sheetName, 40, 40);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text(`Exported: ${new Date().toLocaleDateString()}  •  ${config.rows.length} rows`, 40, 56);
  doc.setTextColor(0);

  const head = [cols.map((c) => c.label)];
  const body = config.rows.map((row) =>
    cols.map((c) => {
      const val = row[c.key];
      if (val == null) return '';
      return String(val);
    })
  );

  const colStyles: Record<number, { halign: 'left' | 'right' | 'center' }> = {};
  cols.forEach((c, i) => {
    colStyles[i] = { halign: c.align ?? 'left' };
  });

  autoTable(doc, {
    head,
    body,
    startY: 70,
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 3, right: 5, bottom: 3, left: 5 },
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [71, 85, 105],
      fontStyle: 'bold',
      fontSize: 7,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: colStyles,
    margin: { left: 40, right: 40 },
  });

  doc.save(`${config.filename}.pdf`);
}
