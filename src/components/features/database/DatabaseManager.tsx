"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Database,
  Download,
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { read, utils, writeFile } from "xlsx";
import {
  Button,
  CloseButton,
  ConfirmModal,
  IconButton,
  Modal,
  ModalBody,
  ModalFooter,
  SearchInput,
  useToast,
} from "@/components/ui";
import { MaterialDefinition } from "@/types";
import {
  extractUniqueCategories,
  normalizeExcelHeaders,
  validateMaterialsBatch,
} from "@/lib/utils/materialValidation";

interface DatabaseManagerProps {
  materials: MaterialDefinition[];
  onUpdateMaterials: (materials: MaterialDefinition[]) => void;
  onClose?: () => void;
}

// ─── Formula Modal ────────────────────────────────────────────────────────────

interface FormulaModalProps {
  material: MaterialDefinition | null;
  onClose: () => void;
  onSave: (
    code: string,
    formulaQty: string,
    formulaSecQty: string,
    formulaCeilQty: string,
    formulaCeilSecQty: string,
  ) => void;
}

const FormulaModal: React.FC<FormulaModalProps> = ({ material, onClose, onSave }) => {
  const [activeTab, setActiveTab] = useState<"wall" | "ceiling">("wall");
  const [formulaQty, setFormulaQty] = useState("");
  const [formulaSecQty, setFormulaSecQty] = useState("");
  const [formulaCeilQty, setFormulaCeilQty] = useState("");
  const [formulaCeilSecQty, setFormulaCeilSecQty] = useState("");

  useEffect(() => {
    if (material) {
      setFormulaQty(material.formulaQty ?? "");
      setFormulaSecQty(material.formulaSecQty ?? "");
      setFormulaCeilQty(material.formulaCeilQty ?? "");
      setFormulaCeilSecQty(material.formulaCeilSecQty ?? "");
      setActiveTab("wall");
    }
  }, [material]);

  if (!material) return null;

  const handleSave = () => {
    onSave(material.code, formulaQty, formulaSecQty, formulaCeilQty, formulaCeilSecQty);
    onClose();
  };

  const FormulaField = ({
    label,
    value,
    onChange,
    placeholder,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
  }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </label>
      <textarea
        className="w-full h-28 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );

  return (
    <Modal
      isOpen={!!material}
      onClose={onClose}
      title={`Formulas — ${material.code}`}
      size="lg"
    >
      <ModalBody>
        <p className="text-sm text-slate-500 mb-4">{material.description}</p>

        {/* Tabs: Wall / Ceiling */}
        <div className="flex border-b border-slate-200 mb-5">
          {(["wall", "ceiling"] as const).map((tab) => (
            <button
              key={tab}
              className={`px-6 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "wall" && (
          <div className="space-y-4">
            <FormulaField
              label="Formula for Qty"
              value={formulaQty}
              onChange={setFormulaQty}
              placeholder="e.g. Length * Height * (1 + Wastage) * layer"
            />
            <FormulaField
              label="Formula for Sec. Qty"
              value={formulaSecQty}
              onChange={setFormulaSecQty}
              placeholder="e.g. (Length * Height * (1 + Wastage) * layer) / sheet area"
            />
          </div>
        )}

        {activeTab === "ceiling" && (
          <div className="space-y-4">
            <FormulaField
              label="Formula"
              value={formulaCeilQty}
              onChange={setFormulaCeilQty}
              placeholder="e.g. (Ceiling Area) * (1 + Wastage)"
            />
            <FormulaField
              label="Formula for Sec. Qty"
              value={formulaCeilSecQty}
              onChange={setFormulaCeilSecQty}
              placeholder="e.g. ((Ceiling Area) * (1 + Wastage)) / sheet area"
            />
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" icon={Save} onClick={handleSave}>
          Save Formulas
        </Button>
      </ModalFooter>
    </Modal>
  );
};

// ─── Inline cell input ────────────────────────────────────────────────────────

const CellInput = ({
  value,
  onChange,
  type = "text",
  placeholder = "-",
  className = "",
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) => (
  <input
    type={type}
    className={`w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1 ${className}`}
    value={value}
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
  />
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const DatabaseManager: React.FC<DatabaseManagerProps> = ({
  materials,
  onUpdateMaterials,
  onClose,
}) => {
  const toast = useToast();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [dbCategory, setDbCategory] = useState<string>("All");
  const [dbSearch, setDbSearch] = useState("");
  const [isAddingMat, setIsAddingMat] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);

  // Track modified rows
  const [modifiedRows, setModifiedRows] = useState<Set<string>>(new Set());
  const [savingRows, setSavingRows] = useState<Set<string>>(new Set());
  const [isSavingBulk, setIsSavingBulk] = useState(false);

  // Delete confirmation state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState<{ code: string; name: string } | null>(null);

  // Calc productivity confirmation state
  const [isCalcProdModalOpen, setIsCalcProdModalOpen] = useState(false);

  // Formula modal state
  const [formulaMaterial, setFormulaMaterial] = useState<MaterialDefinition | null>(null);

  // Import mode modal state
  const [isImportModeModalOpen, setIsImportModeModalOpen] = useState(false);
  const [importPendingData, setImportPendingData] = useState<{
    validMaterials: MaterialDefinition[];
    invalidRows: { row: number; errors: string[] }[];
  } | null>(null);
  const [isCommittingImport, setIsCommittingImport] = useState(false);

  const [newMaterial, setNewMaterial] = useState<Partial<MaterialDefinition>>({
    category: "Framing",
    per: "1,000 LF",
    matCost: 0,
    section: "09 20 00",
    type: "Division 09",
    manufacturer: "",
    width: "",
    gauge: "",
    flange: "",
  });

  // Dynamic categories from materials
  const categories = useMemo(() => {
    const cats = extractUniqueCategories(materials);
    return ["All", ...cats];
  }, [materials]);

  // Load materials from database on mount
  useEffect(() => {
    const fetchMaterials = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/materials");
        const data = await response.json();
        if (data.success && data.materials) {
          onUpdateMaterials(data.materials);
        }
      } catch (error) {
        console.error("Failed to fetch materials:", error);
        toast.error("Load Failed", "Failed to load materials from database.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchMaterials();
  }, []);

  const markModified = (code: string) =>
    setModifiedRows((prev) => new Set(prev).add(code));

  const handleUpdateMaterial = (code: string, field: keyof MaterialDefinition, value: any) => {
    const updated = materials.map((m) => {
      if (m.code !== code) return m;
      const next = { ...m, [field]: value };
      if (m.category === "Labor" && (field === "hourlyRate" || field === "productivity")) {
        const r = field === "hourlyRate" ? value : next.hourlyRate;
        const p = field === "productivity" ? value : next.productivity;
        if (r && p) next.matCost = parseFloat((r / p).toFixed(2));
        else next.matCost = 0;
      }
      return next;
    });
    onUpdateMaterials(updated);
    markModified(code);
  };

  const handleUpdateNewMaterial = (field: keyof MaterialDefinition, value: any) => {
    setNewMaterial((prev) => {
      const next = { ...prev, [field]: value };
      if (next.category === "Labor" && (field === "hourlyRate" || field === "productivity")) {
        const r = field === "hourlyRate" ? value : next.hourlyRate;
        const p = field === "productivity" ? value : next.productivity;
        if (r && p) next.matCost = parseFloat((r / p).toFixed(2));
        else next.matCost = 0;
      }
      return next;
    });
  };

  const handleAddMaterial = async () => {
    if (!newMaterial.description) return;
    const newItem: MaterialDefinition = {
      code: `MAT-${Date.now()}`,
      section: newMaterial.section || "00 00 00",
      matCostCode: newMaterial.matCostCode || "GEN",
      laborCostCode: newMaterial.laborCostCode || "",
      type: newMaterial.type || "Material",
      manufacturer: newMaterial.manufacturer || "Generic",
      description: newMaterial.description || "New Material",
      matCost: newMaterial.matCost || 0,
      per: newMaterial.per || (
        newMaterial.category === "Drywall" || newMaterial.category === "Insulation"
          ? "1,000 SF"
          : newMaterial.category === "Framing"
            ? "1 LF"
            : "1 EA"
      ),
      priceUpdated: newMaterial.priceUpdated || new Date().toLocaleDateString(),
      category: (newMaterial.category as any) || "Other",
      width: newMaterial.width,
      gauge: newMaterial.gauge,
      flange: newMaterial.flange,
      productivity: newMaterial.productivity,
      hourlyRate: newMaterial.hourlyRate,
    };

    try {
      const response = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materials: [newItem], mode: "single" }),
      });
      const data = await response.json();
      if (data.success) {
        onUpdateMaterials([...materials, newItem]);
        toast.success("Material Added", "Material saved to database.");
        const nextCat = dbCategory === "All" ? "Framing" : dbCategory;
        setNewMaterial({
          category: nextCat as any,
          per: nextCat === "Drywall" || nextCat === "Insulation" ? "1,000 SF" : nextCat === "Framing" ? "1 LF" : "1 EA",
          matCost: 0,
          section: "00 00 00",
          manufacturer: "",
          width: "",
          gauge: "",
          flange: "",
        });
        setIsAddingMat(false);
      } else {
        toast.error("Save Failed", data.error || "Failed to save material.");
      }
    } catch (error) {
      console.error("Failed to add material:", error);
      toast.error("Save Failed", "An unexpected error occurred.");
    }
  };

  const handleSaveInline = async (code: string) => {
    const material = materials.find((m) => m.code === code);
    if (!material) return;
    try {
      setSavingRows((prev) => new Set(prev).add(code));
      const response = await fetch(`/api/materials/${encodeURIComponent(code)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: material }),
      });
      const data = await response.json();
      if (data.success) {
        setModifiedRows((prev) => { const next = new Set(prev); next.delete(code); return next; });
        toast.success("Saved", "Material updated successfully.");
      } else {
        toast.error("Save Failed", data.error || "Failed to save material.");
      }
    } catch (error) {
      console.error("Failed to save material:", error);
      toast.error("Save Failed", "An unexpected error occurred.");
    } finally {
      setSavingRows((prev) => { const next = new Set(prev); next.delete(code); return next; });
    }
  };

  const handleSaveModified = async () => {
    if (modifiedRows.size === 0) return;
    try {
      setIsSavingBulk(true);
      const modifiedMaterials = materials.filter((m) => modifiedRows.has(m.code));
      const response = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materials: modifiedMaterials, mode: "upsert" }),
      });
      const data = await response.json();
      if (data.success) {
        setModifiedRows(new Set());
        toast.success("Saved", `Successfully saved ${modifiedMaterials.length} materials.`);
      } else {
        toast.error("Save Failed", data.error || "Failed to save materials.");
      }
    } catch (error) {
      console.error("Failed to save materials:", error);
      toast.error("Save Failed", "An unexpected error occurred.");
    } finally {
      setIsSavingBulk(false);
    }
  };

  const openDeleteModal = (code: string, name: string) => {
    setMaterialToDelete({ code, name });
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteMaterial = async () => {
    if (!materialToDelete) return;
    try {
      const response = await fetch(`/api/materials/${encodeURIComponent(materialToDelete.code)}`, { method: "DELETE" });
      const data = await response.json();
      if (data.success) {
        onUpdateMaterials(materials.filter((m) => m.code !== materialToDelete.code));
        toast.success("Material Deleted", `"${materialToDelete.name}" has been removed.`);
      } else {
        toast.error("Delete Failed", data.error || "Failed to delete material.");
      }
    } catch (error) {
      console.error("Failed to delete material:", error);
      toast.error("Delete Failed", "An unexpected error occurred.");
    }
    setIsDeleteModalOpen(false);
    setMaterialToDelete(null);
  };

  const handleDeleteMaterial = (code: string) => {
    const material = materials.find((m) => m.code === code);
    openDeleteModal(code, material?.description || "Unknown");
  };

  const handleSaveFormulas = (
    code: string,
    formulaQty: string,
    formulaSecQty: string,
    formulaCeilQty: string,
    formulaCeilSecQty: string,
  ) => {
    const updated = materials.map((m) =>
      m.code === code
        ? {
            ...m,
            formulaQty: formulaQty || undefined,
            formulaSecQty: formulaSecQty || undefined,
            formulaCeilQty: formulaCeilQty || undefined,
            formulaCeilSecQty: formulaCeilSecQty || undefined,
          }
        : m,
    );
    onUpdateMaterials(updated);
    markModified(code);
    toast.success("Formulas Updated", "Formulas saved. Click Save to persist to database.");
  };

  const handleExportDatabase = () => {
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
  };

  const handleImportDatabase = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];

      // Parse as raw rows first so we can auto-detect the header row
      const rawRows = utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];

      if (rawRows.length === 0) {
        toast.error("Import Failed", "The Excel file is empty.");
        return;
      }

      // Find the header row: scan first 5 rows, pick the one with the most
      // recognisable column name hits
      const knownKeywords = ["code", "description", "category", "cost", "unit", "manufacturer", "section", "note", "formula", "gauge", "width", "flange", "size"];
      let headerRowIndex = 0;
      let maxMatches = 0;
      for (let i = 0; i < Math.min(5, rawRows.length); i++) {
        const cells = rawRows[i].map((c: any) => String(c ?? "").toLowerCase().trim());
        const matches = knownKeywords.filter((kw) => cells.some((cell) => cell.includes(kw))).length;
        if (matches > maxMatches) {
          maxMatches = matches;
          headerRowIndex = i;
        }
      }

      // Extract non-empty headers from detected header row, keeping their column index.
      // Deduplicate: when the same header appears more than once (e.g. "Formula for Sec. Qty"
      // appears for both Wall and Ceiling columns), append " 2", " 3", etc. so each column
      // gets a unique key in the jsonData object and the normalizer can map them separately.
      const rawHeaderRow = rawRows[headerRowIndex];
      const headers: string[] = [];
      const headerIndices: number[] = [];
      const headerSeenCount: Record<string, number> = {};
      rawHeaderRow.forEach((h: any, i: number) => {
        const str = String(h ?? "").trim();
        if (str !== "") {
          const lower = str.toLowerCase();
          const seen = headerSeenCount[lower] ?? 0;
          headerSeenCount[lower] = seen + 1;
          // First occurrence keeps original name; subsequent ones get " 2", " 3", etc.
          const uniqueHeader = seen > 0 ? `${str} ${seen + 1}` : str;
          headers.push(uniqueHeader);
          headerIndices.push(i);
        }
      });

      // Build data rows (everything after the header row, skip blanks)
      const dataRows = rawRows.slice(headerRowIndex + 1).filter((row: any[]) =>
        row.some((cell) => cell !== null && cell !== undefined && cell !== ""),
      );

      if (dataRows.length === 0) {
        toast.error("Import Failed", "No data rows found in the file.");
        return;
      }

      // Convert raw rows to key→value objects using the detected headers
      const jsonData: Record<string, any>[] = dataRows.map((row: any[]) => {
        const obj: Record<string, any> = {};
        headerIndices.forEach((colIndex, i) => {
          obj[headers[i]] = row[colIndex] ?? "";
        });
        return obj;
      });

      // Normalize headers to standard field keys
      const headerMap = normalizeExcelHeaders(headers);

      // Validate required columns
      const requiredFields = ["code", "description", "category"];
      const hasRequiredFields = requiredFields.every((field) =>
        Object.values(headerMap).includes(field),
      );

      if (!hasRequiredFields) {
        const missing = requiredFields.filter((field) => !Object.values(headerMap).includes(field));
        const detected = headers.slice(0, 12).join(", ");
        toast.error(
          "Import Failed",
          `Missing required columns: ${missing.join(", ")}.\nDetected: ${detected}`,
        );
        return;
      }

      const { validMaterials, invalidRows } = validateMaterialsBatch(jsonData, headerMap);

      if (validMaterials.length === 0) {
        toast.error("Import Failed", `All ${invalidRows.length} rows have validation errors.`);
        return;
      }

      // Store parsed data and open the mode-selection dialog
      setImportPendingData({ validMaterials, invalidRows });
      setIsImportModeModalOpen(true);
    } catch (err) {
      console.error("Import failed", err);
      toast.error("Import Failed", "Failed to read the file. Make sure it's a valid .xlsx or .csv.");
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  };

  const handleImportCommit = async (mode: "merge" | "replace") => {
    if (!importPendingData) return;
    const { validMaterials, invalidRows } = importPendingData;

    setIsImportModeModalOpen(false);
    setIsCommittingImport(true);

    try {
      if (mode === "replace") {
        const delRes = await fetch("/api/materials", { method: "DELETE" });
        const delData = await delRes.json();
        if (!delData.success) {
          toast.error("Replace Failed", delData.error || "Failed to delete existing materials.");
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
          const newMats = validMaterials.filter((v) => !existingCodesMap.has(v.code));
          const merged = materials.map((existing) => {
            const updated = validMaterials.find((v) => v.code === existing.code);
            return updated || existing;
          });
          onUpdateMaterials([...merged, ...newMats]);
        }

        setModifiedRows(new Set());

        const action = mode === "replace" ? "Replaced database with" : "Imported";
        let msg = `${action} ${validMaterials.length} materials.`;
        if (invalidRows.length > 0) msg += ` ${invalidRows.length} rows skipped.`;
        toast.success("Import Complete", msg);
      } else {
        toast.error("Import Failed", data.error || "Failed to save materials.");
      }
    } catch (err) {
      console.error("Import commit failed", err);
      toast.error("Import Failed", "Failed to save materials.");
    } finally {
      setIsCommittingImport(false);
      setImportPendingData(null);
    }
  };

  const confirmCalcProductivity = () => {
    const updated = materials.map((m) => {
      if (m.category === "Labor" && m.matCost > 0 && !m.productivity) {
        return { ...m, productivity: parseFloat((65 / m.matCost).toFixed(2)) };
      }
      return m;
    });
    onUpdateMaterials(updated);
    toast.success("Calculation Complete", "Productivity values have been updated.");
    setIsCalcProdModalOpen(false);
  };

  const filteredDbMaterials = materials.filter((m) => {
    const matchSearch =
      m.description.toLowerCase().includes(dbSearch.toLowerCase()) ||
      m.code.toLowerCase().includes(dbSearch.toLowerCase());
    const matchCat = dbCategory === "All" || m.category === dbCategory;
    return matchSearch && matchCat;
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-white items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-slate-500 mt-3">Loading materials...</p>
      </div>
    );
  }

  // ─── Column cell helper for existing rows ────────────────────────────────
  const cell = (m: MaterialDefinition, field: keyof MaterialDefinition, type = "text") => (
    <input
      type={type}
      className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1"
      value={(m[field] as string | number) ?? ""}
      placeholder="-"
      onChange={(e) => handleUpdateMaterial(m.code, field, type === "number" ? parseFloat(e.target.value) : e.target.value)}
    />
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-6 h-6 text-blue-600" /> Material Database
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Master catalog with {materials.length} items.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" icon={Download} onClick={handleExportDatabase}>
            Export
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx, .csv"
            className="hidden"
            onChange={handleImportDatabase}
            disabled={isImporting}
          />
          <Button
            variant="secondary"
            icon={Upload}
            onClick={() => importInputRef.current?.click()}
            disabled={isImporting || isCommittingImport}
            isLoading={isImporting || isCommittingImport}
          >
            {isCommittingImport ? "Saving..." : isImporting ? "Reading..." : "Import"}
          </Button>
          <Button variant="secondary" icon={Database} onClick={() => setIsCalcProdModalOpen(true)}>
            Calc Prod
          </Button>
          {onClose && <CloseButton onClick={onClose} size="md" />}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Sidebar */}
        <div className="w-64 border-r border-slate-200 bg-slate-50 p-4 space-y-1 flex-shrink-0">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">
            Categories
          </div>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setDbCategory(cat);
                setNewMaterial((prev) => ({
                  ...prev,
                  category: cat === "All" ? (categories[1] as any) : (cat as any),
                  per:
                    cat === "Drywall" || cat === "Insulation" ? "1,000 SF"
                      : cat === "Framing" ? "1 LF" : "1 EA",
                }));
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                dbCategory === cat
                  ? "bg-blue-100 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Scrollable Data Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search + Actions */}
          <div className="p-4 border-b border-slate-200 flex gap-4 items-center flex-shrink-0">
            <div className="flex-1">
              <SearchInput
                value={dbSearch}
                onValueChange={setDbSearch}
                placeholder="Search by code, description, or manufacturer..."
              />
            </div>
            {modifiedRows.size > 0 && (
              <Button variant="primary" icon={Save} onClick={handleSaveModified} disabled={isSavingBulk} isLoading={isSavingBulk}>
                Save ({modifiedRows.size})
              </Button>
            )}
            <Button variant="primary" icon={Plus} onClick={() => setIsAddingMat(true)}>
              Add New Item
            </Button>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            <table className="text-left" style={{ minWidth: "max-content" }}>
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-32">Code</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">Section</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-32">Cost Code</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-32">Labor Code</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-32">Type</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-36">Manufacturer</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 min-w-64">Description</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28 text-right">Cost</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28 text-right">Unit Cost</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">Unit</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-32">Prod. Rate</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-32">Price Updated</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">Category</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">Sheet/Bag/Box</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">Size</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">Screw Spacing</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">Width</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">Gauge</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">Flange</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">Hourly Rate</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 min-w-48">Note</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Add new row */}
                {isAddingMat && (
                  <tr className="bg-blue-50 animate-in fade-in duration-300">
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="Code" disabled value="Auto" /></td>
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="09 22 16" value={newMaterial.section ?? ""} onChange={(e) => setNewMaterial({ ...newMaterial, section: e.target.value })} /></td>
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="GEN" value={newMaterial.matCostCode ?? ""} onChange={(e) => setNewMaterial({ ...newMaterial, matCostCode: e.target.value })} /></td>
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="LAB" value={newMaterial.laborCostCode ?? ""} onChange={(e) => setNewMaterial({ ...newMaterial, laborCostCode: e.target.value })} /></td>
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="Material" value={newMaterial.type ?? ""} onChange={(e) => setNewMaterial({ ...newMaterial, type: e.target.value })} /></td>
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="Manufacturer" value={newMaterial.manufacturer ?? ""} onChange={(e) => setNewMaterial({ ...newMaterial, manufacturer: e.target.value })} /></td>
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="Description" value={newMaterial.description ?? ""} onChange={(e) => setNewMaterial({ ...newMaterial, description: e.target.value })} /></td>
                    <td className="px-4 py-2"><input type="number" className="w-full text-sm border border-blue-300 rounded px-2 py-1 text-right" placeholder="0" value={newMaterial.matCost ?? ""} onChange={(e) => handleUpdateNewMaterial("matCost", parseFloat(e.target.value))} /></td>
                    <td className="px-4 py-2"><input type="number" className="w-full text-sm border border-blue-300 rounded px-2 py-1 text-right" placeholder="0" value={newMaterial.unitCost ?? ""} onChange={(e) => handleUpdateNewMaterial("unitCost", parseFloat(e.target.value))} /></td>
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="1 EA" value={newMaterial.per ?? ""} onChange={(e) => handleUpdateNewMaterial("per", e.target.value)} /></td>
                    <td className="px-4 py-2"><input type="number" className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="100" value={newMaterial.productivity ?? ""} onChange={(e) => handleUpdateNewMaterial("productivity", parseFloat(e.target.value))} /></td>
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="MM/DD/YYYY" value={newMaterial.priceUpdated ?? ""} onChange={(e) => setNewMaterial({ ...newMaterial, priceUpdated: e.target.value })} /></td>
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" disabled value={newMaterial.category ?? ""} /></td>
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="50" value={newMaterial.sheetBagBox ?? ""} onChange={(e) => setNewMaterial({ ...newMaterial, sheetBagBox: e.target.value })} /></td>
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder='5/8"' value={newMaterial.size ?? ""} onChange={(e) => setNewMaterial({ ...newMaterial, size: e.target.value })} /></td>
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder='12"' value={newMaterial.screwSpacing ?? ""} onChange={(e) => setNewMaterial({ ...newMaterial, screwSpacing: e.target.value })} /></td>
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder='3-5/8"' value={newMaterial.width ?? ""} onChange={(e) => setNewMaterial({ ...newMaterial, width: e.target.value })} /></td>
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="20ga" value={newMaterial.gauge ?? ""} onChange={(e) => setNewMaterial({ ...newMaterial, gauge: e.target.value })} /></td>
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder='1-5/8"' value={newMaterial.flange ?? ""} onChange={(e) => setNewMaterial({ ...newMaterial, flange: e.target.value })} /></td>
                    <td className="px-4 py-2"><input type="number" className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="$65" value={newMaterial.hourlyRate ?? ""} onChange={(e) => handleUpdateNewMaterial("hourlyRate", parseFloat(e.target.value))} /></td>
                    <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="Note..." value={newMaterial.note ?? ""} onChange={(e) => setNewMaterial({ ...newMaterial, note: e.target.value })} /></td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <IconButton icon={Save} variant="success" onClick={handleAddMaterial} tooltip="Save material" />
                        <IconButton icon={X} variant="default" onClick={() => setIsAddingMat(false)} tooltip="Cancel" />
                      </div>
                    </td>
                  </tr>
                )}

                {/* Existing rows */}
                {filteredDbMaterials.map((m) => {
                  const isModified = modifiedRows.has(m.code);
                  const isSaving = savingRows.has(m.code);

                  return (
                    <tr
                      key={m.code}
                      className={`group transition-colors ${isModified ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-slate-50"}`}
                    >
                      <td className="px-4 py-3 text-sm font-mono text-slate-500">{m.code}</td>
                      <td className="px-4 py-3">{cell(m, "section")}</td>
                      <td className="px-4 py-3">{cell(m, "matCostCode")}</td>
                      <td className="px-4 py-3">{cell(m, "laborCostCode")}</td>
                      <td className="px-4 py-3">{cell(m, "type")}</td>
                      <td className="px-4 py-3">{cell(m, "manufacturer")}</td>
                      <td className="px-4 py-3">
                        <input
                          className="w-full bg-transparent border-none text-sm text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1"
                          value={m.description}
                          onChange={(e) => handleUpdateMaterial(m.code, "description", e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input type="number" className="w-full bg-transparent border-none text-sm text-slate-800 text-right focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.matCost} onChange={(e) => handleUpdateMaterial(m.code, "matCost", parseFloat(e.target.value))} />
                      </td>
                      <td className="px-4 py-3">
                        <input type="number" className="w-full bg-transparent border-none text-sm text-slate-600 text-right focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.unitCost ?? ""} placeholder="-" onChange={(e) => handleUpdateMaterial(m.code, "unitCost", parseFloat(e.target.value))} />
                      </td>
                      <td className="px-4 py-3">{cell(m, "per")}</td>
                      <td className="px-4 py-3">
                        <input type="number" className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.productivity ?? ""} placeholder="-" onChange={(e) => handleUpdateMaterial(m.code, "productivity", parseFloat(e.target.value))} />
                      </td>
                      <td className="px-4 py-3">{cell(m, "priceUpdated")}</td>
                      <td className="px-4 py-3"><span className="text-sm text-slate-600">{m.category}</span></td>
                      <td className="px-4 py-3">{cell(m, "sheetBagBox")}</td>
                      <td className="px-4 py-3">{cell(m, "size")}</td>
                      <td className="px-4 py-3">{cell(m, "screwSpacing")}</td>
                      <td className="px-4 py-3">{cell(m, "width")}</td>
                      <td className="px-4 py-3">{cell(m, "gauge")}</td>
                      <td className="px-4 py-3">{cell(m, "flange")}</td>
                      <td className="px-4 py-3">
                        <input type="number" className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.hourlyRate ?? ""} placeholder="-" onChange={(e) => handleUpdateMaterial(m.code, "hourlyRate", parseFloat(e.target.value))} />
                      </td>
                      <td className="px-4 py-3">{cell(m, "note")}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          {(m.formulaQty || m.formulaSecQty || m.formulaCeilQty || m.formulaCeilSecQty) && (
                            <IconButton
                              icon={FileText}
                              variant="default"
                              size="sm"
                              onClick={() => setFormulaMaterial(m)}
                              tooltip="View/Edit Formulas"
                              className="text-blue-600"
                            />
                          )}
                          {isModified && (
                            <IconButton icon={Save} variant="success" size="sm" onClick={() => handleSaveInline(m.code)} disabled={isSaving} tooltip={isSaving ? "Saving..." : "Save changes"} />
                          )}
                          <IconButton icon={Trash2} variant="danger" size="sm" onClick={() => handleDeleteMaterial(m.code)} className="opacity-0 group-hover:opacity-100 transition-all" tooltip="Delete material" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Import Mode Modal */}
      <Modal
        isOpen={isImportModeModalOpen}
        onClose={() => { setIsImportModeModalOpen(false); setImportPendingData(null); }}
        title="Import Materials"
        size="md"
      >
        <ModalBody>
          <p className="text-sm text-slate-600 mb-1">
            <span className="font-semibold text-slate-800">{importPendingData?.validMaterials.length ?? 0} materials</span> ready to import.
            {(importPendingData?.invalidRows.length ?? 0) > 0 && (
              <span className="text-amber-600 ml-1">({importPendingData?.invalidRows.length} rows skipped due to errors)</span>
            )}
          </p>
          <p className="text-sm text-slate-500 mb-6">How would you like to import?</p>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleImportCommit("merge")}
              disabled={isCommittingImport}
              className="flex flex-col items-start gap-2 p-4 border-2 border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all text-left"
            >
              <span className="text-sm font-semibold text-slate-800">Merge</span>
              <span className="text-xs text-slate-500">Add new items and update existing ones. Keeps materials not in the file.</span>
            </button>
            <button
              onClick={() => handleImportCommit("replace")}
              disabled={isCommittingImport}
              className="flex flex-col items-start gap-2 p-4 border-2 border-slate-200 rounded-xl hover:border-red-400 hover:bg-red-50 transition-all text-left"
            >
              <span className="text-sm font-semibold text-slate-800">Replace All</span>
              <span className="text-xs text-slate-500">Delete all existing materials and replace with the imported data.</span>
            </button>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => { setIsImportModeModalOpen(false); setImportPendingData(null); }}
            disabled={isCommittingImport}
          >
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {/* Formula Modal */}
      <FormulaModal
        material={formulaMaterial}
        onClose={() => setFormulaMaterial(null)}
        onSave={handleSaveFormulas}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setMaterialToDelete(null); }}
        onConfirm={confirmDeleteMaterial}
        title="Delete Material"
        message={`Are you sure you want to delete "${materialToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Calc Productivity Confirmation Modal */}
      <ConfirmModal
        isOpen={isCalcProdModalOpen}
        onClose={() => setIsCalcProdModalOpen(false)}
        onConfirm={confirmCalcProductivity}
        title="Calculate Productivity"
        message="Auto-calculate Productivity from Cost (assuming $65/hr)? This will update productivity values for Labor items that don't have one set."
        confirmText="Calculate"
        cancelText="Cancel"
        variant="warning"
      />
    </div>
  );
};
