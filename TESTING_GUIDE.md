# Testing Guide: New Wizard Refactoring

This guide walks through testing the complete workflow of the refactored wizard system with the new tree-based UI.

## Overview

The new system breaks the monolithic wizard into four separate dialogs:
1. **New Project Dialog** - Project metadata only
2. **New Dataset Dialog** - Dataset name
3. **New Sample Dialog** - Sample metadata
4. **New Micrograph Dialog** - Full micrograph wizard (7-8 steps)

All dialogs are accessed via **"Add" buttons in the interactive tree view** in the left sidebar.

---

## Test Workflow

### 1. Start Fresh

**Action:** Clear any existing project data
- Go to: **Debug → Clear Project**
- Confirm the dialog
- **Expected:** Sidebar should show "No project loaded. Create a new project to get started."

---

### 2. Create New Project

**Action:** Create a new project
- Go to: **File → New Project** (or press `Cmd/Ctrl+N`)
- Fill in the form:
  - **Project Name:** "Test Project 2025" (required)
  - **Start Date:** 2025-01-01 (optional)
  - **End Date:** 2025-12-31 (optional)
  - **Purpose of Study:** "Testing new wizard system" (optional)
  - **GPS Datum:** WGS84 (default)
  - Leave other fields empty or fill as desired
- Click **"Create Project"**

**Expected Results:**
- ✅ Dialog closes
- ✅ Left sidebar shows project name: "Test Project 2025"
- ✅ Sidebar shows **"[+ Add Dataset]"** button
- ✅ Window title changes to: "StraboMicro - Test Project 2025"
- ✅ No error messages in console

---

### 3. Add First Dataset

**Action:** Add a dataset to the project
- In the left sidebar, click **"[+ Add Dataset]"** button
- Enter dataset name: "Field Season 2025"
- Click **"Create Dataset"**

**Expected Results:**
- ✅ Dialog closes
- ✅ Sidebar shows "📊 Field Season 2025" with collapse icon
- ✅ Dataset is collapsed by default
- ✅ No error messages

**Action:** Expand the dataset
- Click the expand icon (▶) next to "📊 Field Season 2025"

**Expected Results:**
- ✅ Dataset expands (▼)
- ✅ Shows **"[+ Add Sample]"** button underneath
- ✅ No samples listed yet

---

### 4. Add First Sample

**Action:** Add a sample to the dataset
- Click **"[+ Add Sample]"** button under "Field Season 2025"
- Fill in the form:
  - **Sample ID:** "SAMPLE-001" (required)
  - **Longitude:** -120.5 (optional, must be -180 to 180)
  - **Latitude:** 45.2 (optional, must be -90 to 90)
  - **Main Sampling Purpose:** Select "Fabric / Microstructure"
  - **Material Type:** Select "Intact Rock"
  - **Sample Notes:** "Test sample for wizard refactoring"
  - Leave other fields empty or fill as desired
- Click **"Create Sample"**

**Expected Results:**
- ✅ Dialog closes
- ✅ Sidebar shows "🔬 SAMPLE-001" under the dataset
- ✅ Sample is collapsed by default
- ✅ No error messages

**Action:** Expand the sample
- Click the expand icon (▶) next to "🔬 SAMPLE-001"

**Expected Results:**
- ✅ Sample expands (▼)
- ✅ Shows **"[+ Add Micrograph]"** button
- ✅ No micrographs listed yet

---

### 5. Add Reference Micrograph (Full Wizard Test)

**Action:** Add a reference micrograph to the sample
- Click **"[+ Add Micrograph]"** button under "SAMPLE-001"
- You should see: **"New Reference Micrograph"** dialog title

#### Step 1: Load Reference Micrograph
- Click **"Browse..."** button
- Select an image file (TIFF, JPEG, PNG, or BMP)
  - Test file suggestion: Use any test image you have available
- **Expected:** File path appears in the text field
- Click **"Next"**

#### Step 2: Instrument & Image Information
- **Instrument Type:** Select "Optical Microscopy" (required)
- **Data Type:** Auto-populated to "Optical"
- **Image Type:** Auto-populated to "Transmitted Light"
- Fill optional fields:
  - **Instrument Brand:** "Nikon"
  - **Instrument Model:** "Eclipse LV100"
  - **University:** "Test University"
  - **Laboratory:** "Geology Lab"
- Click **"Next"**

#### Step 3: Instrument Data (Optional)
- **Data Collection Software:** "NIS-Elements" (optional)
- **Data Collection Software Version:** "5.2" (optional)
- Leave other fields empty or fill as desired
- Click **"Next"**

#### Step 4: Micrograph Metadata
- **Micrograph Name:** "Test Micrograph 001" (optional but recommended)
- **Polished Sample:** Check the checkbox
- **Polish Description:** "Standard 30-micron thin section"
- **Micrograph Notes:** "Test micrograph for new wizard"
- Click **"Next"**

#### Step 5: Micrograph Orientation
- Select **"Unoriented Thin Section"** (simplest option for testing)
- Click **"Next"**

#### Step 6: Set Micrograph Scale
- Select **"Pixel Conversion Factor"** (simplest method for testing)
- Click **"Next"**

#### Step 7: Scale Input - Pixel Conversion Factor
- **Pixels:** 100
- **Physical Length:** 50
- **Units:** Select "μm"
- **Expected:** Shows "Pixels per μm: 2.0000"
- Click **"Finish"**

**Expected Results:**
- ✅ Dialog closes
- ✅ Sidebar shows "🖼️ Test Micrograph 001" under SAMPLE-001
- ✅ Micrograph appears in the tree
- ✅ Micrograph is selected (highlighted background)
- ✅ Main canvas loads the image
- ✅ No error messages in console

---

### 6. Add Associated Micrograph

**Action:** Add an associated (child) micrograph under the reference micrograph
- Click **"[+ Add Associated Micrograph]"** button under "Test Micrograph 001"
- You should see: **"New Associated Micrograph"** dialog title

**Test:** Go through the same wizard steps as in Test 5, but:
- Use a different image file
- Use different micrograph name: "Associated Micrograph 001"
- Click **"Finish"**

**Expected Results:**
- ✅ Dialog closes
- ✅ Sidebar shows "🖼️ Associated Micrograph 001" nested under "Test Micrograph 001"
- ✅ Micrograph hierarchy displays correctly (indented)
- ✅ Associated micrograph is selectable
- ✅ Can add another associated micrograph under "Associated Micrograph 001" (unlimited nesting)
- ✅ No error messages

---

### 7. Tree Navigation Tests

**Action:** Test tree expansion/collapse
- Click collapse icon (▼) next to "Test Micrograph 001"
- **Expected:** Associated micrographs hide
- Click expand icon (▶) to re-expand
- **Expected:** Associated micrographs show again

**Action:** Test sample collapse
- Click collapse icon next to "SAMPLE-001"
- **Expected:** All micrographs hide
- Click expand to re-expand

**Action:** Test dataset collapse
- Click collapse icon next to "Field Season 2025"
- **Expected:** All samples hide
- Click expand to re-expand

---

### 8. Add Second Dataset

**Action:** Test multiple datasets
- Click **"[+ Add Dataset]"** button at project level
- Enter dataset name: "Lab Analysis 2025"
- Click **"Create Dataset"**
- Expand the new dataset
- Add a sample to it
- Add a micrograph to that sample

**Expected Results:**
- ✅ Both datasets appear in the tree
- ✅ Each can be expanded/collapsed independently
- ✅ Data is properly organized

---

### 9. Micrograph Selection Test

**Action:** Click on different micrographs in the tree
- Click on "Test Micrograph 001"
- **Expected:** Highlighted background, image loads in main canvas
- Click on "Associated Micrograph 001"
- **Expected:** Different highlight, different image loads
- Click between multiple micrographs

**Expected Results:**
- ✅ Only one micrograph selected at a time
- ✅ Selection highlighting works correctly
- ✅ Main canvas updates to show selected micrograph
- ✅ No errors when switching

---

### 10. View Project Structure (Debug)

**Action:** Open the debug modal
- Go to: **Debug → Show Project Structure** (or press `Cmd/Ctrl+Shift+D`)

**Expected Results:**
- ✅ Modal shows complete JSON structure
- ✅ Structure matches what you created:
  - Project → datasets[] → samples[] → micrographs[]
  - Associated micrographs have `parentID` field set
- ✅ All metadata is preserved
- ✅ Can copy to clipboard

---

## Known Issues / Limitations

### Current Limitations:
1. **NewMicrographDialog `handleFinish()`**: Currently just logs to console
   - Needs implementation to call `addMicrograph()` from store
   - Associated micrographs need parent sample lookup

2. **Old NewProjectWizard**: Still present in codebase
   - Can be removed after testing confirms new system works

3. **No Edit Functionality Yet**: Can only add, not edit existing items
   - Edit Dataset/Sample/Micrograph dialogs needed in future

### Expected Console Warnings:
- Unused variables in NewMicrographDialog (intentional for future implementation):
  - `useAppStore`
  - `setMicrographPreviewUrl`
  - `setIsLoadingPreview`
  - `validateOrientationStep`

---

## Success Criteria

✅ **All dialogs open without errors**
✅ **Tree view builds correctly from project data**
✅ **Expansion/collapse works smoothly**
✅ **Micrograph selection updates active state**
✅ **Hierarchical "Add" buttons trigger correct dialogs**
✅ **Associated micrographs nest properly**
✅ **No TypeScript/React errors in console**
✅ **Project Debug Modal shows correct structure**

---

## Reporting Issues

If you encounter any issues during testing:

1. **Check Console:** Open DevTools Console for errors
2. **Check Project Structure:** Use Debug → Show Project Structure
3. **Document:**
   - What you did (step-by-step)
   - What you expected to happen
   - What actually happened
   - Any error messages in console
   - Screenshot if helpful

4. **Test Isolation:** Try to reproduce the issue with minimal steps

---

## Next Steps After Testing

Once testing confirms the new system works:
1. Remove old `NewProjectWizard.tsx` file
2. Implement `handleFinish()` in NewMicrographDialog
3. Add Edit dialogs for Dataset/Sample/Micrograph
4. Implement project file I/O (Phase 3)
