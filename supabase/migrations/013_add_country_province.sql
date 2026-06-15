-- Migration: Add country/province support
-- 1. Lookup table for countries + provinces (seeded)
-- 2. Add country + province columns to projects
-- 3. Add country + province columns to spec_database

-- ─── Lookup Table ─────────────────────────────────────────────────────────────
-- NOTE: UNIQUE constraint is intentionally NOT in the CREATE TABLE statement.
-- CREATE TABLE IF NOT EXISTS skips the entire statement (including constraints)
-- when the table already exists. The constraint is added separately below
-- via a DO block so this migration is idempotent on existing databases.

CREATE TABLE IF NOT EXISTS countries_provinces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code  VARCHAR(10)  NOT NULL,
  country_name  VARCHAR(100) NOT NULL,
  province_code VARCHAR(10)  NOT NULL,
  province_name VARCHAR(100) NOT NULL,
  sort_order    INTEGER      NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_countries_provinces_country_code
  ON countries_provinces(country_code);

-- Add UNIQUE constraint if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'uq_country_province'
      AND  conrelid = 'countries_provinces'::regclass
  ) THEN
    ALTER TABLE countries_provinces
      ADD CONSTRAINT uq_country_province UNIQUE (country_code, province_code);
  END IF;
END $$;

-- ─── Projects: add country + province ────────────────────────────────────────

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS country  VARCHAR(100);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS province VARCHAR(100);

-- ─── spec_database: add country + province ────────────────────────────────────

ALTER TABLE spec_database
  ADD COLUMN IF NOT EXISTS country  VARCHAR(100);

ALTER TABLE spec_database
  ADD COLUMN IF NOT EXISTS province VARCHAR(100);

-- ─── Seed: United States (50 states + DC) ────────────────────────────────────

INSERT INTO countries_provinces (country_code, country_name, province_code, province_name, sort_order) VALUES
  ('USA', 'United States', 'AL', 'Alabama',                1),
  ('USA', 'United States', 'AK', 'Alaska',                 2),
  ('USA', 'United States', 'AZ', 'Arizona',                3),
  ('USA', 'United States', 'AR', 'Arkansas',               4),
  ('USA', 'United States', 'CA', 'California',             5),
  ('USA', 'United States', 'CO', 'Colorado',               6),
  ('USA', 'United States', 'CT', 'Connecticut',            7),
  ('USA', 'United States', 'DE', 'Delaware',               8),
  ('USA', 'United States', 'DC', 'District of Columbia',   9),
  ('USA', 'United States', 'FL', 'Florida',               10),
  ('USA', 'United States', 'GA', 'Georgia',               11),
  ('USA', 'United States', 'HI', 'Hawaii',                12),
  ('USA', 'United States', 'ID', 'Idaho',                 13),
  ('USA', 'United States', 'IL', 'Illinois',              14),
  ('USA', 'United States', 'IN', 'Indiana',               15),
  ('USA', 'United States', 'IA', 'Iowa',                  16),
  ('USA', 'United States', 'KS', 'Kansas',                17),
  ('USA', 'United States', 'KY', 'Kentucky',              18),
  ('USA', 'United States', 'LA', 'Louisiana',             19),
  ('USA', 'United States', 'ME', 'Maine',                 20),
  ('USA', 'United States', 'MD', 'Maryland',              21),
  ('USA', 'United States', 'MA', 'Massachusetts',         22),
  ('USA', 'United States', 'MI', 'Michigan',              23),
  ('USA', 'United States', 'MN', 'Minnesota',             24),
  ('USA', 'United States', 'MS', 'Mississippi',           25),
  ('USA', 'United States', 'MO', 'Missouri',              26),
  ('USA', 'United States', 'MT', 'Montana',               27),
  ('USA', 'United States', 'NE', 'Nebraska',              28),
  ('USA', 'United States', 'NV', 'Nevada',                29),
  ('USA', 'United States', 'NH', 'New Hampshire',         30),
  ('USA', 'United States', 'NJ', 'New Jersey',            31),
  ('USA', 'United States', 'NM', 'New Mexico',            32),
  ('USA', 'United States', 'NY', 'New York',              33),
  ('USA', 'United States', 'NC', 'North Carolina',        34),
  ('USA', 'United States', 'ND', 'North Dakota',          35),
  ('USA', 'United States', 'OH', 'Ohio',                  36),
  ('USA', 'United States', 'OK', 'Oklahoma',              37),
  ('USA', 'United States', 'OR', 'Oregon',                38),
  ('USA', 'United States', 'PA', 'Pennsylvania',          39),
  ('USA', 'United States', 'RI', 'Rhode Island',          40),
  ('USA', 'United States', 'SC', 'South Carolina',        41),
  ('USA', 'United States', 'SD', 'South Dakota',          42),
  ('USA', 'United States', 'TN', 'Tennessee',             43),
  ('USA', 'United States', 'TX', 'Texas',                 44),
  ('USA', 'United States', 'UT', 'Utah',                  45),
  ('USA', 'United States', 'VT', 'Vermont',               46),
  ('USA', 'United States', 'VA', 'Virginia',              47),
  ('USA', 'United States', 'WA', 'Washington',            48),
  ('USA', 'United States', 'WV', 'West Virginia',         49),
  ('USA', 'United States', 'WI', 'Wisconsin',             50),
  ('USA', 'United States', 'WY', 'Wyoming',               51)
ON CONFLICT ON CONSTRAINT uq_country_province DO NOTHING;

-- ─── Seed: Canada (10 provinces + 3 territories) ─────────────────────────────

INSERT INTO countries_provinces (country_code, country_name, province_code, province_name, sort_order) VALUES
  ('CA', 'Canada', 'AB', 'Alberta',                    1),
  ('CA', 'Canada', 'BC', 'British Columbia',           2),
  ('CA', 'Canada', 'MB', 'Manitoba',                   3),
  ('CA', 'Canada', 'NB', 'New Brunswick',              4),
  ('CA', 'Canada', 'NL', 'Newfoundland and Labrador',  5),
  ('CA', 'Canada', 'NS', 'Nova Scotia',                6),
  ('CA', 'Canada', 'NT', 'Northwest Territories',      7),
  ('CA', 'Canada', 'NU', 'Nunavut',                    8),
  ('CA', 'Canada', 'ON', 'Ontario',                    9),
  ('CA', 'Canada', 'PE', 'Prince Edward Island',      10),
  ('CA', 'Canada', 'QC', 'Quebec',                    11),
  ('CA', 'Canada', 'SK', 'Saskatchewan',              12),
  ('CA', 'Canada', 'YT', 'Yukon',                     13)
ON CONFLICT ON CONSTRAINT uq_country_province DO NOTHING;
