"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { read, utils, writeFile } from "xlsx";
import {
  Button,
  CloseButton,
  ConfirmModal,
  IconButton,
  Input,
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

/**
 * Normalizes any date-like value (Excel serial, "M/D/YYYY", ISO, etc.) to "YYYY-MM-DD"
 * for use with <input type="date">.
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

// ─── Stable Date Field (defined outside modal to avoid remounting) ────────────

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

    const hasNonDateChanges = (Object.keys(formData) as (keyof MaterialDefinition)[]).some(
      (key) => key !== "priceUpdated" && formData[key] !== material[key],
    );
    const dateWasManuallyChanged = formData.priceUpdated !== material.priceUpdated;

    const toSave = hasNonDateChanges && !dateWasManuallyChanged
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

        {/* Category Badge + Close */}
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
            {/* Identification Section */}
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

            {/* Pricing Section */}
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
                {/* Rendered inline (not via Field) so the native date picker stays open across re-renders */}
                <DateField
                  value={formData.priceUpdated}
                  onChange={(val) => handleFieldChange("priceUpdated", val)}
                />
              </div>
            </div>

            {/* Labor Section */}
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
                    {(formData.unitCost ?? formData.matCost)! / formData.sizeOfUnit}{" "}
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

            {/* Notes Section */}
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
            {/* Wall Formulas */}
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
                      onChange={(e) => handleFieldChange("formulaQty", e.target.value || undefined)}
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
                      onChange={(e) => handleFieldChange("mouWall", e.target.value || undefined)}
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
                      onChange={(e) => handleFieldChange("formulaSecQty", e.target.value || undefined)}
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
                      onChange={(e) => handleFieldChange("mouWallSec", e.target.value || undefined)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Ceiling Formulas */}
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
                      onChange={(e) => handleFieldChange("formulaCeilQty", e.target.value || undefined)}
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
                      onChange={(e) => handleFieldChange("mouCeil", e.target.value || undefined)}
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
                      onChange={(e) => handleFieldChange("formulaCeilSecQty", e.target.value || undefined)}
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
                      onChange={(e) => handleFieldChange("mouCeilSec", e.target.value || undefined)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Formula Tips */}
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
              <code className="font-mono bg-blue-100 px-1 rounded">layer</code>,{" "}
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
  const toast = useToast();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [dbCategory, setDbCategory] = useState<string>("All");
  const [dbSearch, setDbSearch] = useState("");
  const [isAddingMat, setIsAddingMat] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);

  // Detail modal state
  const [selectedMaterial, setSelectedMaterial] =
    useState<MaterialDefinition | null>(null);

  // Delete confirmation state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState<{
    code: string;
    name: string;
  } | null>(null);

  // Calc productivity confirmation state
  const [isCalcProdModalOpen, setIsCalcProdModalOpen] = useState(false);

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

  // Filtered materials by category and search
  const filteredDbMaterials = useMemo(() => {
    return materials.filter((m) => {
      const matchSearch =
        m.description.toLowerCase().includes(dbSearch.toLowerCase()) ||
        m.code.toLowerCase().includes(dbSearch.toLowerCase());
      const matchCat = dbCategory === "All" || m.category === dbCategory;
      return matchSearch && matchCat;
    });
  }, [materials, dbCategory, dbSearch]);

  // Determine which optional columns to hide (all empty for current filtered set)
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
      const hasAnyValue = filteredDbMaterials.some((m) => {
        const val = m[field];
        return val !== undefined && val !== null && val !== "";
      });
      visible[field] = hasAnyValue;
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
  }, []);

  const handleUpdateNewMaterial = (
    field: keyof MaterialDefinition,
    value: string | number | undefined,
  ) => {
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
      unitCost: newMaterial.unitCost,
      per:
        newMaterial.per ||
        (newMaterial.category === "Drywall" ||
        newMaterial.category === "Insulation"
          ? "1,000 SF"
          : newMaterial.category === "Framing"
            ? "1 LF"
            : "1 EA"),
      priceUpdated: newMaterial.priceUpdated || new Date().toISOString().slice(0, 10),
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
  };

  const handleSaveMaterial = async (updated: MaterialDefinition) => {
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
        const updatedMaterials = materials.map((m) =>
          m.code === updated.code ? updated : m,
        );
        onUpdateMaterials(updatedMaterials);
        toast.success("Saved", "Material updated successfully.");
      } else {
        toast.error("Save Failed", data.error || "Failed to save material.");
      }
    } catch (error) {
      console.error("Failed to save material:", error);
      toast.error("Save Failed", "An unexpected error occurred.");
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

  const handleDeleteFromModal = (code: string) => {
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

      const rawRows = utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
      }) as unknown[][];

      if (rawRows.length === 0) {
        toast.error("Import Failed", "The Excel file is empty.");
        return;
      }

      const knownKeywords = [
        "code",
        "description",
        "category",
        "cost",
        "unit",
        "manufacturer",
        "section",
        "note",
        "formula",
        "gauge",
        "width",
        "flange",
        "size",
      ];
      let headerRowIndex = 0;
      let maxMatches = 0;
      for (let i = 0; i < Math.min(5, rawRows.length); i++) {
        const cells = rawRows[i].map((c) =>
          String(c ?? "")
            .toLowerCase()
            .trim(),
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
          row.some(
            (cell) => cell !== null && cell !== undefined && cell !== "",
          ),
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

        const action =
          mode === "replace" ? "Replaced database with" : "Imported";
        let msg = `${action} ${validMaterials.length} materials.`;
        if (invalidRows.length > 0)
          msg += ` ${invalidRows.length} rows skipped.`;
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
    toast.success(
      "Calculation Complete",
      "Productivity values have been updated.",
    );
    setIsCalcProdModalOpen(false);
  };

  if (isLoading) {
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
            icon={Download}
            onClick={() => importInputRef.current?.click()}
            disabled={isImporting || isCommittingImport}
            isLoading={isImporting || isCommittingImport}
          >
            {isCommittingImport
              ? "Saving..."
              : isImporting
                ? "Reading..."
                : "Import"}
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
                  category:
                    cat === "All"
                      ? (categories[1] as MaterialDefinition["category"])
                      : (cat as MaterialDefinition["category"]),
                  per:
                    cat === "Drywall" || cat === "Insulation"
                      ? "1,000 SF"
                      : cat === "Framing"
                        ? "1 LF"
                        : "1 EA",
                }));
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                dbCategory === cat
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
                value={dbSearch}
                onValueChange={setDbSearch}
                placeholder="Search by code, description, or manufacturer..."
              />
            </div>
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => setIsAddingMat(true)}
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
                  {visibleOptionalColumns.sheetBagBox && (
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">
                      Sheet/Bag/Box
                    </th>
                  )}
                  {visibleOptionalColumns.size && (
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">
                      Size
                    </th>
                  )}
                  {visibleOptionalColumns.screwSpacing && (
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">
                      Screw Spacing
                    </th>
                  )}
                  {visibleOptionalColumns.width && (
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">
                      Width
                    </th>
                  )}
                  {visibleOptionalColumns.gauge && (
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">
                      Gauge
                    </th>
                  )}
                  {visibleOptionalColumns.flange && (
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">
                      Flange
                    </th>
                  )}
                  {visibleOptionalColumns.hourlyRate && (
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">
                      Hourly Rate
                    </th>
                  )}
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Add new row */}
                {isAddingMat && (
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
                        value={newMaterial.section ?? ""}
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
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                        placeholder="GEN"
                        value={newMaterial.matCostCode ?? ""}
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
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                        placeholder="Material"
                        value={newMaterial.type ?? ""}
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
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                        placeholder="Manufacturer"
                        value={newMaterial.manufacturer ?? ""}
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
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                        placeholder="Description"
                        value={newMaterial.description ?? ""}
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
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1 text-right"
                        placeholder="0"
                        value={newMaterial.matCost ?? ""}
                        onChange={(e) =>
                          handleUpdateNewMaterial(
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
                        value={newMaterial.per ?? ""}
                        onChange={(e) =>
                          handleUpdateNewMaterial("per", e.target.value)
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                        placeholder="32"
                        value={newMaterial.sizeOfUnit ?? ""}
                        onChange={(e) =>
                          handleUpdateNewMaterial(
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
                        value={
                          (() => {
                            const uc = newMaterial.matCost ?? 0;
                            const sz = newMaterial.sizeOfUnit ?? 0;
                            return sz > 0 && uc > 0
                              ? (uc / sz).toFixed(4)
                              : "";
                          })()
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm border border-emerald-300 rounded px-2 py-1"
                        disabled
                        value={newMaterial.category ?? ""}
                      />
                    </td>
                    {visibleOptionalColumns.sheetBagBox && (
                      <td className="px-4 py-2">-</td>
                    )}
                    {visibleOptionalColumns.size && (
                      <td className="px-4 py-2">-</td>
                    )}
                    {visibleOptionalColumns.screwSpacing && (
                      <td className="px-4 py-2">-</td>
                    )}
                    {visibleOptionalColumns.width && (
                      <td className="px-4 py-2">-</td>
                    )}
                    {visibleOptionalColumns.gauge && (
                      <td className="px-4 py-2">-</td>
                    )}
                    {visibleOptionalColumns.flange && (
                      <td className="px-4 py-2">-</td>
                    )}
                    {visibleOptionalColumns.hourlyRate && (
                      <td className="px-4 py-2">-</td>
                    )}
                    <td className="px-4 py-2 text-right">
                      <div className="flex gap-1 justify-end">
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
                      </div>
                    </td>
                  </tr>
                )}

                {/* Existing rows - READ ONLY */}
                {filteredDbMaterials.map((m) => (
                  <tr
                    key={m.code}
                    className="group transition-colors hover:bg-slate-50 cursor-pointer"
                    onClick={() => setSelectedMaterial(m)}
                  >
                    <td className="px-4 py-3 text-sm font-mono text-slate-500">
                      {m.code}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {m.section || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {m.matCostCode || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {m.type || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {m.manufacturer || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-800 font-medium">
                      {m.description}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 text-right">
                      {(m.unitCost ?? m.matCost) != null && (m.unitCost ?? m.matCost)! > 0
                        ? `$${(m.unitCost ?? m.matCost)!.toLocaleString()}`
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {m.per || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {m.sizeOfUnit != null ? m.sizeOfUnit : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {(() => {
                        const unitCost = m.unitCost ?? m.matCost;
                        const sz = m.sizeOfUnit ?? 0;
                        if (unitCost != null && sz > 0) {
                          return (unitCost / sz).toFixed(4);
                        }
                        return m.productivity != null ? m.productivity : "-";
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {m.category}
                      </span>
                    </td>
                    {visibleOptionalColumns.sheetBagBox && (
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {m.sheetBagBox || "-"}
                      </td>
                    )}
                    {visibleOptionalColumns.size && (
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {m.size || "-"}
                      </td>
                    )}
                    {visibleOptionalColumns.screwSpacing && (
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {m.screwSpacing || "-"}
                      </td>
                    )}
                    {visibleOptionalColumns.width && (
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {m.width || "-"}
                      </td>
                    )}
                    {visibleOptionalColumns.gauge && (
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {m.gauge || "-"}
                      </td>
                    )}
                    {visibleOptionalColumns.flange && (
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {m.flange || "-"}
                      </td>
                    )}
                    {visibleOptionalColumns.hourlyRate && (
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {m.hourlyRate != null ? `$${m.hourlyRate}` : "-"}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div
                        className="flex gap-1 justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IconButton
                          icon={Trash2}
                          variant="danger"
                          size="sm"
                          onClick={() => handleDeleteFromModal(m.code)}
                          className="opacity-0 group-hover:opacity-100 transition-all"
                          tooltip="Delete material"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Material Detail Modal */}
      <MaterialDetailModal
        material={selectedMaterial}
        onClose={() => setSelectedMaterial(null)}
        onSave={handleSaveMaterial}
        onDelete={handleDeleteFromModal}
      />

      {/* Import Mode Modal */}
      <Modal
        isOpen={isImportModeModalOpen}
        onClose={() => {
          setIsImportModeModalOpen(false);
          setImportPendingData(null);
        }}
        title="Import Materials"
        size="md"
      >
        <ModalBody>
          <p className="text-sm text-slate-600 mb-1">
            <span className="font-semibold text-slate-800">
              {importPendingData?.validMaterials.length ?? 0} materials
            </span>{" "}
            ready to import.
            {(importPendingData?.invalidRows.length ?? 0) > 0 && (
              <span className="text-amber-600 ml-1">
                ({importPendingData?.invalidRows.length} rows skipped due to
                errors)
              </span>
            )}
          </p>
          <p className="text-sm text-slate-500 mb-6">
            How would you like to import?
          </p>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleImportCommit("merge")}
              disabled={isCommittingImport}
              className="flex flex-col items-start gap-2 p-4 border-2 border-slate-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 transition-all text-left"
            >
              <span className="text-sm font-semibold text-slate-800">
                Merge
              </span>
              <span className="text-xs text-slate-500">
                Add new items and update existing ones. Keeps materials not in
                the file.
              </span>
            </button>
            <button
              onClick={() => handleImportCommit("replace")}
              disabled={isCommittingImport}
              className="flex flex-col items-start gap-2 p-4 border-2 border-slate-200 rounded-xl hover:border-red-400 hover:bg-red-50 transition-all text-left"
            >
              <span className="text-sm font-semibold text-slate-800">
                Replace All
              </span>
              <span className="text-xs text-slate-500">
                Delete all existing materials and replace with the imported
                data.
              </span>
            </button>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => {
              setIsImportModeModalOpen(false);
              setImportPendingData(null);
            }}
            disabled={isCommittingImport}
          >
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

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
