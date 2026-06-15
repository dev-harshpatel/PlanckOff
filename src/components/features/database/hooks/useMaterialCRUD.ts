"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MaterialDefinition } from "@/types";
import { extractUniqueCategories } from "@/lib/utils/materialValidation";
import { useToast } from "@/components/ui";

interface UseMaterialCRUDProps {
  materials: MaterialDefinition[];
  onUpdateMaterials: (materials: MaterialDefinition[]) => void;
}

/**
 * Owns all CRUD operations for the material database:
 * - Initial fetch on mount
 * - Add, save (update), delete
 * - Search + category filter state
 * - "Add new row" inline form state
 * - "Calculate productivity" batch operation
 * - Detail modal + delete confirmation modal state
 */
export const useMaterialCRUD = ({
  materials,
  onUpdateMaterials,
}: UseMaterialCRUDProps) => {
  const toast = useToast();

  const [dbCategory, setDbCategory] = useState<string>("All");
  const [dbSearch, setDbSearch] = useState("");
  const [isAddingMat, setIsAddingMat] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedMaterial, setSelectedMaterial] =
    useState<MaterialDefinition | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState<{
    code: string;
    name: string;
  } | null>(null);

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

  const categories = useMemo(() => {
    const cats = extractUniqueCategories(materials);
    return ["All", ...cats];
  }, [materials]);

  const filteredDbMaterials = useMemo(
    () =>
      materials.filter((m) => {
        const matchSearch =
          m.description.toLowerCase().includes(dbSearch.toLowerCase()) ||
          m.code.toLowerCase().includes(dbSearch.toLowerCase());
        const matchCat = dbCategory === "All" || m.category === dbCategory;
        return matchSearch && matchCat;
      }),
    [materials, dbCategory, dbSearch],
  );

  const visibleOptionalColumns = useMemo(() => {
    const optionalFields: (keyof MaterialDefinition)[] = [
      "size",
      "screwSpacing",
      "width",
      "gauge",
      "flange",
      "hourlyRate",
      "sheetBagBox",
    ];
    const visible: Record<string, boolean> = {};
    optionalFields.forEach((field) => {
      visible[field] = filteredDbMaterials.some((m) => {
        const val = m[field];
        return val !== undefined && val !== null && val !== "";
      });
    });
    return visible;
  }, [filteredDbMaterials]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run once on mount
  }, []);

  const handleUpdateNewMaterial = useCallback(
    (field: keyof MaterialDefinition, value: string | number | undefined) => {
      setNewMaterial((prev) => {
        const next = { ...prev, [field]: value };
        if (
          next.category === "Labor" &&
          (field === "hourlyRate" || field === "productivity")
        ) {
          const r = field === "hourlyRate" ? value : next.hourlyRate;
          const p = field === "productivity" ? value : next.productivity;
          if (typeof r === "number" && typeof p === "number" && r && p) {
            next.matCost = parseFloat((r / p).toFixed(2));
          } else {
            next.matCost = 0;
          }
        }
        return next;
      });
    },
    [],
  );

  const handleAddMaterial = useCallback(async () => {
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
      unitCost: newMaterial.unitCost,
      per:
        newMaterial.per ||
        (newMaterial.category === "Drywall" ||
        newMaterial.category === "Insulation"
          ? "1,000 SF"
          : newMaterial.category === "Framing"
            ? "1 LF"
            : "1 EA"),
      priceUpdated:
        newMaterial.priceUpdated || new Date().toISOString().slice(0, 10),
      category:
        (newMaterial.category as MaterialDefinition["category"]) || "Other",
      width: newMaterial.width,
      gauge: newMaterial.gauge,
      flange: newMaterial.flange,
      sizeOfUnit: newMaterial.sizeOfUnit,
      lengthCover: newMaterial.lengthCover,
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
          category: nextCat as MaterialDefinition["category"],
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
  }, [dbCategory, materials, newMaterial, onUpdateMaterials, toast]);

  const handleSaveMaterial = useCallback(
    async (updated: MaterialDefinition) => {
      try {
        const response = await fetch(
          `/api/materials/${encodeURIComponent(updated.code)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ updates: updated }),
          },
        );
        const data = await response.json();
        if (data.success) {
          onUpdateMaterials(
            materials.map((m) => (m.code === updated.code ? updated : m)),
          );
          toast.success("Saved", "Material updated successfully.");
        } else {
          toast.error("Save Failed", data.error || "Failed to save material.");
        }
      } catch (error) {
        console.error("Failed to save material:", error);
        toast.error("Save Failed", "An unexpected error occurred.");
      }
    },
    [materials, onUpdateMaterials, toast],
  );

  const openDeleteModal = useCallback((code: string, name: string) => {
    setMaterialToDelete({ code, name });
    setIsDeleteModalOpen(true);
  }, []);

  const confirmDeleteMaterial = useCallback(async () => {
    if (!materialToDelete) return;
    try {
      const response = await fetch(
        `/api/materials/${encodeURIComponent(materialToDelete.code)}`,
        { method: "DELETE" },
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
  }, [materialToDelete, materials, onUpdateMaterials, toast]);

  const handleDeleteFromModal = useCallback(
    (code: string) => {
      const material = materials.find((m) => m.code === code);
      openDeleteModal(code, material?.description || "Unknown");
    },
    [materials, openDeleteModal],
  );

  const confirmCalcProductivity = useCallback(() => {
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
  }, [materials, onUpdateMaterials, toast]);

  return {
    dbCategory,
    setDbCategory,
    dbSearch,
    setDbSearch,
    isAddingMat,
    setIsAddingMat,
    isLoading,
    selectedMaterial,
    setSelectedMaterial,
    isDeleteModalOpen,
    setIsDeleteModalOpen,
    materialToDelete,
    setMaterialToDelete,
    isCalcProdModalOpen,
    setIsCalcProdModalOpen,
    newMaterial,
    categories,
    filteredDbMaterials,
    visibleOptionalColumns,
    handleUpdateNewMaterial,
    handleAddMaterial,
    handleSaveMaterial,
    openDeleteModal,
    confirmDeleteMaterial,
    handleDeleteFromModal,
    confirmCalcProductivity,
  };
};
