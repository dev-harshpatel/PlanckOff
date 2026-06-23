# How PlanckOff Estimates a Wall — Simple Overview

---

## The Problem We're Solving

When a contractor gets a set of construction drawings, someone has to manually read every wall type, figure out every material that goes into it, and price it all out. For a building with 30 different wall types, this takes days and is prone to human error.

PlanckOff automates this. You upload the drawings and a takeoff sheet, and it produces a complete, priced bill of materials — in minutes.

---

## The Three Databases Behind It

Before anything runs, we maintain three reference databases that encode all the knowledge:

| Database | What's in it | Example |
|---|---|---|
| **Material Database** | Every material we use — boards, studs, tracks, screws, tape, insulation — with sizes, prices, and which labour code applies | 16mm Type X drywall board → $X/sheet → labour code LAB-HNG |
| **Labour Database** | Every labour task with rates, broken down by wall height | Install drywall hanging at standard height → $Y per SF |
| **Assembly Bunch Database** | Templates: for each assembly type, the exact list of materials that go into it | A single-layer drywall wall always needs: board + screws + tape + compound + caulk |

Think of the Assembly Bunch Database as a recipe book. "Framing a wall" always needs the same ingredients — studs, tracks, bridging, screws. We've codified all those recipes.

---

## What Happens When You Upload a Drawing

### Step 1 — Read the Drawing (AI)

The system reads the PDF drawing and extracts every wall type description.

**Example — Wall Type P1 from the drawing:**
```
16 mm GYPSUM WALLBOARD TYPE 'X'
92 mm STEEL STUDS AT 400 mm O.C.
92 mm BATT INSULATION
16 mm GYPSUM WALLBOARD TYPE 'X'
```

This gives us the raw text for P1.

---

### Step 2 — Understand the Specification (Rules)

The system reads that text and extracts the key facts:

| What we detect | Value | How |
|---|---|---|
| Location | Wall | "STUDS" keyword |
| Board thickness | 16 mm → **5/8"** | Metric to imperial conversion |
| Board type | **Type X** | "TYPE 'X'" keyword |
| Stud size | 92 mm → **3-5/8"** | Metric to imperial conversion |
| Number of layers | **1 (single)** | No "2 LAYERS" or "DOUBLE" mentioned |
| Insulation | **Yes, 92mm batt** | "BATT INSULATION" keyword |

No AI involved here — pure conversion tables and keyword matching.

---

### Step 3 — Pick the Right Recipes (Assembly Classification)

Using those facts, the system selects which assembly templates apply to P1:

| Template Selected | Why |
|---|---|
| **FR-WALL** (Steel Framing — Wall) | Steel studs detected |
| **DW-SGL-WALL** (Single Layer Drywall — Wall) | Board present + single layer |
| **INS-WALL** (Insulation — Wall) | Batt insulation detected |

A double-layer wall would have selected **DW-DBL-WALL** instead.

---

### Step 4 — Expand the Recipes into a Full Material List

Each template is a list of items. The system opens each one:

**FR-WALL recipe → 7 items**
- 3-5/8" Steel Studs *(size resolved from 92mm)*
- 3-5/8" Steel Track *(size resolved from 92mm)*
- 3-5/8" Slotted Track *(size resolved from 92mm)*
- Framing Screws
- CRC Bridging
- Gas Nails
- Layout Labour

**DW-SGL-WALL recipe → 6 items**
- 5/8" Type X Drywall Board *(size + type resolved from 16mm Type X)*
- Drywall Screws
- Paper Tape
- Joint Compound
- Sound Caulk
- Fire Caulk

**INS-WALL recipe → 1 item**
- 3-5/8" Batt Insulation *(size resolved from 92mm)*

**Total for Wall Type P1: ~14 material line items** — fully identified, no guessing.

---

### Step 5 — Attach Prices and Labour

For each material item, the system looks up:
- **Unit price** from the Material Database
- **Labour code** from the Material Database (each material knows what labour task installs it)
- **Labour rate** from the Labour Database — adjusted for wall height

| Material | Labour Task | Height Adjustment |
|---|---|---|
| Steel Studs | Install Framing | Rate changes above 12 ft, 16 ft, 20 ft, 24 ft |
| Drywall Board | Drywall Hanging | Rate changes above 12 ft, 16 ft, 20 ft, 24 ft |
| Tape + Compound | Drywall Finishing | Rate changes above 12 ft |
| Batt Insulation | Install Insulation | Standard rate |
| Screws / Fasteners | *(no direct labour — included in framing/hanging)* | — |

---

### Step 6 — Multiply by Quantities from the Takeoff Sheet

The takeoff sheet tells the system:
- How many linear feet of Wall Type P1 exist on each floor
- The height of each wall segment

The system applies formulas to each material (e.g. board area = length × height × 2 sides) and produces final quantities and costs.

---

## End Result

A complete, line-by-line cost estimate covering every wall type in the building:

| Wall Type | Material Cost | Labour Cost | Total |
|---|---|---|---|
| P1 | $X,XXX | $X,XXX | $XX,XXX |
| P2 | ... | ... | ... |
| ... | | | |
| **Project Total** | | | **$XXX,XXX** |

Broken down by trade, floor, and cost code — ready for review and submission.

---

## What Makes This Different from AI Guessing

Most AI-based estimating tools ask an AI to "figure out" the materials. This produces plausible-sounding but often wrong answers that are hard to audit.

PlanckOff uses AI only for **reading the drawing text** (Step 1) — a task AI is genuinely good at. Everything after that — the material selection, pricing, and quantity calculation — follows deterministic rules backed by your own database. Every number is traceable to a specific rule and a specific database entry.

If a number is wrong, you can point to exactly why and fix the rule or the database entry. There is no black box.
