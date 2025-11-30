/**
 * Extinction Microstructure Add/Edit Form
 *
 * LEGACY MATCH: editExtinctionMicrostructure.java + editExtinctionMicrostructure.fxml
 * Form for adding or editing extinction microstructures.
 * Uses RADIO BUTTONS for single phase selection (not checkboxes)
 * Contains 7 nested sub-type arrays.
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import { SinglePhaseSelector } from '../reusable/SinglePhaseSelector';

export interface ExtinctionDislocationData {
  type: string;
}

export interface ExtinctionDislocationSubData {
  type: string;
}

export interface ExtinctionHeteroData {
  type: string;
}

export interface ExtinctionSubgrainData {
  type: string;
}

export interface ExtinctionBandsData {
  type: string;
}

export interface ExtinctionWideBandsData {
  type: string;
}

export interface ExtinctionFineBandsData {
  type: string;
}

export interface ExtinctionMicrostructureData {
  phase: string; // LEGACY: Single string (not array), uses radio buttons
  dislocations: ExtinctionDislocationData[];
  subDislocations: ExtinctionDislocationSubData[];
  heterogeneousExtinctions: ExtinctionHeteroData[];
  subGrainStructures: ExtinctionSubgrainData[];
  extinctionBands: ExtinctionBandsData[];
  subWideExtinctionBands: ExtinctionWideBandsData[];
  subFineExtinctionBands: ExtinctionFineBandsData[];
}

interface ExtinctionMicrostructureAddFormProps {
  availablePhases: string[]; // List of minerals from sample mineralogy
  onAdd: (data: ExtinctionMicrostructureData) => void;
  onCancel?: () => void;
  initialData?: ExtinctionMicrostructureData;
}

// LEGACY MATCH: editExtinctionMicrostructure.java lines 13-28
// Uses individual checkbox state, not dropdown menus

export function ExtinctionMicrostructureAddForm({
  availablePhases,
  onAdd,
  onCancel,
  initialData
}: ExtinctionMicrostructureAddFormProps) {
  // Phase selection
  const [phase, setPhase] = useState<string>(initialData?.phase || '');

  // Dislocations checkboxes (lines 37-43, 103-104 in legacy)
  const [dislocationCheckBox, setDislocationCheckBox] = useState(false);
  const [tangleCheckBox, setTangleCheckBox] = useState(false);

  // Sub-dislocations (lines 20-22, 107-112)
  const [edgeCheckBox, setEdgeCheckBox] = useState(false);
  const [screwCheckBox, setScrewCheckBox] = useState(false);
  const [unknownCheckBox, setUnknownCheckBox] = useState(false);

  // Heterogeneous extinction (lines 46-55, 115-121)
  const [patchyCheckBox, setPatchyCheckBox] = useState(false);
  const [unduloseCheckBox, setUnduloseCheckBox] = useState(false);
  const [chessboardCheckBox, setChessboardCheckBox] = useState(false);
  const [sweepingCheckBox, setSweepingCheckBox] = useState(false);

  // Subgrain structures (lines 58-66, 124-127)
  const [lowAngleCheckBox, setLowAngleCheckBox] = useState(false);

  // Extinction bands (lines 71-94, 130-136)
  const [wideExtinctionCheckBox, setWideExtinctionCheckBox] = useState(false);
  const [fineExtinctionCheckBox, setFineExtinctionCheckBox] = useState(false);
  const [localizedExtinctionCheckBox, setLocalizedExtinctionCheckBox] = useState(false);

  // Wide extinction bands sub-types (lines 24-25, 138-143)
  const [kinkBandsCheckBox, setKinkBandsCheckBox] = useState(false);
  const [deformationBandsCheckBox, setDeformationBandsCheckBox] = useState(false);

  // Fine extinction bands sub-types (lines 27-28, 145-150)
  const [deformationLamellaeCheckBox, setDeformationLamellaeCheckBox] = useState(false);
  const [smallWavelengthCheckBox, setSmallWavelengthCheckBox] = useState(false);

  // Load existing data when editing (lines 235-298 in legacy)
  useEffect(() => {
    if (!initialData) return;

    setPhase(initialData.phase || '');

    // Populate dislocations
    if (initialData.dislocations) {
      initialData.dislocations.forEach(d => {
        if (d.type === 'Dislocation') setDislocationCheckBox(true);
        if (d.type === 'Tangle or pile-up') setTangleCheckBox(true);
      });
    }

    // Populate sub-dislocations
    if (initialData.subDislocations) {
      initialData.subDislocations.forEach(s => {
        if (s.type === 'Edge') setEdgeCheckBox(true);
        if (s.type === 'Screw') setScrewCheckBox(true);
        if (s.type === 'Unknown') setUnknownCheckBox(true);
      });
    }

    // Populate heterogeneous extinctions
    if (initialData.heterogeneousExtinctions) {
      initialData.heterogeneousExtinctions.forEach(h => {
        if (h.type === 'Patchy') setPatchyCheckBox(true);
        if (h.type === 'Undulose') setUnduloseCheckBox(true);
        if (h.type === 'Chessboard') setChessboardCheckBox(true);
        if (h.type === 'Sweeping undulose') setSweepingCheckBox(true);
      });
    }

    // Populate subgrain structures
    if (initialData.subGrainStructures) {
      initialData.subGrainStructures.forEach(s => {
        if (s.type === 'Low-angle grain boundary') setLowAngleCheckBox(true);
      });
    }

    // Populate extinction bands
    if (initialData.extinctionBands) {
      initialData.extinctionBands.forEach(b => {
        if (b.type === 'Wide extinction bands') setWideExtinctionCheckBox(true);
        if (b.type === 'Fine extinction bands') setFineExtinctionCheckBox(true);
        if (b.type === 'Localized extinction bands') setLocalizedExtinctionCheckBox(true);
      });
    }

    // Populate wide extinction bands
    if (initialData.subWideExtinctionBands) {
      initialData.subWideExtinctionBands.forEach(w => {
        if (w.type === 'Kink bands') setKinkBandsCheckBox(true);
        if (w.type === 'Deformation bands') setDeformationBandsCheckBox(true);
      });
    }

    // Populate fine extinction bands
    if (initialData.subFineExtinctionBands) {
      initialData.subFineExtinctionBands.forEach(f => {
        if (f.type === 'Deformation lamellae') setDeformationLamellaeCheckBox(true);
        if (f.type === 'Small wavelength undulatory extinction') setSmallWavelengthCheckBox(true);
      });
    }
  }, [initialData]);

  // Submit handler (lines 88-154 in legacy)
  const handleSubmit = () => {
    const data: ExtinctionMicrostructureData = {
      phase: phase,
      dislocations: [],
      subDislocations: [],
      heterogeneousExtinctions: [],
      subGrainStructures: [],
      extinctionBands: [],
      subWideExtinctionBands: [],
      subFineExtinctionBands: [],
    };

    // Build dislocations array (lines 100-105)
    if (dislocationCheckBox || tangleCheckBox) {
      if (dislocationCheckBox) data.dislocations.push({ type: 'Dislocation' });
      if (tangleCheckBox) data.dislocations.push({ type: 'Tangle or pile-up' });
    }

    // Build sub-dislocations array (lines 107-113)
    if (edgeCheckBox || screwCheckBox || unknownCheckBox) {
      if (edgeCheckBox) data.subDislocations.push({ type: 'Edge' });
      if (screwCheckBox) data.subDislocations.push({ type: 'Screw' });
      if (unknownCheckBox) data.subDislocations.push({ type: 'Unknown' });
    }

    // Build heterogeneous extinctions array (lines 115-122)
    if (patchyCheckBox || unduloseCheckBox || chessboardCheckBox || sweepingCheckBox) {
      if (patchyCheckBox) data.heterogeneousExtinctions.push({ type: 'Patchy' });
      if (unduloseCheckBox) data.heterogeneousExtinctions.push({ type: 'Undulose' });
      if (chessboardCheckBox) data.heterogeneousExtinctions.push({ type: 'Chessboard' });
      if (sweepingCheckBox) data.heterogeneousExtinctions.push({ type: 'Sweeping undulose' });
    }

    // Build subgrain structures array (lines 124-128)
    if (lowAngleCheckBox) {
      data.subGrainStructures.push({ type: 'Low-angle grain boundary' });
    }

    // Build extinction bands array (lines 130-136)
    if (wideExtinctionCheckBox || fineExtinctionCheckBox || localizedExtinctionCheckBox) {
      if (wideExtinctionCheckBox) data.extinctionBands.push({ type: 'Wide extinction bands' });
      if (fineExtinctionCheckBox) data.extinctionBands.push({ type: 'Fine extinction bands' });
      if (localizedExtinctionCheckBox) data.extinctionBands.push({ type: 'Localized extinction bands' });
    }

    // Build wide extinction bands array (lines 138-143)
    if (kinkBandsCheckBox || deformationBandsCheckBox) {
      if (kinkBandsCheckBox) data.subWideExtinctionBands.push({ type: 'Kink bands' });
      if (deformationBandsCheckBox) data.subWideExtinctionBands.push({ type: 'Deformation bands' });
    }

    // Build fine extinction bands array (lines 145-150)
    if (deformationLamellaeCheckBox || smallWavelengthCheckBox) {
      if (deformationLamellaeCheckBox) data.subFineExtinctionBands.push({ type: 'Deformation lamellae' });
      if (smallWavelengthCheckBox) data.subFineExtinctionBands.push({ type: 'Small wavelength undulatory extinction' });
    }

    onAdd(data);

    // Reset form if adding new (not editing)
    if (!initialData) {
      setPhase('');
      setDislocationCheckBox(false);
      setTangleCheckBox(false);
      setEdgeCheckBox(false);
      setScrewCheckBox(false);
      setUnknownCheckBox(false);
      setPatchyCheckBox(false);
      setUnduloseCheckBox(false);
      setChessboardCheckBox(false);
      setSweepingCheckBox(false);
      setLowAngleCheckBox(false);
      setWideExtinctionCheckBox(false);
      setFineExtinctionCheckBox(false);
      setLocalizedExtinctionCheckBox(false);
      setKinkBandsCheckBox(false);
      setDeformationBandsCheckBox(false);
      setDeformationLamellaeCheckBox(false);
      setSmallWavelengthCheckBox(false);
    }
  };

  // Validation: at least one checkbox must be selected (line 300 sets disabled initially)
  const isValid = dislocationCheckBox || tangleCheckBox || patchyCheckBox || unduloseCheckBox ||
                  chessboardCheckBox || sweepingCheckBox || lowAngleCheckBox || wideExtinctionCheckBox ||
                  fineExtinctionCheckBox || localizedExtinctionCheckBox;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Phase Involved - LEGACY: lines 32-41 (FXML), 162-183 (Java) */}
      <SinglePhaseSelector
        availablePhases={availablePhases}
        selectedPhase={phase}
        onChange={setPhase}
        label="Phase Involved:"
      />

      {/* Heterogeneous extinction - LEGACY: lines 42-57 (FXML), 115-121 (Java) */}
      <Box>
        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
          Heterogeneous extinction:
        </Typography>
        <Box sx={{ ml: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <FormControlLabel
            control={<Checkbox checked={patchyCheckBox} onChange={(e) => setPatchyCheckBox(e.target.checked)} />}
            label="Patchy"
          />
          <FormControlLabel
            control={<Checkbox checked={unduloseCheckBox} onChange={(e) => setUnduloseCheckBox(e.target.checked)} />}
            label="Undulose"
          />
          <FormControlLabel
            control={<Checkbox checked={chessboardCheckBox} onChange={(e) => setChessboardCheckBox(e.target.checked)} />}
            label="Chessboard"
          />
          <FormControlLabel
            control={<Checkbox checked={sweepingCheckBox} onChange={(e) => setSweepingCheckBox(e.target.checked)} />}
            label="Sweeping undulose"
          />
        </Box>
      </Box>

      {/* Subgrain Structures - LEGACY: lines 58-70 (FXML), 124-127 (Java) */}
      <Box>
        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
          Subgrain Structures:
        </Typography>
        <Box sx={{ ml: 2 }}>
          <FormControlLabel
            control={<Checkbox checked={lowAngleCheckBox} onChange={(e) => setLowAngleCheckBox(e.target.checked)} />}
            label="Low-angle grain boundary"
          />
        </Box>
      </Box>

      {/* Extinction bands - LEGACY: lines 71-95 (FXML), 130-150 (Java) */}
      <Box>
        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
          Extinction bands:
        </Typography>
        <Box sx={{ ml: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {/* Wide extinction bands with sub-options */}
          <FormControlLabel
            control={
              <Checkbox
                checked={wideExtinctionCheckBox}
                onChange={(e) => {
                  setWideExtinctionCheckBox(e.target.checked);
                  if (!e.target.checked) {
                    setKinkBandsCheckBox(false);
                    setDeformationBandsCheckBox(false);
                  }
                }}
              />
            }
            label="Wide extinction bands"
          />
          {wideExtinctionCheckBox && (
            <Box sx={{ ml: 4, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <FormControlLabel
                control={<Checkbox checked={kinkBandsCheckBox} onChange={(e) => setKinkBandsCheckBox(e.target.checked)} />}
                label="Kink bands"
              />
              <FormControlLabel
                control={<Checkbox checked={deformationBandsCheckBox} onChange={(e) => setDeformationBandsCheckBox(e.target.checked)} />}
                label="Deformation bands"
              />
            </Box>
          )}

          {/* Fine extinction bands with sub-options */}
          <FormControlLabel
            control={
              <Checkbox
                checked={fineExtinctionCheckBox}
                onChange={(e) => {
                  setFineExtinctionCheckBox(e.target.checked);
                  if (!e.target.checked) {
                    setDeformationLamellaeCheckBox(false);
                    setSmallWavelengthCheckBox(false);
                  }
                }}
              />
            }
            label="Fine extinction bands"
          />
          {fineExtinctionCheckBox && (
            <Box sx={{ ml: 4, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <FormControlLabel
                control={<Checkbox checked={deformationLamellaeCheckBox} onChange={(e) => setDeformationLamellaeCheckBox(e.target.checked)} />}
                label="Deformation lamellae"
              />
              <FormControlLabel
                control={<Checkbox checked={smallWavelengthCheckBox} onChange={(e) => setSmallWavelengthCheckBox(e.target.checked)} />}
                label="Small wavelength undulatory extinction"
              />
            </Box>
          )}

          <FormControlLabel
            control={<Checkbox checked={localizedExtinctionCheckBox} onChange={(e) => setLocalizedExtinctionCheckBox(e.target.checked)} />}
            label="Localized extinction bands"
          />
        </Box>
      </Box>

      {/* Dislocations (e.g., TEM) - LEGACY: lines 96-114 (FXML), 100-112 (Java) */}
      <Box>
        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
          Dislocations (e.g., TEM):
        </Typography>
        <Box sx={{ ml: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {/* Dislocation with sub-options */}
          <FormControlLabel
            control={
              <Checkbox
                checked={dislocationCheckBox}
                onChange={(e) => {
                  setDislocationCheckBox(e.target.checked);
                  if (!e.target.checked) {
                    setEdgeCheckBox(false);
                    setScrewCheckBox(false);
                    setUnknownCheckBox(false);
                  }
                }}
              />
            }
            label="Dislocation"
          />
          {dislocationCheckBox && (
            <Box sx={{ ml: 4, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <FormControlLabel
                control={<Checkbox checked={edgeCheckBox} onChange={(e) => setEdgeCheckBox(e.target.checked)} />}
                label="Edge"
              />
              <FormControlLabel
                control={<Checkbox checked={screwCheckBox} onChange={(e) => setScrewCheckBox(e.target.checked)} />}
                label="Screw"
              />
              <FormControlLabel
                control={<Checkbox checked={unknownCheckBox} onChange={(e) => setUnknownCheckBox(e.target.checked)} />}
                label="Unknown"
              />
            </Box>
          )}

          <FormControlLabel
            control={<Checkbox checked={tangleCheckBox} onChange={(e) => setTangleCheckBox(e.target.checked)} />}
            label="Tangle or pile-up"
          />
        </Box>
      </Box>

      {/* Submit Button */}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 2 }}>
        {onCancel && (
          <Button onClick={onCancel} variant="outlined">
            Cancel Edit
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!isValid}
        >
          {initialData ? 'Update' : 'Add'}
        </Button>
      </Box>
    </Box>
  );
}
