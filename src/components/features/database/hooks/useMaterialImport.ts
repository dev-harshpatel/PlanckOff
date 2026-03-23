"use client";

import { useCallback, useRef, useState } from "react";
import { read, utils, writeFile } from "xlsx";
import { MaterialDefinition } from "@/types";
import {
  normalizeExcelHeaders,
  validateMaterialsBatch,
} from "@/lib/utils/materialValidation";
import { useToast } from "@/components/ui";

interface ImportPendingData {
  validMaterials: MaterialDefinition[];
  invalidRows: { row: number; errors: string[] }[];
}

interface UseMaterialImportProps {
  materials: MaterialDefinition[];
  onUpdateMaterials: (materials: MaterialDefinition[]) => void;
}

/**
 * Owns all Excel import and export logic for the material database:
 * - Export: sheet_to_json → xlsx download
 * - Import: parse Excel → header detection → validation → pending state
 * - Commit: merge or replace-all against the API
 */
export const useMaterialImport = ({
  materials,
  onUpdateMaterials,
}: UseMaterialImportProps) => {
  const toast = useToast();
  const importInputRef = useRef<HTMLInputElement>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [isImportModeModalOpen, setIsImportModeModalOpen] = useState(false);
  const [importPendingData, setImportPendingData] =
    useState<ImportPendingData | null>(null);
  const [isCommittingImport, setIsCommittingImport] = useState(false);

  const handleExportDatabase = useCallback(() => {
    try {
      const ws = utils.json_to_sheet(materials);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Materials");
      writeFile(wb, "DrywallSpec_Database.xlsx");
      toast.success("Export Complete", "Database exported successfully.");
    } catch (e) {
      console.error("Export failed", e);
      toast.error("Export Failed", "Failed to export database.");
    }
  }, [materials, toast]);

  const handleImportDatabase = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsImporting(true);

      try {
        const data = await file.arrayBuffer();
        const workbook = read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
        }) as unknown[][];

        if (rawRows.length === 0) {
          toast.error("Import Failed", "The Excel file is empty.");
          return;
        }

        // Auto-detect header row by matching known keywords
        const knownKeywords = [
          "code", "description", "category", "cost", "unit",
          "manufacturer", "section", "note", "formula",
          "gauge", "width", "flange", "size",
        ];
        let headerRowIndex = 0;
        let maxMatches = 0;
        for (let i = 0; i < Math.min(5, rawRows.length); i++) {
          const cells = rawRows[i].map((c) =>
            String(c ?? "").toLowerCase().trim(),
          );
          const matches = knownKeywords.filter((kw) =>
            cells.some((cell) => cell.includes(kw)),
          ).length;
          if (matches > maxMatches) {
            maxMatches = matches;
            headerRowIndex = i;
          }
        }

        const rawHeaderRow = rawRows[headerRowIndex];
        const headers: string[] = [];
        const headerIndices: number[] = [];
        const headerSeenCount: Record<string, number> = {};

        rawHeaderRow.forEach((h, i) => {
          const str = String(h ?? "").trim();
          if (str !== "") {
            const lower = str.toLowerCase();
            const seen = headerSeenCount[lower] ?? 0;
            headerSeenCount[lower] = seen + 1;
            const uniqueHeader = seen > 0 ? `${str} ${seen + 1}` : str;
            headers.push(uniqueHeader);
            headerIndices.push(i);
          }
        });

        const dataRows = rawRows
          .slice(headerRowIndex + 1)
          .filter((row) =>
            row.some((cell) => cell !== null && cell !== undefined && cell !== ""),
          );

        if (dataRows.length === 0) {
          toast.error("Import Failed", "No data rows found in the file.");
          return;
        }

        const jsonData: Record<string, unknown>[] = dataRows.map((row) => {
          const obj: Record<string, unknown> = {};
          headerIndices.forEach((colIndex, i) => {
            obj[headers[i]] = row[colIndex] ?? "";
          });
          return obj;
        });

        const headerMap = normalizeExcelHeaders(headers);
        const requiredFields = ["code", "description", "category"];
        const hasRequiredFields = requiredFields.every((field) =>
          Object.values(headerMap).includes(field),
        );

        if (!hasRequiredFields) {
          const missing = requiredFields.filter(
            (field) => !Object.values(headerMap).includes(field),
          );
          const detected = headers.slice(0, 12).join(", ");
          toast.error(
            "Import Failed",
            `Missing required columns: ${missing.join(", ")}.\nDetected: ${detected}`,
          );
          return;
        }

        const { validMaterials, invalidRows } = validateMaterialsBatch(
          jsonData,
          headerMap,
        );

        if (validMaterials.length === 0) {
          toast.error(
            "Import Failed",
            `All ${invalidRows.length} rows have validation errors.`,
          );
          return;
        }

        setImportPendingData({ validMaterials, invalidRows });
        setIsImportModeModalOpen(true);
      } catch (err) {
        console.error("Import failed", err);
        toast.error(
          "Import Failed",
          "Failed to read the file. Make sure it's a valid .xlsx or .csv.",
        );
      } finally {
        setIsImporting(false);
        e.target.value = "";
      }
    },
    [toast],
  );

  const handleImportCommit = useCallback(
    async (mode: "merge" | "replace") => {
      if (!importPendingData) return;
      const { validMaterials, invalidRows } = importPendingData;

      setIsImportModeModalOpen(false);
      setIsCommittingImport(true);

      try {
        if (mode === "replace") {
          const delRes = await fetch("/api/materials", { method: "DELETE" });
          const delData = await delRes.json();
          if (!delData.success) {
            toast.error(
              "Replace Failed",
              delData.error || "Failed to delete existing materials.",
            );
            return;
          }
        }

        const response = await fetch("/api/materials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ materials: validMaterials, mode: "upsert" }),
        });
        const data = await response.json();

        if (data.success) {
          if (mode === "replace") {
            onUpdateMaterials(validMaterials);
          } else {
            const existingCodesMap = new Map(materials.map((m) => [m.code, m]));
            const newMats = validMaterials.filter(
              (v) => !existingCodesMap.has(v.code),
            );
            const merged = materials.map((existing) => {
              const updated = validMaterials.find(
                (v) => v.code === existing.code,
              );
              return updated || existing;
            });
            onUpdateMaterials([...merged, ...newMats]);
          }

          const action = mode === "replace" ? "Replaced database with" : "Imported";
          let msg = `${action} ${validMaterials.length} materials.`;
          if (invalidRows.length > 0) msg += ` ${invalidRows.length} rows skipped.`;
          if (
            Array.isArray(data.summary?.duplicateCodes) &&
            data.summary.duplicateCodes.length > 0
          ) {
            msg += ` ${data.summary.duplicateCodes.length} duplicate code group(s) were merged using the last row.`;
          }
          toast.success("Import Complete", msg);
        } else {
          const serverInvalidRows = Array.isArray(data.invalidRows)
            ? data.invalidRows
            : [];
          const duplicateCodes = Array.isArray(data.summary?.duplicateCodes)
            ? data.summary.duplicateCodes
            : [];
          const detailParts: string[] = [];

          if (serverInvalidRows.length > 0) {
            detailParts.push(
              `Invalid rows: ${serverInvalidRows
                .slice(0, 3)
                .map(
                  (row: { row: number; errors: string[] }) =>
                    `#${row.row} (${row.errors.join(", ")})`,
                )
                .join("; ")}`,
            );
          }
          if (duplicateCodes.length > 0) {
            detailParts.push(
              `Duplicate codes: ${duplicateCodes
                .slice(0, 3)
                .map(
                  (item: { code: string; rows: number[] }) =>
                    `${item.code} [rows ${item.rows.join(", ")}]`,
                )
                .join("; ")}`,
            );
          }
          if (data.summary?.failedChunk) {
            const failedChunk = data.summary.failedChunk as {
              failedChunkIndex: number;
              failedChunkStartRow: number;
              failedChunkEndRow: number;
              failedCodes: string[];
            };
            detailParts.push(
              `Database save failed on chunk ${failedChunk.failedChunkIndex} (rows ${failedChunk.failedChunkStartRow}-${failedChunk.failedChunkEndRow}): ${failedChunk.failedCodes.slice(0, 5).join(", ")}`,
            );
          }
          toast.error(
            "Import Failed",
            [data.error || "Failed to save materials.", ...detailParts].join(" "),
          );
        }
      } catch (err) {
        console.error("Import commit failed", err);
        toast.error("Import Failed", "Failed to save materials.");
      } finally {
        setIsCommittingImport(false);
        setImportPendingData(null);
      }
    },
    [importPendingData, materials, onUpdateMaterials, toast],
  );

  return {
    importInputRef,
    isImporting,
    isImportModeModalOpen,
    setIsImportModeModalOpen,
    importPendingData,
    setImportPendingData,
    isCommittingImport,
    handleExportDatabase,
    handleImportDatabase,
    handleImportCommit,
  };
};
