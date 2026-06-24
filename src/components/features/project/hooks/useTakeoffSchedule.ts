"use client";

import { useCallback, useEffect } from "react";
import { read, utils } from "xlsx";
import { TakeoffInstance, WallAssembly } from "@/types";
import { AggregatedTakeoff } from "@/types/takeoff";
import { TakeoffRawRecord } from "@/services/takeoff/parseRawTakeoff";
import { useToast } from "@/components/ui";
import {
  normalizeTakeoffNumber,
  serializeTakeoffsToRawRows,
} from "@/lib/utils/takeoffSerializer";

export interface ImportCompleteData {
  assemblyResult?: { assemblies: unknown[] };
  excelFile?: File;
  finalResult?: { assemblies?: unknown[] };
  pdfFile: File;
  takeoffData?: AggregatedTakeoff[];
  takeoffResult?: unknown[];
}

interface UseTakeoffScheduleProps {
  assemblies: WallAssembly[];
  takeoffs: Record<string, TakeoffInstance[]>;
  viewMode: "project" | "report";
  takeoffOutputId?: string | null;
  setAssemblies: React.Dispatch<React.SetStateAction<WallAssembly[]>>;
  setTakeoffs: React.Dispatch<
    React.SetStateAction<Record<string, TakeoffInstance[]>>
  >;
  setLocalRawTakeoffRows: (rows: TakeoffRawRecord[]) => void;
  setImportedPdfFile: (file: File | null) => void;
  setImportedTakeoffData: (data: AggregatedTakeoff[] | null) => void;
  skipNextTakeoffPersistRef: React.MutableRefObject<boolean>;
  lastPersistedTakeoffPayloadRef: React.MutableRefObject<string>;
  takeoffPersistTimeoutRef: React.MutableRefObject<
    ReturnType<typeof setTimeout> | null
  >;
  onImportComplete?: () => void;
}

/**
 * Manages takeoff schedule import and persistence.
 *
 * Owns:
 * - Excel file parsing (both via handleScheduleUpload and handleImportComplete)
 * - Debounced PATCH to /api/takeoff-output/[id] whenever takeoffs change
 */
export const useTakeoffSchedule = ({
  assemblies,
  takeoffs,
  viewMode,
  takeoffOutputId,
  setAssemblies,
  setTakeoffs,
  setLocalRawTakeoffRows,
  setImportedPdfFile,
  setImportedTakeoffData,
  skipNextTakeoffPersistRef,
  lastPersistedTakeoffPayloadRef,
  takeoffPersistTimeoutRef,
  onImportComplete,
}: UseTakeoffScheduleProps) => {
  const toast = useToast();

  const loadExcelRows = useCallback(
    (
      rows: unknown[][],
      currentAssemblies: WallAssembly[],
      currentTakeoffs: Record<string, TakeoffInstance[]>,
    ): {
      updatedAssemblies: WallAssembly[];
      updatedTakeoffs: Record<string, TakeoffInstance[]>;
      invalidRowCount: number;
    } => {
      if (rows.length < 2) {
        return {
          updatedAssemblies: currentAssemblies,
          updatedTakeoffs: currentTakeoffs,
          invalidRowCount: 0,
        };
      }

      const fileHeaders = rows[0] as string[];
      const colMap = {
        code: fileHeaders.findIndex((h) => h?.match(/wall type|code|mark/i)),
        desc: fileHeaders.findIndex((h) => h?.match(/description|name/i)),
        type: fileHeaders.findIndex((h) => h?.match(/assembly type|type/i)),
        level: fileHeaders.findIndex((h) => h?.match(/level|floor/i)),
        length: fileHeaders.findIndex((h) => h?.match(/wall length|length/i)),
        area: fileHeaders.findIndex((h) =>
          h?.match(/area parem|area param|ceiling area|net area/i),
        ),
        perimeter: fileHeaders.findIndex((h) =>
          h?.match(/perimeter|area perimeter|zone perimeter/i),
        ),
      };

      if (colMap.code === -1) colMap.code = 3;
      if (colMap.desc === -1) colMap.desc = 1;

      const lengthUnitIdx = colMap.length !== -1 ? colMap.length + 1 : -1;
      const areaUnitIdx = colMap.area !== -1 ? colMap.area + 1 : -1;
      const updatedAssemblies = [...currentAssemblies];
      const updatedTakeoffs: Record<string, TakeoffInstance[]> = {
        ...currentTakeoffs,
      };
      let invalidRowCount = 0;

      (rows.slice(1) as unknown[][]).forEach((row, idx) => {
        const code = String((row as Record<number, unknown>)[colMap.code] || "").trim();
        if (!code) return;

        let detectedType: WallAssembly["assemblyType"] = "Wall";
        if (colMap.type !== -1 && (row as Record<number, unknown>)[colMap.type]) {
          const val = String((row as Record<number, unknown>)[colMap.type]).trim();
          if (val.match(/ceiling/i)) detectedType = "Ceiling";
          else if (val.match(/soffit/i)) detectedType = "Soffit";
          else if (val.match(/bulkhead/i)) detectedType = "Bulkhead";
          else if (val.match(/exterior/i)) detectedType = "Exterior Wall";
          else if (val.match(/interior/i)) detectedType = "Interior Wall";
          else if (val.match(/frame/i)) detectedType = "Hollow Metal Frame";
          else if (val.match(/access/i)) detectedType = "Access Panel";
        } else {
          const desc = String((row as Record<number, unknown>)[colMap.desc] || "").toLowerCase();
          if (desc.includes("ceiling")) detectedType = "Ceiling";
          else if (desc.includes("soffit")) detectedType = "Soffit";
        }

        let assembly = updatedAssemblies.find(
          (a) => a.code.toLowerCase() === code.toLowerCase(),
        );
        if (!assembly) {
          const newId = `auto-${code}-${Date.now()}-${idx}`;
          assembly = {
            id: newId,
            code,
            description: String(
              (row as Record<number, unknown>)[colMap.desc] || `Imported ${code}`,
            ),
            framingType: "Light Metal",
            assemblyType: detectedType,
            components: [],
          };
          updatedAssemblies.push(assembly);
        } else if (
          assembly.assemblyType === "Wall" &&
          detectedType !== "Wall"
        ) {
          assembly.assemblyType = detectedType;
        }

        if (!updatedTakeoffs[assembly.id]) updatedTakeoffs[assembly.id] = [];

        let len = 0,
          area = 0,
          perim = 0;
        const r = row as Record<number, unknown>;

        const parseNumericCell = (
          value: unknown,
        ): { numeric: number; invalid: boolean } => {
          const raw = String(value ?? "").trim();
          if (!raw) return { numeric: 0, invalid: false };
          const parsed = Number(raw);
          if (Number.isNaN(parsed)) {
            return { numeric: 0, invalid: true };
          }
          return { numeric: parsed, invalid: false };
        };

        if (colMap.length !== -1) {
          const { numeric, invalid } = parseNumericCell(r[colMap.length]);
          len = numeric;
          if (invalid) invalidRowCount += 1;
        }
        if (colMap.area !== -1) {
          const { numeric, invalid } = parseNumericCell(r[colMap.area]);
          area = numeric;
          if (invalid) invalidRowCount += 1;
        }
        if (colMap.perimeter !== -1) {
          const { numeric, invalid } = parseNumericCell(r[colMap.perimeter]);
          perim = numeric;
          if (invalid) invalidRowCount += 1;
        }

        const rawLengthUnit =
          lengthUnitIdx >= 0
            ? String(r[lengthUnitIdx] || "").toUpperCase().trim()
            : "";
        const rawAreaUnit =
          areaUnitIdx >= 0
            ? String(r[areaUnitIdx] || "").toUpperCase().trim()
            : "";

        if (rawLengthUnit === "SF" || rawLengthUnit === "M2") {
          area = len;
          len = 0;
        }

        if (detectedType === "Ceiling") {
          const colE = parseFloat(String(r[4] ?? "")) || 0;
          const colG = parseFloat(String(r[6] ?? "")) || 0;
          if (colE > 0) area = colE;
          if (colG > 0) perim = colG;
          len = 0;
        } else if (colMap.length === -1) {
          len = parseFloat(String(r[4] ?? "")) || 0;
        }

        updatedTakeoffs[assembly.id].push({
          id: `imp-${Date.now()}-${idx}`,
          level: colMap.level !== -1 ? String(r[colMap.level]) : "1",
          description: String(r[colMap.desc] || r[1] || "Imported"),
          quantity: 1,
          length: len,
          ceilingArea: area,
          perimeter: perim,
          lengthUnit: rawLengthUnit || (len > 0 ? "LF" : ""),
          areaUnit: rawAreaUnit || (area > 0 ? "SF" : ""),
        });
      });

      return { updatedAssemblies, updatedTakeoffs, invalidRowCount };
    },
    [],
  );

  /** Called by ImportFilesModal after a full pipeline run. */
  const handleImportComplete = useCallback(
    (data: ImportCompleteData) => {
      setImportedPdfFile(data.pdfFile);
      onImportComplete?.();

      if (data.excelFile && data.takeoffData) {
        setImportedTakeoffData(data.takeoffData);
        const loadExcel = async () => {
          try {
            const buffer = await data.excelFile!.arrayBuffer();
            const workbook = read(buffer);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
            const {
              updatedAssemblies,
              updatedTakeoffs,
              invalidRowCount,
            } = loadExcelRows(
              jsonData,
              assemblies,
              takeoffs,
            );
            setAssemblies(updatedAssemblies);
            setTakeoffs(updatedTakeoffs);
            if (invalidRowCount > 0) {
              toast.warning(
                "Schedule Warnings",
                `${invalidRowCount} row(s) had non-numeric values in numeric columns and were treated as 0. Please review the imported schedule.`,
              );
            }
            toast.success(
              "Files Imported",
              `Loaded ${data.takeoffData!.length} assemblies from takeoff schedule.`,
            );
          } catch {
            toast.error("Import Failed", "Error loading schedule data into project.");
          }
        };
        loadExcel();
      } else {
        toast.success(
          "PDF Processed",
          "Assemblies extracted and matched successfully.",
        );
      }
    },
    [assemblies, loadExcelRows, onImportComplete, setAssemblies, setImportedPdfFile, setImportedTakeoffData, setTakeoffs, takeoffs, toast],
  );

  /** Called when user manually uploads an Excel schedule from TakeoffTab. */
  const handleScheduleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const data = await file.arrayBuffer();
        const workbook = read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
        if (jsonData.length < 2) throw new Error("Empty file");

        const headers = jsonData[0] as string[];
        const colMap = {
          code: headers.findIndex((h) => h?.match(/wall type|code|mark/i)),
          desc: headers.findIndex((h) => h?.match(/description|name/i)),
          type: headers.findIndex((h) => h?.match(/assembly type|type/i)),
          level: headers.findIndex((h) => h?.match(/level|floor/i)),
          length: headers.findIndex((h) => h?.match(/length/i)),
          area: headers.findIndex((h) => h?.match(/area|net area/i)),
          perimeter: headers.findIndex((h) =>
            h?.match(/perimeter|area perimeter|zone perimeter/i),
          ),
        };

        if (colMap.code === -1 || colMap.desc === -1) {
          toast.error(
            "Import Failed",
            "Required columns not found. Please ensure your sheet has at least a Code/Wall Type and Description column.",
          );
          e.target.value = "";
          return;
        }

        const updatedAssemblies = [...assemblies];
        const updatedTakeoffs: Record<string, TakeoffInstance[]> = {
          ...takeoffs,
        };

        (jsonData.slice(1) as unknown[][]).forEach((row, idx) => {
          const r = row as Record<number, unknown>;
          const code = String(r[colMap.code] || "").trim();
          if (!code) return;

          let detectedType: WallAssembly["assemblyType"] = "Wall";
          if (colMap.type !== -1 && r[colMap.type]) {
            const val = String(r[colMap.type]).trim();
            if (val.match(/ceiling/i)) detectedType = "Ceiling";
            else if (val.match(/soffit/i)) detectedType = "Soffit";
            else if (val.match(/bulkhead/i)) detectedType = "Bulkhead";
            else if (val.match(/exterior/i)) detectedType = "Exterior Wall";
            else if (val.match(/interior/i)) detectedType = "Interior Wall";
            else if (val.match(/frame/i)) detectedType = "Hollow Metal Frame";
            else if (val.match(/access/i)) detectedType = "Access Panel";
            else detectedType = "Wall";
          } else {
            const desc = String(r[colMap.desc] || "").toLowerCase();
            if (desc.includes("ceiling")) detectedType = "Ceiling";
            else if (desc.includes("soffit")) detectedType = "Soffit";
          }

          let assembly = updatedAssemblies.find(
            (a) => a.code.toLowerCase() === code.toLowerCase(),
          );
          if (!assembly) {
            const newId = `auto-${code}-${Date.now()}-${idx}`;
            assembly = {
              id: newId,
              code,
              description: String(r[colMap.desc] || `Imported ${code}`),
              framingType: "Light Metal",
              assemblyType: detectedType,
              components: [],
            };
            updatedAssemblies.push(assembly);
          } else if (
            assembly.assemblyType === "Wall" &&
            detectedType !== "Wall"
          ) {
            assembly.assemblyType = detectedType;
          }

          if (!updatedTakeoffs[assembly.id]) updatedTakeoffs[assembly.id] = [];

          let len = 0,
            area = 0,
            perim = 0;
          const parseNumericCell = (
            value: unknown,
          ): { numeric: number; invalid: boolean } => {
            const raw = String(value ?? "").trim();
            if (!raw) return { numeric: 0, invalid: false };
            const parsed = Number(raw);
            if (Number.isNaN(parsed)) {
              return { numeric: 0, invalid: true };
            }
            return { numeric: parsed, invalid: false };
          };

          if (colMap.length !== -1) {
            const { numeric } = parseNumericCell(r[colMap.length]);
            len = numeric;
          }
          if (colMap.area !== -1) {
            const { numeric } = parseNumericCell(r[colMap.area]);
            area = numeric;
          }
          if (colMap.perimeter !== -1) {
            const { numeric } = parseNumericCell(r[colMap.perimeter]);
            perim = numeric;
          }

          if (detectedType === "Ceiling") {
            const colE = parseFloat(String(r[4] ?? "")) || 0;
            const colG = parseFloat(String(r[6] ?? "")) || 0;
            if (colE > 0) area = colE;
            if (colG > 0) perim = colG;
            len = 0;
          } else if (colMap.length === -1) {
            len = parseFloat(String(r[4] ?? "")) || 0;
          }

          updatedTakeoffs[assembly.id].push({
            id: `imp-${Date.now()}-${idx}`,
            level: colMap.level !== -1 ? String(r[colMap.level]) : "1",
            description: String(r[colMap.desc] || r[1] || "Imported"),
            quantity: 1,
            length: len,
            ceilingArea: area,
            perimeter: perim,
            lengthUnit: len > 0 ? "LF" : "",
            areaUnit: area > 0 ? "SF" : "",
          });
        });

        setAssemblies(updatedAssemblies);
        setTakeoffs(updatedTakeoffs);
        e.target.value = "";
        toast.success("Schedule Imported", "Schedule data has been loaded successfully.");
      } catch {
        toast.error("Import Failed", "Error parsing schedule. Please check the file format.");
      }
    },
    [assemblies, setAssemblies, setTakeoffs, takeoffs, toast],
  );

  /** Debounced PATCH to persist takeoff changes to the backend. */
  useEffect(() => {
    if (viewMode !== "project" || !takeoffOutputId) return;

    if (skipNextTakeoffPersistRef.current) {
      skipNextTakeoffPersistRef.current = false;
      return;
    }

    const payload = serializeTakeoffsToRawRows(takeoffs, assemblies);
    const serializedPayload = JSON.stringify(payload);
    if (serializedPayload === lastPersistedTakeoffPayloadRef.current) return;

    if (takeoffPersistTimeoutRef.current) {
      clearTimeout(takeoffPersistTimeoutRef.current);
    }

    takeoffPersistTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/takeoff-output/${takeoffOutputId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ rows: payload }),
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || "Failed to save takeoff schedule");
        }
        lastPersistedTakeoffPayloadRef.current = serializedPayload;
        setLocalRawTakeoffRows(payload);
      } catch (error) {
        console.error("[TakeoffSchedule] Failed to persist schedule edits:", error);
        toast.error(
          "Takeoff Save Failed",
          "Schedule edits were kept locally, but could not be saved to the project.",
        );
      }
    }, 500);

    return () => {
      if (takeoffPersistTimeoutRef.current) {
        clearTimeout(takeoffPersistTimeoutRef.current);
      }
    };
  }, [
    assemblies,
    lastPersistedTakeoffPayloadRef,
    skipNextTakeoffPersistRef,
    takeoffOutputId,
    takeoffPersistTimeoutRef,
    takeoffs,
    toast,
    viewMode,
  ]);

  return { handleImportComplete, handleScheduleUpload };
};
