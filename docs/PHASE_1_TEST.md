# Phase 1 Test Plan: Upload UI + Excel Parser

## What Was Built
1. **Import Files button** - a button in the project page right panel header that opens a modal
2. **Import Files modal** - modal with drag-and-drop zone for `.pdf` and `.xlsx`, auto-detected by extension
3. **Excel parser** - server-side parsing via `/api/parse-takeoff` that groups by Wall Type + Height and sums LF
4. **Takeoff preview** - inside the modal, shows aggregated takeoff data (Assembly -> Height -> LF -> SF)
5. **Continue with Assemblies** - closes modal, loads parsed data into the existing project sidebar + takeoff schedule
6. **Old UI preserved** - left sidebar (assemblies) + right panel (takeoff schedule) remain unchanged

## Where to Find It
1. Go to the **Dashboard**
2. Click on any **project card** to open the project
3. The project page looks the same as before (assemblies on left, takeoff schedule on right)
4. In the **right panel header**, find the **"Import Files"** button (Upload icon)
5. Click it to open the Import Files modal

## Your OST Excel Column Headers
The parser handles these paired value+unit columns:
- **Wall Type** -> Assembly Code (e.g., P1, W4)
- **Height** -> Wall height in feet
- **wall Length/ Ceiling area** + **Unit** (next column) -> If Unit is "LF" it's wall length; if "SF" it's ceiling area
- **Area Parameter** + **Unit** (next column) -> Additional area data
- **Level** -> Floor level
- **Assembly type** -> Type (Wall, Ceiling, etc.)

## How to Test

### Test 1: Open a Project
- [ ] Go to Dashboard, click on a project card
- [ ] The project page loads with the **old familiar UI** (assemblies left, schedule right)
- [ ] You see an **"Import Files"** button in the right panel header area

### Test 2: Open the Import Modal
- [ ] Click the **"Import Files"** button
- [ ] A modal opens titled **"Import Project Files"**
- [ ] You see two upload slots: one for PDF, one for Excel
- [ ] The "Continue with Assemblies" button is **disabled** (greyed out)

### Test 3: Upload Your OST Excel File
- [ ] Drag and drop your `.xlsx` file onto the modal drop zone (or click to browse)
- [ ] You should see:
  - File appears in the Excel slot with a spreadsheet icon
  - Brief "Processing..." state, then green checkmark
  - **Takeoff Preview** appears below the upload slots inside the modal
- [ ] The "Continue with Assemblies" button is still disabled (need PDF too)

### Test 4: Verify Takeoff Preview Data (inside modal)
Look at the Takeoff Preview panel in the modal:
- [ ] All your Wall Types (P1, W4, etc.) are listed
- [ ] Click on each to expand and see height variants
- [ ] For each height variant, verify:
  - **Height** matches your Excel data
  - **LF** = sum of all `wall Length/ Ceiling area` values (where Unit = LF) for that Wall Type + Height combo
  - **SF** = Height * LF (or ceiling area if Unit was SF)
- [ ] Footer shows correct totals

### Test 5: Upload a PDF File
- [ ] Drop any `.pdf` file onto the same modal drop zone
- [ ] It should appear in the PDF slot with a document icon + green checkmark
- [ ] Now the **"Continue with Assemblies"** button should be **enabled** (green)

### Test 6: Continue with Assemblies
- [ ] Click **"Continue with Assemblies"**
- [ ] The modal closes
- [ ] The left sidebar should now show assembly cards for each Wall Type from the Excel
- [ ] The right panel takeoff schedule should be populated with the data

### Test 7: File Management (inside modal)
- [ ] Open the modal again
- [ ] Upload files, then click X on the Excel file - preview disappears
- [ ] Click X on the PDF file - Continue button becomes disabled
- [ ] Re-upload files - everything should work again

### Test 8: Error Handling
- [ ] Upload a non-.pdf/.xlsx file (e.g., .txt) - should be ignored
- [ ] Upload a broken/empty Excel file - should show error message in the Excel slot

## What to Expect (Visual Summary)

```
Project Page (unchanged):
┌─────────────────────────────────────────────────────────┐
│  Project Header  [Imperial]  [Materials] [Labor] ...    │
├────────────────┬────────────────────────────────────────┤
│                │  Takeoff Schedule   [Import Files btn] │
│  ASSEMBLIES    │                                        │
│  (left sidebar)│   (existing takeoff schedule view)     │
│                │                                        │
│  P1  ─────────│                                        │
│  W4  ─────────│                                        │
└────────────────┴────────────────────────────────────────┘

Import Files Modal (on button click):
┌─────────────────────────────────────────────┐
│  Import Project Files                    ✕  │
│  Upload your Wall Spec PDF and Takeoff      │
│  Schedule (.xlsx) to generate assemblies.   │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─ Drop zone ───────────────────────────┐  │
│  │  PDF:   Wall-Spec.pdf        ✅  ✕    │  │
│  │  Excel: OST-Takeoff.xlsx     ✅  ✕    │  │
│  └────────────────────────────────────────┘ │
│                                             │
│  ┌─ Takeoff Preview ─────────────────────┐  │
│  │ P1                                    │  │
│  │   Wall @ 9.7'  →  1717 LF  16655 SF  │  │
│  │   Wall @ 10'   →   264 LF   2640 SF  │  │
│  │ W4                                    │  │
│  │   Wall @ 12'   →   530 LF   6360 SF  │  │
│  └────────────────────────────────────────┘ │
│                                             │
│  [Cancel]          [Continue with Assemblies]│
└─────────────────────────────────────────────┘
```

## Known Limitations (Phase 1)
- PDF is uploaded but not parsed yet (Phase 2 will use AI to extract wall specs)
- No database matching yet (Phase 3)
- No assembly table output yet (Phase 4)

## If Something Doesn't Work
1. Note which test step failed
2. Share your exact column headers from the Excel (Row 1)
3. Share a screenshot if the UI looks broken
4. If the parser can't find columns, I'll adjust the matching patterns
