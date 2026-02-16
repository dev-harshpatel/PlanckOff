"""
Excel to JSON Converter - Take-Off Extraction
Reads Excel from input folder, outputs JSON to output folder (no aggregation).
"""

import json
import re
from pathlib import Path

import pandas as pd


INPUT_DIR = Path(__file__).parent / "input"
OUTPUT_DIR = Path(__file__).parent / "output"
EXCEL_FILE = "PlanckOff-Take-Off.xlsx"
OUTPUT_FILE = "final_clean_output.json"


def to_snake_case(name: str) -> str:
    """Convert string to snake_case (spaces/special chars to underscores)."""
    if not name or pd.isna(name):
        return ""
    s = str(name).strip()
    s = re.sub(r"[^\w\s]", "", s)
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s.lower()


def get_value_key_for_assembly_type(assembly_type: str) -> str:
    """Return the key name for wall length/ceiling area based on Assembly type."""
    if pd.isna(assembly_type):
        return "wall_length"
    at = str(assembly_type).strip()
    if at == "Ceiling":
        return "ceiling_area"
    if at == "Access Panel Install":
        return "access_panel"
    if at == "HM Frame Install":
        return "hm_frame"
    return "wall_length"


def clean_value(val) -> float | int | str | None:
    """Convert pandas values to JSON-serializable types."""
    if pd.isna(val):
        return None
    if isinstance(val, (int, float)):
        if float(val) == int(val):
            return int(val)
        return float(val)
    return str(val).strip()


def process_excel_to_json() -> None:
    """Read Excel, convert each row to JSON record, write output."""
    input_path = INPUT_DIR / EXCEL_FILE
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_excel(input_path)

    # 1. Drop Unnamed columns
    unnamed_cols = [c for c in df.columns if isinstance(c, str) and c.startswith("Unnamed:")]
    df = df.drop(columns=unnamed_cols, errors="ignore")

    # 2. Filter rows with valid Assembly type, Wall Type, Height, and wall Length/Ceiling area
    df = df[
        df["Assembly type"].notna()
        & df["Wall Type"].notna()
        & df["Height"].notna()
        & df["wall Length/ Ceiling area"].notna()
    ].copy()

    # 3. Build output records - one per row, no aggregation
    output_records: list[dict] = []
    for _, row in df.iterrows():
        assembly_type = row["Assembly type"]
        value_key = get_value_key_for_assembly_type(assembly_type)
        wall_length_val = row["wall Length/ Ceiling area"]

        record: dict = {
            "level": clean_value(row["Level"]),
            "assembly_type": clean_value(assembly_type),
            "wall_type": clean_value(row["Wall Type"]),
            "height": clean_value(row["Height"]),
            value_key: int(wall_length_val) if wall_length_val == int(wall_length_val) else wall_length_val,
        }

        if pd.notna(row["No."]) and str(row["No."]).strip():
            record["no"] = clean_value(row["No."])
        if pd.notna(row["Unit"]) and str(row["Unit"]).strip():
            record["unit"] = clean_value(row["Unit"])
        if pd.notna(row["Area parementer "]) and str(row["Area parementer "]).strip():
            record["area_parementer"] = clean_value(row["Area parementer "])
        if pd.notna(row["Unit.1"]) and str(row["Unit.1"]).strip():
            record["unit_1"] = clean_value(row["Unit.1"])
        if pd.notna(row["Qty 3"]) and str(row["Qty 3"]).strip():
            record["qty_3"] = clean_value(row["Qty 3"])
        if pd.notna(row["UOM3"]) and str(row["UOM3"]).strip():
            record["uom3"] = clean_value(row["UOM3"])

        output_records.append(record)

    output_path = OUTPUT_DIR / OUTPUT_FILE
    with open(output_path, "w") as f:
        json.dump(output_records, f, indent=2)

    print(f"Written {len(output_records)} records to {output_path}")


if __name__ == "__main__":
    process_excel_to_json()
