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
  getAllMaterials,
} from "@/lib/db/materials";
import { invalidateMaterialDbCache } from "@/lib/cache/materialDbCache";
import { MaterialDefinition } from "@/types";

/**
 * GET /api/materials
 * Fetch all materials from database
 */
export const GET = withRoleAuth(
  ["Administrator", "Team Lead", "Estimator"],
  async () => {
    try {
      const { data: materials, error } = await getAllMaterials();

      if (error) {
        console.error("Failed to fetch materials:", error);
        return NextResponse.json(
          { success: false, error: "Failed to fetch materials" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        materials: materials || [],
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

      // Validate required fields for each material
      for (const material of materials) {
        if (!material.code || !material.description || !material.category) {
          return NextResponse.json(
            {
              success: false,
              error: "Each material must have code, description, and category",
            },
            { status: 400 },
          );
        }
      }

      if (mode === "single" && materials.length === 1) {
        // Create single material
        const { data, error } = await createMaterial(materials[0]);

        if (error) {
          console.error("Failed to create material:", error);
          return NextResponse.json(
            { success: false, error: "Failed to create material" },
            { status: 500 },
          );
        }

        await invalidateMaterialDbCache();
        return NextResponse.json({
          success: true,
          message: "Material created successfully",
          material: data,
        });
      } else {
        // Bulk upsert materials
        const { data, error } = await bulkUpsertMaterials(materials);

        if (error) {
          console.error("Failed to upsert materials:", error);
          return NextResponse.json(
            { success: false, error: "Failed to save materials" },
            { status: 500 },
          );
        }

        await invalidateMaterialDbCache();
        return NextResponse.json({
          success: true,
          message: `Successfully saved ${data?.length || 0} materials`,
          materials: data,
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
