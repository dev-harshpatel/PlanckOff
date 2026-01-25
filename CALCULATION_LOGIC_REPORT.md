# Drywall Estimator - Logic & Operation Report

## 1. Executive Summary
The TVE Drywall Estimator is an advanced quantification tool that automates the takeoff process for walls and ceilings. It combines AI-driven analysis with rigorous Usage-Based Calculation logic to generate precise material and labor estimates.

---

## 2. Assembly Creation Guideline

### Step 1: Initialize Assembly
-   Click **"New Assembly"** or select **"Add from Template"**.
-   **Templates**: Pre-loaded with standard components (e.g., "Standard Partition", "Suspended Ceiling") using industry-standard logic.
-   **Categorization**: Select the correct category (**Wall**, **Ceiling**, **Soffit**) to enable specific logic triggers (e.g., inputting Room Dimensions for Ceilings).

### Step 2: Define Components
Add components manually or rely on the template. Ensure every component has a correctly mapped **Usage Method**:
-   **Structure**: Studs/Runners use "Vertical" or "Track" logic.
-   **Surface**: Board uses "Coverage" logic.
-   **Labor**: "Framing Labor" uses Linear Feet logic; "Hanging" uses Square Feet logic.

### Step 3: Set Global Parameters (Prototype Mode)
If you haven't performed a takeoff yet, use the **Global Parameters** panel to test the assembly:
-   **Walls**: Enter `Length` and `Height`. The system calculates `Total LF` and `Total Wall Area`.
-   **Ceilings**: Enter **Total Area** and **Total Perimeter** directly. The system uses these values for all component calculations.

### Step 4: Review Pricing
The Data Grid provides a granular cost breakdown:
-   **Unit Mat / Unit Lab**: Verify the per-unit rates (derived from the Database or overridden).
-   **Tot Mat / Tot Lab**: Ensure the calculated totals match your expectation based on quantity.

---

## 3. Calculation Logic Matrix

The application uses a specific formula for every component based on its **Usage** string.

### A. Wall Framing Logic
Calculations are driven by Wall Length (`LF`) and Height (`H`).

| Usage Type | Formula | Variables |
| :--- | :--- | :--- |
| **Vertical Framing** | `((LF * 12 / OC) + Ends) * (1 + Waste)` | **OC**: Spacing (16", 24"). **Ends**: +2 per wall segment. **Waste**: Default 8%. |
| **Tracks / Runners** | `((LF * Multiplier) / Length) * (1 + Waste)` | **Multiplier**: 2 for Top/Bottom. 1 for Single. **Waste**: Default 5%. |
| **Framing Labor** | `Total Linear Feet` | **Calculates as**: 1 LF of Labor per 1 LF of Wall. |
| **Backing** | `(LF / 10) * (1 + Waste)` | Assumes 1 linear row. |

### B. Ceiling System Logic
Calculations are driven by Ceiling Area (`SF`) and Perimeter (`LF`). The system uses the direct **Total Area** and **Total Perimeter** inputs in prototype mode.

| Usage Type | Formula | Variables |
| :--- | :--- | :--- |
| **Suspension (Main)** | `(Area / Spacing(ft) / Length) * (1 + Waste)` | **Spacing**: e.g., 4ft OC. |
| **Suspension (Cross)** | `(Area / Spacing(ft) / Length) * (1 + Waste)` | **Spacing**: e.g., 2ft or 4ft OC. |
| **Perimeter Angle** | `(Total Perimeter / Length) * (1 + Waste)` | **Perimeter**: 2*(L+W). |
| **Hanger Wire** | `(Area / Spacing(sf)) * (1 + Waste)` | **Spacing**: 16sf per hanger. |
| **Ceiling Tile** | `(Area / TileSize) * (1 + Waste)` | **TileSize**: 4sf (2x2) or 8sf (2x4). |
| **Grid Labor** | `Total Ceiling Area` | **Unit**: SF. |

### C. Surface & Finish Logic
Driven by total surface area (`Wall Area` or `Ceiling Area`).

| Usage Type | Formula | Variables |
| :--- | :--- | :--- |
| **Coverage (Board)** | `((Area * Layers) / 48) * (1 + Waste)` | **Layers**: Editable count. **Ref**: 4x12 Sheet. |
| **Insulation** | `Total Area * (1 + Waste)` | **Unit**: SF. |
| **Joint Treatment** | `(Area / 500) * (1 + Waste)` | **Unit**: Bucket/Box coverage. |
| **Labor (Hang/Finish)**| `Total Area` | **Unit**: SF. |

### D. Cost Calculation
Pricing is split into Material and Labor components for full transparency.

1.  **Material Cost**: `Quantity * Unit Material Price`
2.  **Labor Cost**: `Quantity * Unit Labor Price` (or `Quantity * Hourly Rate / Production Rate`)
3.  **Total**: `Material Total + Labor Total`

*Note: You can override any unit price directly in the grid.*
