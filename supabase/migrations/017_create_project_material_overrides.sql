-- Migration: 017_create_project_material_overrides
-- Purpose: Per-project overrides for MaterialDefinition fields.
--          Allows a field change to be scoped to one project without
--          touching the global spec_database.

CREATE TABLE project_material_overrides (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_code text        NOT NULL,
  overrides     jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(project_id, material_code)
);

CREATE INDEX idx_pmo_project_id ON project_material_overrides(project_id);

-- Auto-bump updated_at on every row update
CREATE OR REPLACE FUNCTION update_pmo_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pmo_updated_at
  BEFORE UPDATE ON project_material_overrides
  FOR EACH ROW EXECUTE FUNCTION update_pmo_updated_at();

-- Atomic upsert of a single field inside the overrides JSONB.
-- Inserts a new row if none exists, otherwise merges the new key into the existing JSONB.
CREATE OR REPLACE FUNCTION upsert_material_override(
  p_project_id    uuid,
  p_material_code text,
  p_field         text,
  p_value         jsonb
) RETURNS void AS $$
BEGIN
  INSERT INTO project_material_overrides(project_id, material_code, overrides)
    VALUES (p_project_id, p_material_code, jsonb_build_object(p_field, p_value))
  ON CONFLICT (project_id, material_code)
  DO UPDATE SET
    overrides  = project_material_overrides.overrides || jsonb_build_object(p_field, p_value),
    updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- Remove a single field from the overrides JSONB (revert that field to global DB value).
CREATE OR REPLACE FUNCTION delete_material_override_field(
  p_project_id    uuid,
  p_material_code text,
  p_field         text
) RETURNS void AS $$
BEGIN
  UPDATE project_material_overrides
  SET overrides  = overrides - p_field,
      updated_at = now()
  WHERE project_id    = p_project_id
    AND material_code = p_material_code;
END;
$$ LANGUAGE plpgsql;
