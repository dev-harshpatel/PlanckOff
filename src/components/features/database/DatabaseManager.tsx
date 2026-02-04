"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Database,
  Download,
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
  const [materialToDelete, setMaterialToDelete] = useState<{
    code: string;
    name: string;
  } | null>(null);

  // Calc productivity confirmation state
  const [isCalcProdModalOpen, setIsCalcProdModalOpen] = useState(false);

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
      per:
        newMaterial.per ||
        (newMaterial.category === "Drywall" ||
        newMaterial.category === "Insulation"
          ? "1,000 SF"
          : newMaterial.category === "Framing"
            ? "1 LF"
            : "1 EA"),
      priceUpdated: newMaterial.priceUpdated || new Date().toLocaleDateString(),
      category: (newMaterial.category as any) || "Other",
      width: newMaterial.width,
      gauge: newMaterial.gauge,
      flange: newMaterial.flange,
      productivity: newMaterial.productivity,
      hourlyRate: newMaterial.hourlyRate,
    };

    try {
      // Save to database immediately
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
          per:
            nextCat === "Drywall" || nextCat === "Insulation"
              ? "1,000 SF"
              : nextCat === "Framing"
                ? "1 LF"
                : "1 EA",
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

  const handleUpdateNewMaterial = (
    field: keyof MaterialDefinition,
    value: any,
  ) => {
    setNewMaterial((prev) => {
      const next = { ...prev, [field]: value };
      if (
        next.category === "Labor" &&
        (field === "hourlyRate" || field === "productivity")
      ) {
        const r = field === "hourlyRate" ? value : next.hourlyRate;
        const p = field === "productivity" ? value : next.productivity;
        if (r && p) {
          next.matCost = parseFloat((r / p).toFixed(2));
        } else {
          next.matCost = 0;
        }
      }
      return next;
    });
  };

  const handleUpdateMaterial = (
    code: string,
    field: keyof MaterialDefinition,
    value: any,
  ) => {
    const updated = materials.map((m) => {
      if (m.code === code) {
        const newItem = { ...m, [field]: value };
        if (m.category === "Labor") {
          if (field === "hourlyRate" || field === "productivity") {
            const r = field === "hourlyRate" ? value : newItem.hourlyRate;
            const p = field === "productivity" ? value : newItem.productivity;
            if (r && p) {
              newItem.matCost = parseFloat((r / p).toFixed(2));
            } else {
              newItem.matCost = 0;
            }
          }
        }
        return newItem;
      }
      return m;
    });
    onUpdateMaterials(updated);

    // Mark row as modified
    setModifiedRows((prev) => new Set(prev).add(code));
  };

  // Save single material (inline save)
  const handleSaveInline = async (code: string) => {
    const material = materials.find((m) => m.code === code);
    if (!material) return;

    try {
      setSavingRows((prev) => new Set(prev).add(code));

      const response = await fetch(
        `/api/materials/${encodeURIComponent(code)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates: material }),
        },
      );

      const data = await response.json();

      if (data.success) {
        setModifiedRows((prev) => {
          const next = new Set(prev);
          next.delete(code);
          return next;
        });
        toast.success("Saved", "Material updated successfully.");
      } else {
        toast.error("Save Failed", data.error || "Failed to save material.");
      }
    } catch (error) {
      console.error("Failed to save material:", error);
      toast.error("Save Failed", "An unexpected error occurred.");
    } finally {
      setSavingRows((prev) => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
    }
  };

  // Save all modified materials (bulk save)
  const handleSaveModified = async () => {
    if (modifiedRows.size === 0) return;

    try {
      setIsSavingBulk(true);

      const modifiedMaterials = materials.filter((m) =>
        modifiedRows.has(m.code),
      );

      const response = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materials: modifiedMaterials, mode: "upsert" }),
      });

      const data = await response.json();

      if (data.success) {
        setModifiedRows(new Set());
        toast.success(
          "Saved",
          `Successfully saved ${modifiedMaterials.length} materials.`,
        );
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
      const response = await fetch(
        `/api/materials/${encodeURIComponent(materialToDelete.code)}`,
        {
          method: "DELETE",
        },
      );

      const data = await response.json();

      if (data.success) {
        onUpdateMaterials(
          materials.filter((m) => m.code !== materialToDelete.code),
        );
        toast.success(
          "Material Deleted",
          `"${materialToDelete.name}" has been removed.`,
        );
      } else {
        toast.error(
          "Delete Failed",
          data.error || "Failed to delete material.",
        );
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

  const handleImportDatabase = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];

      // Read with defval option to include empty cells and get ALL columns
      const jsonData = utils.sheet_to_json(worksheet, {
        defval: "", // Use empty string for empty cells instead of skipping them
        blankrows: false, // Skip blank rows
      }) as Record<string, any>[];

      if (jsonData.length === 0) {
        toast.error("Import Failed", "The Excel file is empty.");
        return;
      }

      // Get headers and normalize
      const headers = Object.keys(jsonData[0] || {});
      const headerMap = normalizeExcelHeaders(headers);

      // Check if there are unnamed columns (like __EMPTY, __EMPTY_1, etc from xlsx)
      // These are additional columns without headers
      const unnamedColumns = headers.filter((h) => h.startsWith("__EMPTY"));

      // If we have exactly 3 unnamed columns after the 11 known columns,
      // they are likely width, gauge, flange
      if (unnamedColumns.length >= 3) {
        // Map the first 3 unnamed columns to width, gauge, flange
        headerMap[unnamedColumns[0]] = "width";
        headerMap[unnamedColumns[1]] = "gauge";
        headerMap[unnamedColumns[2]] = "flange";
      }

      // Validate required columns
      const requiredFields = ["code", "description", "category"];
      const hasRequiredFields = requiredFields.every((field) =>
        Object.values(headerMap).includes(field),
      );

      if (!hasRequiredFields) {
        const missing = requiredFields.filter(
          (field) => !Object.values(headerMap).includes(field),
        );
        toast.error(
          "Import Failed",
          `Missing required columns: ${missing.join(", ")}`,
        );
        return;
      }

      // Validate and transform data
      const { validMaterials, invalidRows } = validateMaterialsBatch(
        jsonData,
        headerMap,
      );

      if (invalidRows.length > 0 && validMaterials.length === 0) {
        toast.error(
          "Import Failed",
          `All ${invalidRows.length} rows have validation errors.`,
        );
        return;
      }

      // Merge with existing materials (update duplicates, add new ones)
      const existingCodesMap = new Map(materials.map((m) => [m.code, m]));
      const newMaterials: MaterialDefinition[] = [];
      const updatedMaterials: MaterialDefinition[] = [];

      validMaterials.forEach((importedMaterial) => {
        if (existingCodesMap.has(importedMaterial.code)) {
          // Material exists - it will be updated
          updatedMaterials.push(importedMaterial);
        } else {
          // New material
          newMaterials.push(importedMaterial);
        }
      });

      // Create updated materials list
      const finalMaterials = materials.map((existing) => {
        const updated = validMaterials.find((v) => v.code === existing.code);
        return updated || existing;
      });

      // Add brand new materials
      const updatedMaterialsList = [...finalMaterials, ...newMaterials];

      // Update state with merged materials
      onUpdateMaterials(updatedMaterialsList);

      // Mark all imported/updated materials as modified so Save button appears
      setModifiedRows((prev) => {
        const next = new Set(prev);
        validMaterials.forEach((m) => next.add(m.code));
        return next;
      });

      // Show summary toast
      let message = "";
      if (newMaterials.length > 0) {
        message += `Added ${newMaterials.length} new materials.`;
      }
      if (updatedMaterials.length > 0) {
        if (message) message += " ";
        message += `Updated ${updatedMaterials.length} existing materials.`;
      }
      if (invalidRows.length > 0) {
        if (message) message += " ";
        message += `${invalidRows.length} rows had errors.`;
      }

      toast.success("Import Complete", message || "No changes detected.");
    } catch (err) {
      console.error("Import failed", err);
      toast.error(
        "Import Failed",
        "Failed to import database. Ensure the file format is correct.",
      );
    } finally {
      setIsImporting(false);
      e.target.value = "";
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
    toast.success(
      "Calculation Complete",
      "Productivity values have been updated.",
    );
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
          <Button
            variant="secondary"
            icon={Download}
            onClick={handleExportDatabase}
          >
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
            disabled={isImporting}
          >
            {isImporting ? "Importing..." : "Import"}
          </Button>
          <Button
            variant="secondary"
            icon={Database}
            onClick={() => setIsCalcProdModalOpen(true)}
          >
            Calc Prod
          </Button>
          {onClose && <CloseButton onClick={onClose} size="md" />}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Fixed Sidebar - No horizontal scroll */}
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
                  category:
                    cat === "All" ? (categories[1] as any) : (cat as any),
                  per:
                    cat === "Drywall" || cat === "Insulation"
                      ? "1,000 SF"
                      : cat === "Framing"
                        ? "1 LF"
                        : "1 EA",
                }));
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${dbCategory === cat ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Scrollable Data Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Bar + Action Buttons */}
          <div className="p-4 border-b border-slate-200 flex gap-4 items-center flex-shrink-0">
            <div className="flex-1">
              <SearchInput
                value={dbSearch}
                onValueChange={setDbSearch}
                placeholder="Search by code, description, or manufacturer..."
              />
            </div>
            {modifiedRows.size > 0 && (
              <Button
                variant="primary"
                icon={Save}
                onClick={handleSaveModified}
                disabled={isSavingBulk}
                isLoading={isSavingBulk}
              >
                Save ({modifiedRows.size})
              </Button>
            )}
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => setIsAddingMat(true)}
            >
              Add New Item
            </Button>
          </div>

          {/* Horizontal + Vertical Scrollable Table */}
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            <table className="text-left" style={{ minWidth: "max-content" }}>
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-32">
                    Code
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">
                    Section
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-32">
                    Mat Cost Code
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-32">
                    Labor Cost Code
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-32">
                    Type
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-36">
                    Manufacturer
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 min-w-64">
                    Description
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28 text-right">
                    Mat Cost
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">
                    Per
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-32">
                    Price Updated
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">
                    Category
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">
                    Width
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">
                    Gauge
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">
                    Flange
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">
                    Productivity
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">
                    Hourly Rate
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isAddingMat && (
                  <tr className="bg-blue-50 animate-in fade-in duration-300">
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1"
                        placeholder="Code"
                        disabled
                        value="Auto"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1"
                        placeholder="09 22 16"
                        value={newMaterial.section}
                        onChange={(e) =>
                          setNewMaterial({
                            ...newMaterial,
                            section: e.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1"
                        placeholder="MAT CODE"
                        value={newMaterial.matCostCode || ""}
                        onChange={(e) =>
                          setNewMaterial({
                            ...newMaterial,
                            matCostCode: e.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1"
                        placeholder="LABOR CODE"
                        value={newMaterial.laborCostCode || ""}
                        onChange={(e) =>
                          setNewMaterial({
                            ...newMaterial,
                            laborCostCode: e.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1"
                        placeholder="Material"
                        value={newMaterial.type || ""}
                        onChange={(e) =>
                          setNewMaterial({
                            ...newMaterial,
                            type: e.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1"
                        placeholder="Manufacturer"
                        value={newMaterial.manufacturer || ""}
                        onChange={(e) =>
                          setNewMaterial({
                            ...newMaterial,
                            manufacturer: e.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1"
                        placeholder="Description"
                        value={newMaterial.description || ""}
                        onChange={(e) =>
                          setNewMaterial({
                            ...newMaterial,
                            description: e.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1 text-right"
                        placeholder="0"
                        value={newMaterial.matCost || ""}
                        onChange={(e) =>
                          handleUpdateNewMaterial(
                            "matCost",
                            parseFloat(e.target.value),
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1"
                        placeholder="1 EA"
                        value={newMaterial.per || ""}
                        onChange={(e) =>
                          handleUpdateNewMaterial("per", e.target.value)
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1"
                        placeholder="MM/DD/YYYY"
                        value={newMaterial.priceUpdated || ""}
                        onChange={(e) =>
                          setNewMaterial({
                            ...newMaterial,
                            priceUpdated: e.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1"
                        disabled
                        value={newMaterial.category || ""}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1"
                        placeholder='3-5/8"'
                        value={newMaterial.width || ""}
                        onChange={(e) =>
                          setNewMaterial({
                            ...newMaterial,
                            width: e.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1"
                        placeholder="20ga"
                        value={newMaterial.gauge || ""}
                        onChange={(e) =>
                          setNewMaterial({
                            ...newMaterial,
                            gauge: e.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1"
                        placeholder='1-5/8"'
                        value={newMaterial.flange || ""}
                        onChange={(e) =>
                          setNewMaterial({
                            ...newMaterial,
                            flange: e.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1"
                        placeholder="100"
                        value={newMaterial.productivity || ""}
                        onChange={(e) =>
                          handleUpdateNewMaterial(
                            "productivity",
                            parseFloat(e.target.value),
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="w-full text-sm border border-blue-300 rounded px-2 py-1"
                        placeholder="$65"
                        value={newMaterial.hourlyRate || ""}
                        onChange={(e) =>
                          handleUpdateNewMaterial(
                            "hourlyRate",
                            parseFloat(e.target.value),
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-2 text-right flex gap-1 justify-end">
                      <IconButton
                        icon={Save}
                        variant="success"
                        onClick={handleAddMaterial}
                        tooltip="Save material"
                      />
                      <IconButton
                        icon={X}
                        variant="default"
                        onClick={() => setIsAddingMat(false)}
                        tooltip="Cancel"
                      />
                    </td>
                  </tr>
                )}
                {filteredDbMaterials.map((m) => {
                  const isModified = modifiedRows.has(m.code);
                  const isSaving = savingRows.has(m.code);

                  return (
                    <tr
                      key={m.code}
                      className={`group transition-colors ${isModified ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-slate-50"}`}
                    >
                      <td className="px-4 py-3 text-sm font-mono text-slate-500">
                        {m.code}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1"
                          value={m.section}
                          onChange={(e) =>
                            handleUpdateMaterial(
                              m.code,
                              "section",
                              e.target.value,
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1"
                          value={m.matCostCode}
                          onChange={(e) =>
                            handleUpdateMaterial(
                              m.code,
                              "matCostCode",
                              e.target.value,
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1"
                          value={m.laborCostCode || ""}
                          onChange={(e) =>
                            handleUpdateMaterial(
                              m.code,
                              "laborCostCode",
                              e.target.value,
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1"
                          value={m.type}
                          onChange={(e) =>
                            handleUpdateMaterial(m.code, "type", e.target.value)
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1"
                          value={m.manufacturer}
                          onChange={(e) =>
                            handleUpdateMaterial(
                              m.code,
                              "manufacturer",
                              e.target.value,
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-full bg-transparent border-none text-sm text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1"
                          value={m.description}
                          onChange={(e) =>
                            handleUpdateMaterial(
                              m.code,
                              "description",
                              e.target.value,
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          className="w-full bg-transparent border-none text-sm text-slate-800 text-right focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1"
                          value={m.matCost}
                          onChange={(e) =>
                            handleUpdateMaterial(
                              m.code,
                              "matCost",
                              parseFloat(e.target.value),
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-full bg-transparent border-none text-sm text-slate-500 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1"
                          value={m.per}
                          onChange={(e) =>
                            handleUpdateMaterial(m.code, "per", e.target.value)
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-full bg-transparent border-none text-sm text-slate-500 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1"
                          value={m.priceUpdated || ""}
                          onChange={(e) =>
                            handleUpdateMaterial(
                              m.code,
                              "priceUpdated",
                              e.target.value,
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-600">
                          {m.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1"
                          value={m.width || ""}
                          placeholder="-"
                          onChange={(e) =>
                            handleUpdateMaterial(
                              m.code,
                              "width",
                              e.target.value,
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1"
                          value={m.gauge || ""}
                          placeholder="-"
                          onChange={(e) =>
                            handleUpdateMaterial(
                              m.code,
                              "gauge",
                              e.target.value,
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1"
                          value={m.flange || ""}
                          placeholder="-"
                          onChange={(e) =>
                            handleUpdateMaterial(
                              m.code,
                              "flange",
                              e.target.value,
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1"
                          value={m.productivity || ""}
                          placeholder="-"
                          onChange={(e) =>
                            handleUpdateMaterial(
                              m.code,
                              "productivity",
                              parseFloat(e.target.value),
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1"
                          value={m.hourlyRate || ""}
                          placeholder="-"
                          onChange={(e) =>
                            handleUpdateMaterial(
                              m.code,
                              "hourlyRate",
                              parseFloat(e.target.value),
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          {isModified && (
                            <IconButton
                              icon={Save}
                              variant="success"
                              size="sm"
                              onClick={() => handleSaveInline(m.code)}
                              disabled={isSaving}
                              tooltip={isSaving ? "Saving..." : "Save changes"}
                            />
                          )}
                          <IconButton
                            icon={Trash2}
                            variant="danger"
                            size="sm"
                            onClick={() => handleDeleteMaterial(m.code)}
                            className="opacity-0 group-hover:opacity-100 transition-all"
                            tooltip="Delete material"
                          />
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

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setMaterialToDelete(null);
        }}
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
