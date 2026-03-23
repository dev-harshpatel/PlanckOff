"use client";

import React, { useEffect, useState } from "react";
import {
  Calculator,
  CalendarDays,
  Database,
  Download,
  Loader2,
  Package,
  Plus,
  Ruler,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
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
import { MaterialImportModal } from "./MaterialImportModal";
import { MaterialTableRow } from "./MaterialTableRow";
import { useMaterialCRUD } from "./hooks/useMaterialCRUD";
import { useMaterialImport } from "./hooks/useMaterialImport";

interface DatabaseManagerProps {
  materials: MaterialDefinition[];
  onUpdateMaterials: (materials: MaterialDefinition[]) => void;
  onClose?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalizes any date-like value (Excel serial, "M/D/YYYY", ISO, etc.) to
 * "YYYY-MM-DD" for use with <input type="date">.
 */
const normalizeToISODate = (raw: string): string => {
  if (!raw) return "";
  const trimmed = raw.trim();

  if (/^\d+$/.test(trimmed) && parseInt(trimmed) > 30000) {
    const utcDays = parseInt(trimmed) - 25569;
    const d = new Date(utcDays * 86400 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }

  return "";
};

// ─── DateField ────────────────────────────────────────────────────────────────
// Defined outside the modal so the native date picker doesn't remount on re-render

const DateField: React.FC<{
  value: string | undefined;
  onChange: (val: string | undefined) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled = false }) => {
  const dateValue = normalizeToISODate(value ?? "");
  const formattedDisplay = dateValue
    ? new Date(dateValue + "T00:00:00").toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "No date set";

  const inputStyles = [
    "w-full rounded-lg px-3 py-2.5 text-sm transition-all border cursor-pointer",
    "focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400",
    disabled
      ? "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
      : "bg-white border-slate-200 text-slate-700 hover:border-slate-300",
  ].join(" ");

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        <CalendarDays className="w-3 h-3" />
        Price Updated
      </label>
      <input
        type="date"
        className={inputStyles}
        value={dateValue}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
      <div className="text-[10px] text-slate-400">{formattedDisplay}</div>
    </div>
  );
};

// ─── Material Detail Modal ────────────────────────────────────────────────────

interface MaterialDetailModalProps {
  material: MaterialDefinition | null;
  onClose: () => void;
  onSave: (updated: MaterialDefinition) => void;
  onDelete: (code: string) => void;
}

type TabType = "general" | "specs" | "formulas";

const TAB_CONFIG: {
  id: TabType;
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: "general", label: "General", icon: Package },
  { id: "specs", label: "Specifications", icon: Ruler },
  { id: "formulas", label: "Formulas", icon: Calculator },
];

const MaterialDetailModal: React.FC<MaterialDetailModalProps> = ({
  material,
  onClose,
  onSave,
  onDelete,
}) => {
  const [formData, setFormData] = useState<MaterialDefinition | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("general");

  useEffect(() => {
    if (material) {
      setFormData({ ...material });
      setActiveTab("general");
    }
  }, [material]);

  if (!material || !formData) return null;

  const handleFieldChange = (
    field: keyof MaterialDefinition,
    value: string | number | undefined,
  ) => {
    setFormData((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSave = () => {
    if (!formData) return;

    const hasNonDateChanges = (
      Object.keys(formData) as (keyof MaterialDefinition)[]
    ).some((key) => key !== "priceUpdated" && formData[key] !== material[key]);
    const dateWasManuallyChanged =
      formData.priceUpdated !== material.priceUpdated;

    const toSave =
      hasNonDateChanges && !dateWasManuallyChanged
        ? { ...formData, priceUpdated: new Date().toISOString().slice(0, 10) }
        : formData;

    onSave(toSave);
    onClose();
  };

  const handleDelete = () => {
    onDelete(material.code);
    onClose();
  };

  const Field = ({
    label,
    field,
    type = "text",
    disabled = false,
    placeholder = "",
    rows,
    isFormula = false,
  }: {
    label: string;
    field: keyof MaterialDefinition;
    type?: "text" | "number" | "textarea";
    disabled?: boolean;
    placeholder?: string;
    rows?: number;
    isFormula?: boolean;
  }) => {
    const value = formData[field];
    const displayValue =
      value !== undefined && value !== null ? String(value) : "";

    const baseInputStyles = `
      w-full rounded-lg px-3 py-2.5 text-sm transition-all
      border focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400
      ${
        disabled
          ? "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
          : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
      }
    `;

    const formulaStyles = `
      w-full rounded-lg px-3 py-2.5 text-xs transition-all font-mono leading-relaxed
      bg-slate-900 text-emerald-300 border border-slate-700 
      placeholder-slate-500
      focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500
      resize-none
    `;

    if (type === "textarea") {
      return (
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {label}
          </label>
          <textarea
            className={
              isFormula ? formulaStyles : `${baseInputStyles} resize-none`
            }
            value={displayValue}
            placeholder={placeholder}
            rows={rows ?? 3}
            disabled={disabled}
            onChange={(e) =>
              handleFieldChange(field, e.target.value || undefined)
            }
            spellCheck={false}
          />
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {label}
        </label>
        <input
          type={type}
          className={baseInputStyles}
          value={displayValue}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            const val = e.target.value;
            if (type === "number") {
              handleFieldChange(
                field,
                val === "" ? undefined : parseFloat(val),
              );
            } else {
              handleFieldChange(field, val || undefined);
            }
          }}
        />
      </div>
    );
  };

  return (
    <Modal
      isOpen={!!material}
      onClose={onClose}
      size="xl"
      closeOnOverlayClick={false}
      showCloseButton={false}
    >
      {/* Custom Dark Header */}
      <div className="bg-slate-900 text-white px-5 py-4 flex items-start justify-between rounded-t-xl">
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40">
              <Package className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-bold text-white">
                Material Details
              </span>
              <span className="text-[10px] font-mono bg-slate-700 text-emerald-300 px-2 py-0.5 rounded border border-slate-600 shrink-0">
                {material.code}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400 truncate ml-[42px] max-w-md">
            {material.description}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-500/30 uppercase tracking-wide">
            {material.category || "Uncategorized"}
          </span>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-slate-50 border-b border-slate-200 px-5">
        <div className="flex items-center gap-1">
          {TAB_CONFIG.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-xs font-semibold transition-all
                  border-b-2 -mb-px
                  ${
                    isActive
                      ? "border-emerald-500 text-emerald-600 bg-white/60"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/40"
                  }
                `}
              >
                <Icon
                  className={`w-3.5 h-3.5 ${isActive ? "text-emerald-500" : "text-slate-400"}`}
                />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Body */}
      <div className="p-5 bg-slate-50 max-h-[60vh] overflow-y-auto">
        {activeTab === "general" && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Identification
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Code" field="code" disabled />
                <Field label="Section" field="section" placeholder="09 22 16" />
                <Field
                  label="Cost Code"
                  field="matCostCode"
                  placeholder="METAL FRAMING"
                />
                <Field
                  label="Labor Code"
                  field="laborCostCode"
                  placeholder="103"
                />
                <Field label="Type" field="type" placeholder="Division 09" />
                <Field
                  label="Manufacturer"
                  field="manufacturer"
                  placeholder="Generic"
                />
              </div>
              <div className="mt-4">
                <Field
                  label="Description"
                  field="description"
                  placeholder="Material description"
                />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-amber-500 rounded-full" />
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Pricing & Units
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field
                  label="Unit Cost"
                  field="matCost"
                  type="number"
                  placeholder="0.00"
                />
                <Field
                  label="Size of Unit"
                  field="sizeOfUnit"
                  type="number"
                  placeholder="e.g. 32 for 4x8 sheet, 1 for EA"
                />
                <Field label="Unit (Per)" field="per" placeholder="1 EA" />
                <Field label="Category" field="category" disabled />
                <DateField
                  value={formData.priceUpdated}
                  onChange={(val) => handleFieldChange("priceUpdated", val)}
                />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-blue-500 rounded-full" />
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Labor & Productivity
                </h3>
              </div>
              {formData.sizeOfUnit != null &&
                formData.sizeOfUnit > 0 &&
                (formData.unitCost ?? formData.matCost) != null &&
                (formData.unitCost ?? formData.matCost)! > 0 && (
                  <div className="mb-4 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100 text-xs text-emerald-700">
                    <span className="font-semibold">Prod. Rate (computed):</span>{" "}
                    {(formData.unitCost ?? formData.matCost)! /
                      formData.sizeOfUnit}{" "}
                    <span className="text-emerald-600">
                      (Unit Cost ÷ Size of Unit)
                    </span>
                  </div>
                )}
              <div className="grid grid-cols-3 gap-4">
                <Field
                  label="Productivity (fallback when no Size of Unit)"
                  field="productivity"
                  type="number"
                  placeholder="0"
                />
                <Field
                  label="Hourly Rate"
                  field="hourlyRate"
                  type="number"
                  placeholder="0.00"
                />
                <Field
                  label="Cover Per Hour"
                  field="coverPerHour"
                  type="number"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-slate-400 rounded-full" />
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Notes
                </h3>
              </div>
              <Field
                label="Additional Notes"
                field="note"
                type="textarea"
                placeholder="Enter any additional notes..."
                rows={2}
              />
            </div>
          </div>
        )}

        {activeTab === "specs" && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 bg-purple-500 rounded-full" />
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Physical Specifications
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Width" field="width" placeholder='3-5/8"' />
              <Field label="Gauge" field="gauge" placeholder="20ga" />
              <Field label="Flange" field="flange" placeholder='1-5/8"' />
              <Field label="Size" field="size" placeholder='5/8"' />
              <Field
                label="Screw Spacing"
                field="screwSpacing"
                placeholder='12"'
              />
              <Field
                label="Sheet/Bag/Box Size"
                field="sheetBagBox"
                placeholder="4x8"
              />
              <Field
                label="Sheet/Bag/Box Units"
                field="sheetBagBoxSizeUnits"
                placeholder="SHEET"
              />
              <Field
                label="Area/Length Cover"
                field="lengthCover"
                placeholder="e.g. 450 SF coverage"
              />
              <Field
                label="Cover Units"
                field="lengthCoverUnits"
                placeholder="SF"
              />
            </div>
          </div>
        )}

        {activeTab === "formulas" && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Wall Formulas
                  </h3>
                </div>
                <span className="text-[9px] font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200">
                  For wall assemblies
                </span>
              </div>
              <div className="space-y-4">
                <div className="flex gap-3 items-stretch">
                  <div className="flex-1 flex flex-col">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Formula for Qty
                    </label>
                    <textarea
                      className="flex-1 w-full rounded-lg px-3 py-2.5 text-xs transition-all font-mono leading-relaxed bg-slate-900 text-emerald-300 border border-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500 resize-none"
                      value={formData.formulaQty || ""}
                      placeholder="e.g. Length * Height * (1 + Wastage) * layer"
                      rows={2}
                      onChange={(e) =>
                        handleFieldChange(
                          "formulaQty",
                          e.target.value || undefined,
                        )
                      }
                      spellCheck={false}
                    />
                  </div>
                  <div className="w-20 flex flex-col">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      MOU
                    </label>
                    <textarea
                      className="flex-1 w-full rounded-lg px-3 py-2.5 text-sm transition-all border focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400 bg-white border-slate-200 text-slate-700 hover:border-slate-300 resize-none text-center"
                      value={formData.mouWall || ""}
                      placeholder="SF"
                      onChange={(e) =>
                        handleFieldChange(
                          "mouWall",
                          e.target.value || undefined,
                        )
                      }
                    />
                  </div>
                </div>
                <div className="flex gap-3 items-stretch">
                  <div className="flex-1 flex flex-col">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Formula for Sec. Qty
                    </label>
                    <textarea
                      className="flex-1 w-full rounded-lg px-3 py-2.5 text-xs transition-all font-mono leading-relaxed bg-slate-900 text-emerald-300 border border-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500 resize-none"
                      value={formData.formulaSecQty || ""}
                      placeholder="e.g. (Length * Height * (1 + Wastage) * layer) / sheet area"
                      rows={2}
                      onChange={(e) =>
                        handleFieldChange(
                          "formulaSecQty",
                          e.target.value || undefined,
                        )
                      }
                      spellCheck={false}
                    />
                  </div>
                  <div className="w-20 flex flex-col">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      MOU
                    </label>
                    <textarea
                      className="flex-1 w-full rounded-lg px-3 py-2.5 text-sm transition-all border focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400 bg-white border-slate-200 text-slate-700 hover:border-slate-300 resize-none text-center"
                      value={formData.mouWallSec || ""}
                      placeholder="EA"
                      onChange={(e) =>
                        handleFieldChange(
                          "mouWallSec",
                          e.target.value || undefined,
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-sky-500 rounded-full" />
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Ceiling Formulas
                  </h3>
                </div>
                <span className="text-[9px] font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200">
                  For ceiling assemblies
                </span>
              </div>
              <div className="space-y-4">
                <div className="flex gap-3 items-stretch">
                  <div className="flex-1 flex flex-col">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Ceiling Formula for Qty
                    </label>
                    <textarea
                      className="flex-1 w-full rounded-lg px-3 py-2.5 text-xs transition-all font-mono leading-relaxed bg-slate-900 text-emerald-300 border border-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500 resize-none"
                      value={formData.formulaCeilQty || ""}
                      placeholder="e.g. (Ceiling Area) * (1 + Wastage)"
                      rows={2}
                      onChange={(e) =>
                        handleFieldChange(
                          "formulaCeilQty",
                          e.target.value || undefined,
                        )
                      }
                      spellCheck={false}
                    />
                  </div>
                  <div className="w-20 flex flex-col">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      MOU
                    </label>
                    <textarea
                      className="flex-1 w-full rounded-lg px-3 py-2.5 text-sm transition-all border focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400 bg-white border-slate-200 text-slate-700 hover:border-slate-300 resize-none text-center"
                      value={formData.mouCeil || ""}
                      placeholder="SF"
                      onChange={(e) =>
                        handleFieldChange(
                          "mouCeil",
                          e.target.value || undefined,
                        )
                      }
                    />
                  </div>
                </div>
                <div className="flex gap-3 items-stretch">
                  <div className="flex-1 flex flex-col">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Ceiling Formula for Sec. Qty
                    </label>
                    <textarea
                      className="flex-1 w-full rounded-lg px-3 py-2.5 text-xs transition-all font-mono leading-relaxed bg-slate-900 text-emerald-300 border border-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500 resize-none"
                      value={formData.formulaCeilSecQty || ""}
                      placeholder="e.g. ((Ceiling Area) * (1 + Wastage)) / sheet area"
                      rows={2}
                      onChange={(e) =>
                        handleFieldChange(
                          "formulaCeilSecQty",
                          e.target.value || undefined,
                        )
                      }
                      spellCheck={false}
                    />
                  </div>
                  <div className="w-20 flex flex-col">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      MOU
                    </label>
                    <textarea
                      className="flex-1 w-full rounded-lg px-3 py-2.5 text-sm transition-all border focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400 bg-white border-slate-200 text-slate-700 hover:border-slate-300 resize-none text-center"
                      value={formData.mouCeilSec || ""}
                      placeholder="EA"
                      onChange={(e) =>
                        handleFieldChange(
                          "mouCeilSec",
                          e.target.value || undefined,
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-3 py-2.5 bg-blue-50 rounded-lg border border-blue-100 text-[10px] text-blue-600">
              <span className="font-bold">Tip:</span> Use variables like{" "}
              <code className="font-mono bg-blue-100 px-1 rounded">Length</code>
              ,{" "}
              <code className="font-mono bg-blue-100 px-1 rounded">Height</code>
              ,{" "}
              <code className="font-mono bg-blue-100 px-1 rounded">
                Wastage
              </code>
              ,{" "}
              <code className="font-mono bg-blue-100 px-1 rounded">layer</code>
              ,{" "}
              <code className="font-mono bg-blue-100 px-1 rounded">
                sheet area
              </code>
              ,{" "}
              <code className="font-mono bg-blue-100 px-1 rounded">
                Ceiling Area
              </code>{" "}
              — operators:{" "}
              <code className="font-mono bg-blue-100 px-1 rounded">
                + - * / ( )
              </code>
              . MOU = Measure of Unit (output unit, e.g. SF, EA, LF)
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-200 bg-white flex items-center justify-between rounded-b-xl">
        <Button variant="danger" size="sm" icon={Trash2} onClick={handleDelete}>
          Delete
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" icon={Save} onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const DatabaseManager: React.FC<DatabaseManagerProps> = ({
  materials,
  onUpdateMaterials,
  onClose,
}) => {
  const crud = useMaterialCRUD({ materials, onUpdateMaterials });
  const importExport = useMaterialImport({ materials, onUpdateMaterials });

  if (crud.isLoading) {
    return (
      <div className="flex flex-col h-full bg-white items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
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
            <Database className="w-6 h-6 text-emerald-600" /> Material Database
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Master catalog with {materials.length} items.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            icon={Upload}
            onClick={importExport.handleExportDatabase}
          >
            Export
          </Button>
          <input
            ref={importExport.importInputRef}
            type="file"
            accept=".xlsx, .csv"
            className="hidden"
            onChange={importExport.handleImportDatabase}
            disabled={importExport.isImporting}
          />
          <Button
            variant="secondary"
            icon={Download}
            onClick={() => importExport.importInputRef.current?.click()}
            disabled={
              importExport.isImporting || importExport.isCommittingImport
            }
            isLoading={
              importExport.isImporting || importExport.isCommittingImport
            }
          >
            {importExport.isCommittingImport
              ? "Saving..."
              : importExport.isImporting
                ? "Reading..."
                : "Import"}
          </Button>
          <Button
            variant="secondary"
            icon={Database}
            onClick={() => crud.setIsCalcProdModalOpen(true)}
          >
            Calc Prod
          </Button>
          {onClose && <CloseButton onClick={onClose} size="md" />}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Category Sidebar */}
        <div className="w-64 border-r border-slate-200 bg-slate-50 p-4 space-y-1 flex-shrink-0">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">
            Categories
          </div>
          {crud.categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                crud.setDbCategory(cat);
                // Keep the inline-add form category in sync
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                crud.dbCategory === cat
                  ? "bg-emerald-100 text-emerald-700"
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
                value={crud.dbSearch}
                onValueChange={crud.setDbSearch}
                placeholder="Search by code, description, or manufacturer..."
              />
            </div>
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => crud.setIsAddingMat(true)}
            >
              Add New Item
            </Button>
          </div>

          {/* Table */}
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
                    Cost Code
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
                    Unit Cost
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">
                    Unit
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">
                    Size of Unit
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">
                    Prod. Rate
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">
                    Category
                  </th>
                  {crud.visibleOptionalColumns.sheetBagBox && (
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">
                      Sheet/Bag/Box
                    </th>
                  )}
                  {crud.visibleOptionalColumns.size && (
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">
                      Size
                    </th>
                  )}
                  {crud.visibleOptionalColumns.screwSpacing && (
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">
                      Screw Spacing
                    </th>
                  )}
                  {crud.visibleOptionalColumns.width && (
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">
                      Width
                    </th>
                  )}
                  {crud.visibleOptionalColumns.gauge && (
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">
                      Gauge
                    </th>
                  )}
                  {crud.visibleOptionalColumns.flange && (
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">
                      Flange
                    </th>
                  )}
                  {crud.visibleOptionalColumns.hourlyRate && (
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">
                      Hourly Rate
                    </th>
                  )}
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Inline add new row */}
                {crud.isAddingMat && (
                  <tr className="bg-emerald-50 animate-in fade-in duration-300">
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                        placeholder="Code"
                        disabled
                        value="Auto"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                        placeholder="09 22 16"
                        value={crud.newMaterial.section ?? ""}
                        onChange={(e) =>
                          crud.handleUpdateNewMaterial("section", e.target.value)
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                        placeholder="GEN"
                        value={crud.newMaterial.matCostCode ?? ""}
                        onChange={(e) =>
                          crud.handleUpdateNewMaterial(
                            "matCostCode",
                            e.target.value,
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                        placeholder="Material"
                        value={crud.newMaterial.type ?? ""}
                        onChange={(e) =>
                          crud.handleUpdateNewMaterial("type", e.target.value)
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                        placeholder="Manufacturer"
                        value={crud.newMaterial.manufacturer ?? ""}
                        onChange={(e) =>
                          crud.handleUpdateNewMaterial(
                            "manufacturer",
                            e.target.value,
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                        placeholder="Description"
                        value={crud.newMaterial.description ?? ""}
                        onChange={(e) =>
                          crud.handleUpdateNewMaterial(
                            "description",
                            e.target.value,
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1 text-right"
                        placeholder="0"
                        value={crud.newMaterial.matCost ?? ""}
                        onChange={(e) =>
                          crud.handleUpdateNewMaterial(
                            "matCost",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                        placeholder="1 EA"
                        value={crud.newMaterial.per ?? ""}
                        onChange={(e) =>
                          crud.handleUpdateNewMaterial("per", e.target.value)
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                        placeholder="32"
                        value={crud.newMaterial.sizeOfUnit ?? ""}
                        onChange={(e) =>
                          crud.handleUpdateNewMaterial(
                            "sizeOfUnit",
                            e.target.value === ""
                              ? undefined
                              : parseFloat(e.target.value),
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                        placeholder="Auto"
                        disabled
                        value={(() => {
                          const uc = crud.newMaterial.matCost ?? 0;
                          const sz = crud.newMaterial.sizeOfUnit ?? 0;
                          return sz > 0 && uc > 0
                            ? (uc / sz).toFixed(4)
                            : "";
                        })()}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                        disabled
                        value={crud.newMaterial.category ?? ""}
                      />
                    </td>
                    {crud.visibleOptionalColumns.sheetBagBox && (
                      <td className="px-4 py-2">-</td>
                    )}
                    {crud.visibleOptionalColumns.size && (
                      <td className="px-4 py-2">-</td>
                    )}
                    {crud.visibleOptionalColumns.screwSpacing && (
                      <td className="px-4 py-2">-</td>
                    )}
                    {crud.visibleOptionalColumns.width && (
                      <td className="px-4 py-2">-</td>
                    )}
                    {crud.visibleOptionalColumns.gauge && (
                      <td className="px-4 py-2">-</td>
                    )}
                    {crud.visibleOptionalColumns.flange && (
                      <td className="px-4 py-2">-</td>
                    )}
                    {crud.visibleOptionalColumns.hourlyRate && (
                      <td className="px-4 py-2">-</td>
                    )}
                    <td className="px-4 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <IconButton
                          icon={Save}
                          variant="success"
                          onClick={crud.handleAddMaterial}
                          tooltip="Save material"
                        />
                        <IconButton
                          icon={X}
                          variant="default"
                          onClick={() => crud.setIsAddingMat(false)}
                          tooltip="Cancel"
                        />
                      </div>
                    </td>
                  </tr>
                )}

                {/* Existing material rows */}
                {crud.filteredDbMaterials.map((m) => (
                  <MaterialTableRow
                    key={m.code}
                    material={m}
                    visibleOptionalColumns={crud.visibleOptionalColumns}
                    onClick={() => crud.setSelectedMaterial(m)}
                    onDelete={crud.handleDeleteFromModal}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Material Detail Modal */}
      <MaterialDetailModal
        material={crud.selectedMaterial}
        onClose={() => crud.setSelectedMaterial(null)}
        onSave={crud.handleSaveMaterial}
        onDelete={crud.handleDeleteFromModal}
      />

      {/* Import Mode Modal */}
      <MaterialImportModal
        isOpen={importExport.isImportModeModalOpen}
        importPendingData={importExport.importPendingData}
        isCommittingImport={importExport.isCommittingImport}
        onCommit={importExport.handleImportCommit}
        onClose={() => {
          importExport.setIsImportModeModalOpen(false);
          importExport.setImportPendingData(null);
        }}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={crud.isDeleteModalOpen}
        onClose={() => {
          crud.setIsDeleteModalOpen(false);
          crud.setMaterialToDelete(null);
        }}
        onConfirm={crud.confirmDeleteMaterial}
        title="Delete Material"
        message={`Are you sure you want to delete "${crud.materialToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Calculate Productivity Confirmation Modal */}
      <ConfirmModal
        isOpen={crud.isCalcProdModalOpen}
        onClose={() => crud.setIsCalcProdModalOpen(false)}
        onConfirm={crud.confirmCalcProductivity}
        title="Calculate Productivity"
        message="Auto-calculate Productivity from Cost (assuming $65/hr)? This will update productivity values for Labor items that don't have one set."
        confirmText="Calculate"
        cancelText="Cancel"
        variant="warning"
      />
    </div>
  );
};
