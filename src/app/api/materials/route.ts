/**
 * API routes for materials CRUD operations
 * GET /api/materials - Fetch all materials
 * POST /api/materials - Create/bulk upsert materials
 *
 * Only accessible by Administrators and Team Leads
 */

import { NextResponse } from "next/server";
import { withRoleAuth } from "@/lib/auth";
import {
  bulkUpsertMaterials,
  createMaterial,
  deleteAllMaterials,
} from "@/lib/db/materials";
import {
  getMaterialDatabase,
  invalidateMaterialDbCache,
  refreshMaterialDbCache,
} from "@/lib/cache/materialDbCache";
import { MaterialDefinition } from "@/types";
import { normalizePriceUpdatedDate } from "@/lib/utils/materialValidation";

const sanitizeMaterialInput = (
  material: Partial<MaterialDefinition>,
): MaterialDefinition => ({
  code: String(material.code ?? "").trim(),
  section: String(material.section ?? "00 00 00").trim(),
  matCostCode: String(material.matCostCode ?? "GEN").trim(),
  laborCostCode: String(material.laborCostCode ?? "").trim(),
  type: String(material.type ?? "Material").trim(),
  manufacturer: String(material.manufacturer ?? "Generic").trim(),
  description: String(material.description ?? "").trim(),
  matCost: Number(material.matCost ?? material.unitCost ?? 0) || 0,
  unitCost:
    material.unitCost == null || material.unitCost === ("" as unknown)
      ? undefined
      : Number(material.unitCost),
  per: String(material.per ?? "1 EA").trim(),
  priceUpdated: normalizePriceUpdatedDate(material.priceUpdated),
  category: (material.category ?? "Other") as MaterialDefinition["category"],
  width: material.width?.trim() || undefined,
  gauge: material.gauge?.trim() || undefined,
  flange: material.flange?.trim() || undefined,
  sheetBagBox: material.sheetBagBox?.trim() || undefined,
  sheetBagBoxSizeUnits: material.sheetBagBoxSizeUnits?.trim() || undefined,
  size: material.size?.trim() || undefined,
  screwSpacing: material.screwSpacing?.trim() || undefined,
  sizeOfUnit:
    material.sizeOfUnit == null || material.sizeOfUnit === ("" as unknown)
      ? undefined
      : Number(material.sizeOfUnit),
  lengthCover: material.lengthCover?.trim() || undefined,
  lengthCoverUnits: material.lengthCoverUnits?.trim() || undefined,
  formulaQty: material.formulaQty?.trim() || undefined,
  formulaSecQty: material.formulaSecQty?.trim() || undefined,
  formulaCeilQty: material.formulaCeilQty?.trim() || undefined,
  formulaCeilSecQty: material.formulaCeilSecQty?.trim() || undefined,
  mouWall: material.mouWall?.trim() || undefined,
  mouWallSec: material.mouWallSec?.trim() || undefined,
  mouCeil: material.mouCeil?.trim() || undefined,
  mouCeilSec: material.mouCeilSec?.trim() || undefined,
  note: material.note?.trim() || undefined,
  productivity:
    material.productivity == null || material.productivity === ("" as unknown)
      ? undefined
      : Number(material.productivity),
  hourlyRate:
    material.hourlyRate == null || material.hourlyRate === ("" as unknown)
      ? undefined
      : Number(material.hourlyRate),
  coverPerHour:
    material.coverPerHour == null || material.coverPerHour === ("" as unknown)
      ? undefined
      : Number(material.coverPerHour),
});

/**
 * GET /api/materials
 * Fetch all materials from database
 */
export const GET = withRoleAuth(
  ["Administrator", "Team Lead", "Estimator"],
  async (request) => {
    try {
      const materials = await getMaterialDatabase();

      const { searchParams } = new URL(request.url);
      const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
      const category = searchParams.get("category")?.trim() ?? "";
      const limitParam = searchParams.get("limit");
      const offsetParam = searchParams.get("offset");

      const limit =
        limitParam != null && limitParam !== "" ? Number(limitParam) : null;
      const offset =
        offsetParam != null && offsetParam !== "" ? Number(offsetParam) : 0;
      const safeLimit =
        limit != null && Number.isFinite(limit) && limit > 0
          ? Math.min(limit, 500)
          : null;
      const safeOffset =
        Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;

      let filtered = materials || [];
      if (category) {
        filtered = filtered.filter((material) => material.category === category);
      }
      if (query) {
        filtered = filtered.filter((material) => {
          const haystack = [
            material.code,
            material.description,
            material.manufacturer,
            material.section,
            material.matCostCode,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        });
      }

      const total = filtered.length;
      const paged =
        safeLimit != null
          ? filtered.slice(safeOffset, safeOffset + safeLimit)
          : filtered;

      return NextResponse.json({
        success: true,
        materials: paged,
        pagination: {
          total,
          limit: safeLimit,
          offset: safeOffset,
          returned: paged.length,
        },
      });
    } catch (error) {
      console.error("Materials API error:", error);
      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 },
      );
    }
  },
);

/**
 * DELETE /api/materials
 * Delete ALL materials from the database (for Replace All import)
 */
export const DELETE = withRoleAuth(
  ["Administrator", "Team Lead"],
  async () => {
    try {
      const { error } = await deleteAllMaterials();

      if (error) {
        console.error("Failed to delete all materials:", error);
        return NextResponse.json(
          { success: false, error: "Failed to delete materials" },
          { status: 500 },
        );
      }

      await invalidateMaterialDbCache();
      return NextResponse.json({
        success: true,
        message: "All materials deleted",
      });
    } catch (error) {
      console.error("Materials DELETE API error:", error);
      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 },
      );
    }
  },
);

/**
 * POST /api/materials
 * Create or bulk upsert materials
 */
export const POST = withRoleAuth(
  ["Administrator", "Team Lead"],
  async (request) => {
    try {
      const body = await request.json();
      const { materials, mode = "upsert" } = body;

      if (!materials || !Array.isArray(materials)) {
        return NextResponse.json(
          { success: false, error: "Materials array is required" },
          { status: 400 },
        );
      }

      if (materials.length === 0) {
        return NextResponse.json(
          { success: false, error: "Materials array cannot be empty" },
          { status: 400 },
        );
      }

      const normalizedMaterials = materials.map((material) =>
        sanitizeMaterialInput(material as Partial<MaterialDefinition>),
      );
      const duplicateCodeMap = new Map<string, number[]>();
      normalizedMaterials.forEach((material, index) => {
        const key = material.code;
        if (!key) return;
        const existing = duplicateCodeMap.get(key) ?? [];
        existing.push(index + 1);
        duplicateCodeMap.set(key, existing);
      });
      const duplicateCodes = Array.from(duplicateCodeMap.entries())
        .filter(([, rows]) => rows.length > 1)
        .map(([code, rows]) => ({ code, rows }));

      const invalidRows = normalizedMaterials
        .map((material, index) => {
          const errors: string[] = [];
          if (!material.code) errors.push("Missing code");
          if (!material.description) errors.push("Missing description");
          if (!material.category) errors.push("Missing category");
          if (!Number.isFinite(material.matCost)) errors.push("Invalid matCost");
          if (material.unitCost != null && !Number.isFinite(material.unitCost))
            errors.push("Invalid unitCost");
          return errors.length > 0 ? { row: index + 1, errors } : null;
        })
        .filter(Boolean);

      if (invalidRows.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: "One or more material rows are invalid",
            invalidRows,
            summary: {
              received: normalizedMaterials.length,
              invalid: invalidRows.length,
              duplicateCodes,
            },
          },
          { status: 400 },
        );
      }

      if (mode === "single" && normalizedMaterials.length === 1) {
        // Create single material
        const { data, error } = await createMaterial(normalizedMaterials[0]);

        if (error) {
          console.error("Failed to create material:", error);
          return NextResponse.json(
            {
              success: false,
              error:
                error.code === "23505"
                  ? `Material code ${normalizedMaterials[0].code} already exists`
                  : "Failed to create material",
            },
            { status: 500 },
          );
        }

        await refreshMaterialDbCache();
        return NextResponse.json({
          success: true,
          message: "Material created successfully",
          material: data,
          summary: {
            received: 1,
            saved: data ? 1 : 0,
            duplicateCodes,
          },
        });
      } else {
        // Bulk upsert materials
        const { data, error } = await bulkUpsertMaterials(normalizedMaterials);

        if (error) {
          console.error("Failed to upsert materials:", error);
          return NextResponse.json(
          {
            success: false,
            error: "Failed to save materials",
            summary: {
              received: normalizedMaterials.length,
              duplicateCodes,
              failedChunk: error.details ?? null,
            },
          },
          { status: 500 },
        );
      }

      await refreshMaterialDbCache();
      return NextResponse.json({
        success: true,
        message: `Successfully saved ${data?.length || 0} materials`,
        materials: data,
        summary: {
          received: normalizedMaterials.length,
          saved: data?.length || 0,
          duplicateCodes,
        },
      });
      }
    } catch (error) {
      console.error("Materials POST API error:", error);
      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 },
      );
    }
  },
);
