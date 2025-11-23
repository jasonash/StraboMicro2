/**
 * Grain Boundary Add/Edit Form
 *
 * Form for adding or editing a single grain boundary.
 * Matches legacy JavaFX implementation exactly for data compatibility.
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  FormControl,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Radio,
  RadioGroup,
  Checkbox,
  TextField,
} from '@mui/material';
import { useAppStore } from '@/store';
import { findMicrographById, findSpotById, getAvailablePhasesFromMicrograph, getAvailablePhasesFromSpot } from '@/store/helpers';

export interface GrainBoundaryMorphologyData {
  type: string;
}

export interface GrainBoundaryDescriptorSubTypeData {
  type: string;
  otherType?: string;
}

export interface GrainBoundaryDescriptorData {
  type: string;
  subTypes?: GrainBoundaryDescriptorSubTypeData[];
}

export interface GrainBoundaryData {
  typeOfBoundary: string;  // "phase" or "grain"
  phase1: string | null;
  phase2: string | null;
  morphologies: GrainBoundaryMorphologyData[];
  descriptors: GrainBoundaryDescriptorData[];
}

interface GrainBoundaryAddFormProps {
  onAdd: (boundary: GrainBoundaryData) => void;
  onCancel?: () => void;
  initialData?: GrainBoundaryData;
  micrographId?: string;
  spotId?: string;
}

const DEFAULT_BOUNDARY: GrainBoundaryData = {
  typeOfBoundary: '',
  phase1: null,
  phase2: null,
  morphologies: [],
  descriptors: [],
};

export function GrainBoundaryAddForm({
  onAdd,
  onCancel,
  initialData,
  micrographId,
  spotId,
}: GrainBoundaryAddFormProps) {
  const project = useAppStore((state) => state.project);

  const [formData, setFormData] = useState<GrainBoundaryData>(initialData || DEFAULT_BOUNDARY);
  const [availablePhases, setAvailablePhases] = useState<string[]>([]);

  // State for morphology checkboxes
  const [cuspate, setCuspate] = useState(false);
  const [sutured, setSutured] = useState(false);
  const [serrated, setSerrated] = useState(false);
  const [lobate, setLobate] = useState(false);
  const [straight, setStraight] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [overgrowth, setOvergrowth] = useState(false);
  const [island, setIsland] = useState(false);

  // State for descriptor checkboxes
  const [fillingDecoration, setFillingDecoration] = useState(false);
  const [fillingMinorPhase, setFillingMinorPhase] = useState(false);
  const [fillingFluidInclusion, setFillingFluidInclusion] = useState(false);
  const [fillingOther, setFillingOther] = useState(false);
  const [fillingOtherText, setFillingOtherText] = useState('');

  const [tripleJunction, setTripleJunction] = useState(false);
  const [triple120, setTriple120] = useState(false);
  const [tripleTJunction, setTripleTJunction] = useState(false);
  const [tripleOther, setTripleOther] = useState(false);
  const [tripleOtherText, setTripleOtherText] = useState('');

  const [fourGrainJunction, setFourGrainJunction] = useState(false);
  const [grainNeighborSwitching, setGrainNeighborSwitching] = useState(false);
  const [corona, setCorona] = useState(false);

  // Load available phases from mineralogy
  useEffect(() => {
    if (!project) return;

    let phases: string[] = [];

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      phases = getAvailablePhasesFromMicrograph(micrograph);
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      phases = getAvailablePhasesFromSpot(spot);
    }

    setAvailablePhases(phases);
  }, [project, micrographId, spotId]);

  // Load initial data
  useEffect(() => {
    if (!initialData) return;

    setFormData(initialData);

    // Set morphology checkboxes
    initialData.morphologies.forEach(morph => {
      if (morph.type === 'Cuspate') setCuspate(true);
      if (morph.type === 'Sutured') setSutured(true);
      if (morph.type === 'Serrated') setSerrated(true);
      if (morph.type === 'Lobate') setLobate(true);
      if (morph.type === 'Straight') setStraight(true);
      if (morph.type === 'Pinned') setPinned(true);
      if (morph.type === 'Overgrowth') setOvergrowth(true);
      if (morph.type === 'Island') setIsland(true);
    });

    // Set descriptor checkboxes
    initialData.descriptors.forEach(desc => {
      if (desc.type === 'Filling/Decoration') {
        setFillingDecoration(true);
        desc.subTypes?.forEach(sub => {
          if (sub.type === 'Minor Phase') setFillingMinorPhase(true);
          if (sub.type === 'Fluid Inclusion') setFillingFluidInclusion(true);
          if (sub.type === 'Other') {
            setFillingOther(true);
            setFillingOtherText(sub.otherType || '');
          }
        });
      }
      if (desc.type === 'Triple Junction') {
        setTripleJunction(true);
        desc.subTypes?.forEach(sub => {
          if (sub.type === '120') setTriple120(true);
          if (sub.type === 'T-Junction') setTripleTJunction(true);
          if (sub.type === 'Other') {
            setTripleOther(true);
            setTripleOtherText(sub.otherType || '');
          }
        });
      }
      if (desc.type === 'Four-Grain Junction') setFourGrainJunction(true);
      if (desc.type === 'Grain Neighbor Switching') setGrainNeighborSwitching(true);
      if (desc.type === 'Corona') setCorona(true);
    });
  }, [initialData]);

  const handleSubmit = () => {
    // Build morphologies array
    const morphologies: GrainBoundaryMorphologyData[] = [];
    if (cuspate) morphologies.push({ type: 'Cuspate' });
    if (sutured) morphologies.push({ type: 'Sutured' });
    if (serrated) morphologies.push({ type: 'Serrated' });
    if (lobate) morphologies.push({ type: 'Lobate' });
    if (straight) morphologies.push({ type: 'Straight' });
    if (pinned) morphologies.push({ type: 'Pinned' });
    if (overgrowth) morphologies.push({ type: 'Overgrowth' });
    if (island) morphologies.push({ type: 'Island' });

    // Build descriptors array
    const descriptors: GrainBoundaryDescriptorData[] = [];

    if (fillingDecoration) {
      const subTypes: GrainBoundaryDescriptorSubTypeData[] = [];
      if (fillingMinorPhase) subTypes.push({ type: 'Minor Phase' });
      if (fillingFluidInclusion) subTypes.push({ type: 'Fluid Inclusion' });
      if (fillingOther) subTypes.push({ type: 'Other', otherType: fillingOtherText });

      descriptors.push({
        type: 'Filling/Decoration',
        subTypes: subTypes.length > 0 ? subTypes : undefined,
      });
    }

    if (tripleJunction) {
      const subTypes: GrainBoundaryDescriptorSubTypeData[] = [];
      if (triple120) subTypes.push({ type: '120' });
      if (tripleTJunction) subTypes.push({ type: 'T-Junction' });
      if (tripleOther) subTypes.push({ type: 'Other', otherType: tripleOtherText });

      descriptors.push({
        type: 'Triple Junction',
        subTypes: subTypes.length > 0 ? subTypes : undefined,
      });
    }

    if (fourGrainJunction) descriptors.push({ type: 'Four-Grain Junction' });
    if (grainNeighborSwitching) descriptors.push({ type: 'Grain Neighbor Switching' });
    if (corona) descriptors.push({ type: 'Corona' });

    const boundary: GrainBoundaryData = {
      typeOfBoundary: formData.typeOfBoundary,
      phase1: formData.phase1,
      phase2: formData.phase2,
      morphologies,
      descriptors,
    };

    onAdd(boundary);

    if (!initialData) {
      // Reset form
      setFormData(DEFAULT_BOUNDARY);
      setCuspate(false);
      setSutured(false);
      setSerrated(false);
      setLobate(false);
      setStraight(false);
      setPinned(false);
      setOvergrowth(false);
      setIsland(false);
      setFillingDecoration(false);
      setFillingMinorPhase(false);
      setFillingFluidInclusion(false);
      setFillingOther(false);
      setFillingOtherText('');
      setTripleJunction(false);
      setTriple120(false);
      setTripleTJunction(false);
      setTripleOther(false);
      setTripleOtherText('');
      setFourGrainJunction(false);
      setGrainNeighborSwitching(false);
      setCorona(false);
    }
  };

  // Validation logic (matches legacy updateAddButton function)
  const isValid =
    (formData.phase1 !== null && formData.phase1 !== 'None') ||
    (formData.phase2 !== null && formData.phase2 !== 'None') ||
    cuspate || sutured || serrated || lobate || straight || pinned || overgrowth || island ||
    fillingDecoration || tripleJunction || fourGrainJunction || grainNeighborSwitching || corona;

  // If "Other" is checked, text field must be filled
  const isValidWithOther =
    isValid &&
    (!fillingOther || fillingOtherText.trim() !== '') &&
    (!tripleOther || tripleOtherText.trim() !== '');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* 1. Type of Boundary */}
      <FormControl component="fieldset">
        <FormLabel component="legend" sx={{ fontWeight: 600, fontSize: '1rem', mb: 1 }}>
          Phase Boundary (2 phases) or Grain Boundary (single phase)?
        </FormLabel>
        <RadioGroup
          value={formData.typeOfBoundary}
          onChange={(e) => setFormData(prev => ({ ...prev, typeOfBoundary: e.target.value }))}
        >
          <FormControlLabel value="phase" control={<Radio />} label="Phase Boundary" />
          <FormControlLabel value="grain" control={<Radio />} label="Grain Boundary" />
        </RadioGroup>
      </FormControl>

      {/* 2. Phases */}
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Phase(s) Involved:
        </Typography>

        {availablePhases.length === 0 ? (
          <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary', pl: 2 }}>
            No mineralogy was found. If you wish to set phase information for grain boundaries, please set mineralogy first.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', gap: 4, pl: 2 }}>
            {/* Phase 1 Column */}
            <FormControl component="fieldset">
              <FormLabel component="legend" sx={{ fontWeight: 600, mb: 1 }}>
                Phase 1:
              </FormLabel>
              <RadioGroup
                value={formData.phase1 || 'None'}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  phase1: e.target.value === 'None' ? null : e.target.value
                }))}
              >
                <FormControlLabel value="None" control={<Radio />} label="None" />
                {availablePhases.map(phase => (
                  <FormControlLabel key={phase} value={phase} control={<Radio />} label={phase} />
                ))}
              </RadioGroup>
            </FormControl>

            {/* Phase 2 Column */}
            <FormControl component="fieldset">
              <FormLabel component="legend" sx={{ fontWeight: 600, mb: 1 }}>
                Phase 2:
              </FormLabel>
              <RadioGroup
                value={formData.phase2 || 'None'}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  phase2: e.target.value === 'None' ? null : e.target.value
                }))}
              >
                <FormControlLabel value="None" control={<Radio />} label="None" />
                {availablePhases.map(phase => (
                  <FormControlLabel key={phase} value={phase} control={<Radio />} label={phase} />
                ))}
              </RadioGroup>
            </FormControl>
          </Box>
        )}
      </Box>

      {/* 3. Morphology */}
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Boundary Morphology:
        </Typography>
        <FormGroup sx={{ pl: 2 }}>
          <FormControlLabel
            control={<Checkbox checked={cuspate} onChange={(e) => setCuspate(e.target.checked)} />}
            label="Cuspate"
          />
          <FormControlLabel
            control={<Checkbox checked={sutured} onChange={(e) => setSutured(e.target.checked)} />}
            label="Sutured"
          />
          <FormControlLabel
            control={<Checkbox checked={serrated} onChange={(e) => setSerrated(e.target.checked)} />}
            label="Serrated"
          />
          <FormControlLabel
            control={<Checkbox checked={lobate} onChange={(e) => setLobate(e.target.checked)} />}
            label="Lobate"
          />
          <FormControlLabel
            control={<Checkbox checked={straight} onChange={(e) => setStraight(e.target.checked)} />}
            label="Straight"
          />
          <FormControlLabel
            control={<Checkbox checked={pinned} onChange={(e) => setPinned(e.target.checked)} />}
            label="Pinned"
          />
          <FormControlLabel
            control={<Checkbox checked={overgrowth} onChange={(e) => setOvergrowth(e.target.checked)} />}
            label="Overgrowth"
          />
          <FormControlLabel
            control={<Checkbox checked={island} onChange={(e) => setIsland(e.target.checked)} />}
            label="Island"
          />
        </FormGroup>
      </Box>

      {/* 4. Descriptors */}
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Boundary Descriptors:
        </Typography>
        <FormGroup sx={{ pl: 2 }}>
          {/* Filling/Decoration */}
          <FormControlLabel
            control={
              <Checkbox
                checked={fillingDecoration}
                onChange={(e) => {
                  setFillingDecoration(e.target.checked);
                  if (!e.target.checked) {
                    setFillingMinorPhase(false);
                    setFillingFluidInclusion(false);
                    setFillingOther(false);
                    setFillingOtherText('');
                  }
                }}
              />
            }
            label="Filling/Decoration"
          />
          {fillingDecoration && (
            <Box sx={{ pl: 4 }}>
              <FormGroup>
                <FormControlLabel
                  control={<Checkbox checked={fillingMinorPhase} onChange={(e) => setFillingMinorPhase(e.target.checked)} />}
                  label="Minor Phase"
                />
                <FormControlLabel
                  control={<Checkbox checked={fillingFluidInclusion} onChange={(e) => setFillingFluidInclusion(e.target.checked)} />}
                  label="Fluid Inclusion"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={fillingOther}
                      onChange={(e) => {
                        setFillingOther(e.target.checked);
                        if (!e.target.checked) setFillingOtherText('');
                      }}
                    />
                  }
                  label="Other"
                />
                {fillingOther && (
                  <TextField
                    size="small"
                    placeholder="Specify other type..."
                    value={fillingOtherText}
                    onChange={(e) => setFillingOtherText(e.target.value)}
                    sx={{ ml: 4, maxWidth: 250 }}
                  />
                )}
              </FormGroup>
            </Box>
          )}

          {/* Triple Junction */}
          <FormControlLabel
            control={
              <Checkbox
                checked={tripleJunction}
                onChange={(e) => {
                  setTripleJunction(e.target.checked);
                  if (!e.target.checked) {
                    setTriple120(false);
                    setTripleTJunction(false);
                    setTripleOther(false);
                    setTripleOtherText('');
                  }
                }}
              />
            }
            label="Triple Junction"
          />
          {tripleJunction && (
            <Box sx={{ pl: 4 }}>
              <FormGroup>
                <FormControlLabel
                  control={<Checkbox checked={triple120} onChange={(e) => setTriple120(e.target.checked)} />}
                  label="120"
                />
                <FormControlLabel
                  control={<Checkbox checked={tripleTJunction} onChange={(e) => setTripleTJunction(e.target.checked)} />}
                  label="T-Junction"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={tripleOther}
                      onChange={(e) => {
                        setTripleOther(e.target.checked);
                        if (!e.target.checked) setTripleOtherText('');
                      }}
                    />
                  }
                  label="Other"
                />
                {tripleOther && (
                  <TextField
                    size="small"
                    placeholder="Specify other type..."
                    value={tripleOtherText}
                    onChange={(e) => setTripleOtherText(e.target.value)}
                    sx={{ ml: 4, maxWidth: 250 }}
                  />
                )}
              </FormGroup>
            </Box>
          )}

          {/* Other Descriptors */}
          <FormControlLabel
            control={<Checkbox checked={fourGrainJunction} onChange={(e) => setFourGrainJunction(e.target.checked)} />}
            label="Four-Grain Junction"
          />
          <FormControlLabel
            control={<Checkbox checked={grainNeighborSwitching} onChange={(e) => setGrainNeighborSwitching(e.target.checked)} />}
            label="Grain Neighbor Switching"
          />
          <FormControlLabel
            control={<Checkbox checked={corona} onChange={(e) => setCorona(e.target.checked)} />}
            label="Corona"
          />
        </FormGroup>
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
          disabled={!isValidWithOther}
        >
          {initialData ? 'Update' : 'Add'}
        </Button>
      </Box>
    </Box>
  );
}
