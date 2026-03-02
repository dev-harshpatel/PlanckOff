/**
 * API routes for individual material operations
 * GET /api/materials/[code] - Fetch single material
 * PUT /api/materials/[code] - Update single material
 * DELETE /api/materials/[code] - Delete material
 *
 * Only accessible by Administrators and Team Leads
 */

import { NextRequest, NextResponse } from "next/server";
import { withRoleAuth } from "@/lib/auth";
import {
  deleteMaterial,
  getMaterialByCode,
  updateMaterial,
} from "@/lib/db/materials";
import { invalidateMaterialDbCache } from "@/lib/cache/materialDbCache";
import { MaterialDefinition } from "@/types";

/**
 * GET /api/materials/[code]
 * Fetch a single material by code
 */
export const GET = withRoleAuth(
  ["Administrator", "Team Lead", "Estimator"],
  async (request, context, params) => {
    try {
      const { code } = params;

      if (!code) {
        return NextResponse.json(
          { success: false, error: "Material code is required" },
          { status: 400 },
        );
      }

      const { data: material, error } = await getMaterialByCode(
        decodeURIComponent(code),
      );

      if (error) {
        console.error("Failed to fetch material:", error);
        return NextResponse.json(
          { success: false, error: "Failed to fetch material" },
          { status: 500 },
        );
      }

      if (!material) {
        return NextResponse.json(
          { success: false, error: "Material not found" },
          { status: 404 },
        );
      }

      return NextResponse.json({
        success: true,
        material,
      });
    } catch (error) {
      console.error("Material GET API error:", error);
      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 },
      );
    }
  },
);

/**
 * PUT /api/materials/[code]
 * Update a single material
 */
export const PUT = withRoleAuth(
  ["Administrator", "Team Lead"],
  async (request, context, params) => {
    try {
      const { code } = params;

      if (!code) {
        return NextResponse.json(
          { success: false, error: "Material code is required" },
          { status: 400 },
        );
      }

      const body = await request.json();
      const updates: Partial<MaterialDefinition> = body.updates || body;

      // Validate that we're not trying to change the code
      if (updates.code && updates.code !== code) {
        return NextResponse.json(
          { success: false, error: "Cannot change material code" },
          { status: 400 },
        );
      }

      const { data: material, error } = await updateMaterial(
        decodeURIComponent(code),
        updates,
      );

      if (error) {
        console.error("Failed to update material:", error);

        // Check for unique constraint violation
        if (error.code === "23505") {
          return NextResponse.json(
            {
              success: false,
              error: "A material with this code already exists",
            },
            { status: 409 },
          );
        }

        return NextResponse.json(
          { success: false, error: "Failed to update material" },
          { status: 500 },
        );
      }

      await invalidateMaterialDbCache();
      return NextResponse.json({
        success: true,
        message: "Material updated successfully",
        material,
      });
    } catch (error) {
      console.error("Material PUT API error:", error);
      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 },
      );
    }
  },
);

/**
 * DELETE /api/materials/[code]
 * Delete a material
 */
export const DELETE = withRoleAuth(
  ["Administrator", "Team Lead"],
  async (request, context, params) => {
    try {
      const { code } = params;

      if (!code) {
        return NextResponse.json(
          { success: false, error: "Material code is required" },
          { status: 400 },
        );
      }

      const { error } = await deleteMaterial(decodeURIComponent(code));

      if (error) {
        console.error("Failed to delete material:", error);
        return NextResponse.json(
          { success: false, error: "Failed to delete material" },
          { status: 500 },
        );
      }

      await invalidateMaterialDbCache();
      return NextResponse.json({
        success: true,
        message: "Material deleted successfully",
      });
    } catch (error) {
      console.error("Material DELETE API error:", error);
      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 },
      );
    }
  },
);
