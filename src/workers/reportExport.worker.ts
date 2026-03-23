/// <reference lib="webworker" />

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ExportColumnDef, ExportConfig, ExportFormat, ExportRow } from '@/lib/utils/exportUtils';

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

const getEnabledColumns = (config: ExportConfig, enabledKeys: string[]): ExportColumnDef[] =>
  config.columns.filter((column) => enabledKeys.includes(column.key));

const buildExportMatrix = (rows: ExportRow[], columns: ExportColumnDef[]): (string | number)[][] =>
  rows.map((row) =>
    columns.map((column) => {
      const value = row[column.key];
      if (value == null) return '';
      return value;
    }),
  );

const buildWorksheetRows = (
  rows: ExportRow[],
  summaryRows: ExportRow[] | undefined,
  columns: ExportColumnDef[],
) => {
  const data = buildExportMatrix(rows, columns);
  const summaryData = buildExportMatrix(summaryRows ?? [], columns);

  return {
    data,
    summaryData,
    worksheetRows: [
      columns.map((column) => column.label),
      ...data,
      ...(summaryData.length > 0 ? [new Array(columns.length).fill('')] : []),
      ...summaryData,
    ],
  };
};

const buildExcelBuffer = (config: ExportConfig, enabledKeys: string[]): ArrayBuffer => {
  const columns = getEnabledColumns(config, enabledKeys);
  const { data, summaryData, worksheetRows } = buildWorksheetRows(
    config.rows,
    config.summaryRows,
    columns,
  );
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetRows);

  worksheet['!cols'] = columns.map((column, columnIndex) => {
    const headerLen = column.label.length;
    const maxDataLen = [...data, ...summaryData].reduce((max, row) => {
      const cell = String(row[columnIndex] ?? '');
      return Math.max(max, cell.length);
    }, 0);

    return { wch: Math.max(headerLen, maxDataLen) + 2 };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, config.sheetName);

  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
};

const buildPdfBuffer = (config: ExportConfig, enabledKeys: string[]): ArrayBuffer => {
  const columns = getEnabledColumns(config, enabledKeys);
  const body = buildExportMatrix(config.rows, columns).map((row) => row.map((value) => String(value)));
  const summaryBody = buildExportMatrix(config.summaryRows ?? [], columns).map((row) =>
    row.map((value) => String(value)),
  );
  const rowsBeforeSummary = body.length;
  const pdfBody = [
    ...body,
    ...(summaryBody.length > 0 ? [new Array(columns.length).fill('')] : []),
    ...summaryBody,
  ];

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(config.sheetName, 40, 40);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text(`Exported: ${new Date().toLocaleDateString()}  •  ${config.rows.length} rows`, 40, 56);
  doc.setTextColor(0);

  const columnStyles: Record<number, { halign: 'left' | 'right' | 'center' }> = {};
  columns.forEach((column, index) => {
    columnStyles[index] = { halign: column.align ?? 'left' };
  });

  autoTable(doc, {
    head: [columns.map((column) => column.label)],
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
    columnStyles,
    margin: { left: 40, right: 40 },
    didParseCell: ({ row, cell, section }) => {
      if (section !== 'body' || summaryBody.length === 0) return;
      if (row.index <= rowsBeforeSummary) return;

      cell.styles.fontStyle = 'bold';
      cell.styles.fillColor = [240, 253, 244];
      cell.styles.textColor = [22, 101, 52];
    },
  });

  return doc.output('arraybuffer');
};

self.onmessage = (event: MessageEvent<ExportWorkerRequest>) => {
  const { id, format, enabledKeys, config } = event.data;

  try {
    const buffer =
      format === 'excel'
        ? buildExcelBuffer(config, enabledKeys)
        : buildPdfBuffer(config, enabledKeys);

    const response: ExportWorkerResponse = {
      id,
      ok: true,
      filename: `${config.filename}.${format === 'excel' ? 'xlsx' : 'pdf'}`,
      mimeType:
        format === 'excel'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf',
      buffer,
    };

    self.postMessage(response, [buffer]);
  } catch (error) {
    const response: ExportWorkerResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Export generation failed.',
    };

    self.postMessage(response);
  }
};

export {};
