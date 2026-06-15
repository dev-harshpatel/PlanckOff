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
  summaryRows?: ExportRow[];
}

export type ExportFormat = 'excel' | 'pdf';

type ExportWorkerRequest = {
  id: number;
  format: ExportFormat;
  enabledKeys: string[];
  config: ExportConfig;
};

type ExportWorkerResponse =
  | {
      id: number;
      ok: true;
      filename: string;
      mimeType: string;
      buffer: ArrayBuffer;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

const getEnabledColumns = (config: ExportConfig, enabledKeys: Set<string>): ExportColumnDef[] =>
  config.columns.filter((c) => enabledKeys.has(c.key));

const buildExportMatrix = (rows: ExportRow[], columns: ExportColumnDef[]): (string | number)[][] =>
  rows.map((row) =>
    columns.map((column) => {
      const val = row[column.key];
      if (val == null) return '';
      return val;
    }),
  );

let exportWorker: Worker | null = null;
let exportRequestId = 0;

const downloadBuffer = (buffer: ArrayBuffer, filename: string, mimeType: string) => {
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const getExportWorker = (): Worker | null => {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }

  if (!exportWorker) {
    exportWorker = new Worker(
      new URL('@/workers/reportExport.worker.ts', import.meta.url),
      { type: 'module' },
    );
  }

  return exportWorker;
};

const runExportInWorker = async (
  config: ExportConfig,
  enabledKeys: Set<string>,
  format: ExportFormat,
): Promise<boolean> => {
  const worker = getExportWorker();
  if (!worker) return false;

  const requestId = ++exportRequestId;

  return new Promise<boolean>((resolve, reject) => {
    const handleMessage = (event: MessageEvent<ExportWorkerResponse>) => {
      if (event.data.id !== requestId) return;

      cleanup();

      if (!event.data.ok) {
        reject(new Error(event.data.error));
        return;
      }

      downloadBuffer(event.data.buffer, event.data.filename, event.data.mimeType);
      resolve(true);
    };

    const handleError = () => {
      cleanup();
      reject(new Error('Export worker failed to generate the file.'));
    };

    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    const request: ExportWorkerRequest = {
      id: requestId,
      format,
      enabledKeys: Array.from(enabledKeys),
      config,
    };

    worker.postMessage(request);
  });
};

const buildExcelSheet = (config: ExportConfig, enabledKeys: Set<string>) => {
  const cols = getEnabledColumns(config, enabledKeys);
  const data = buildExportMatrix(config.rows, cols);
  const summaryData = buildExportMatrix(config.summaryRows ?? [], cols);
  const worksheetRows = [
    cols.map((c) => c.label),
    ...data,
    ...(summaryData.length > 0 ? [new Array(cols.length).fill('')] : []),
    ...summaryData,
  ];
  const ws = XLSX.utils.aoa_to_sheet(worksheetRows);

  ws['!cols'] = cols.map((c, ci) => {
    const headerLen = c.label.length;
    const maxDataLen = [...data, ...summaryData].reduce((max, row) => {
      const cell = String(row[ci] ?? '');
      return Math.max(max, cell.length);
    }, 0);
    return { wch: Math.max(headerLen, maxDataLen) + 2 };
  });

  return { cols, ws };
};

// ─── Excel ────────────────────────────────────────────────────────────────────

export async function exportToExcel(config: ExportConfig, enabledKeys: Set<string>): Promise<void> {
  try {
    const usedWorker = await runExportInWorker(config, enabledKeys, 'excel');
    if (usedWorker) return;
  } catch {
    // Fallback to synchronous generation below.
  }

  const { ws } = buildExcelSheet(config, enabledKeys);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, config.sheetName);
  XLSX.writeFile(wb, `${config.filename}.xlsx`);
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

export async function exportToPdf(config: ExportConfig, enabledKeys: Set<string>): Promise<void> {
  try {
    const usedWorker = await runExportInWorker(config, enabledKeys, 'pdf');
    if (usedWorker) return;
  } catch {
    // Fallback to synchronous generation below.
  }

  // Dynamic import to avoid SSR issues
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const cols = getEnabledColumns(config, enabledKeys);

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
  const body = buildExportMatrix(config.rows, cols).map((row) => row.map((value) => String(value)));
  const summaryBody = buildExportMatrix(config.summaryRows ?? [], cols).map((row) =>
    row.map((value) => String(value)),
  );
  const rowsBeforeSummary = body.length;
  const pdfBody = [
    ...body,
    ...(summaryBody.length > 0 ? [new Array(cols.length).fill('')] : []),
    ...summaryBody,
  ];

  const colStyles: Record<number, { halign: 'left' | 'right' | 'center' }> = {};
  cols.forEach((c, i) => {
    colStyles[i] = { halign: c.align ?? 'left' };
  });

  autoTable(doc, {
    head,
    body: pdfBody,
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
    didParseCell: ({ row, cell, section }) => {
      if (section !== 'body' || summaryBody.length === 0) return;
      if (row.index <= rowsBeforeSummary) return;

      cell.styles.fontStyle = 'bold';
      cell.styles.fillColor = [240, 253, 244];
      cell.styles.textColor = [22, 101, 52];
    },
  });

  doc.save(`${config.filename}.pdf`);
}
