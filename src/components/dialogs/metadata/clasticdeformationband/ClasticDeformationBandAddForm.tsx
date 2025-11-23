/**
 * Clastic Deformation Band Add/Edit Form
 *
 * MATCHES LEGACY: editClasticDeformationBand.java
 * - 4 checkboxes: Cataclastic, Dilation, Shear, Compaction
 * - Conditional fields: Aperture (Dilation), Offset (Shear)
 * - Thickness field with units
 * - Cements field (comma-separated mineral list)
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Typography,
  TextField,
} from '@mui/material';
import { UnitInput } from '../reusable/UnitInput';
import { AutocompleteMineralSearch } from '../reusable/AutocompleteMineralSearch';

export interface ClasticDeformationBandTypeData {
  type: string; // "Cataclastic", "Dilation", "Shear", "Compaction"
  aperture: number | null;
  apertureUnit: string;
  offset: number | null;
  offsetUnit: string;
}

export interface ClasticDeformationBandData {
  types: ClasticDeformationBandTypeData[];
  thickness: number | null;
  thicknessUnit: string;
  cements: string;
}

interface ClasticDeformationBandAddFormProps {
  onAdd: (band: ClasticDeformationBandData) => void;
  onCancel?: () => void;
  initialData?: ClasticDeformationBandData;
}

const SIZE_UNITS = ['um', 'mm', 'cm'];

export function ClasticDeformationBandAddForm({ onAdd, onCancel, initialData }: ClasticDeformationBandAddFormProps) {
  // Checkbox states
  const [cataclastic, setCataclastic] = useState(false);
  const [dilation, setDilation] = useState(false);
  const [shear, setShear] = useState(false);
  const [compaction, setCompaction] = useState(false);

  // Conditional field values
  const [aperture, setAperture] = useState<number | ''>('');
  const [apertureUnit, setApertureUnit] = useState('um');
  const [offset, setOffset] = useState<number | ''>('');
  const [offsetUnit, setOffsetUnit] = useState('um');

  // Common fields
  const [thickness, setThickness] = useState<number | ''>('');
  const [thicknessUnit, setThicknessUnit] = useState('um');
  const [cements, setCements] = useState('');

  // Autocomplete mineral search (separate from cements display)
  const [mineralSearchKey, setMineralSearchKey] = useState(0); // Used to force reset autocomplete

  // Load existing data when editing
  useEffect(() => {
    if (!initialData) return;

    // Load types
    if (initialData.types) {
      initialData.types.forEach(type => {
        if (type.type === 'Cataclastic') {
          setCataclastic(true);
        } else if (type.type === 'Dilation') {
          setDilation(true);
          if (type.aperture !== null) {
            setAperture(type.aperture);
            setApertureUnit(type.apertureUnit || 'um');
          }
        } else if (type.type === 'Shear') {
          setShear(true);
          if (type.offset !== null) {
            setOffset(type.offset);
            setOffsetUnit(type.offsetUnit || 'um');
          }
        } else if (type.type === 'Compaction') {
          setCompaction(true);
        }
      });
    }

    // Load common fields
    if (initialData.thickness !== null) {
      setThickness(initialData.thickness);
      setThicknessUnit(initialData.thicknessUnit || 'um');
    }
    if (initialData.cements) {
      setCements(initialData.cements);
    }
  }, [initialData]);

  const handleMineralSelected = (mineralName: string | null) => {
    if (!mineralName) return;

    // Append to cements list (comma-separated)
    if (cements === '') {
      setCements(mineralName);
    } else {
      setCements(cements + ', ' + mineralName);
    }

    // Force reset the autocomplete by changing its key
    setMineralSearchKey(prev => prev + 1);
  };

  const handleSubmit = () => {
    // Build types array based on checkboxes
    const types: ClasticDeformationBandTypeData[] = [];

    if (cataclastic) {
      types.push({
        type: 'Cataclastic',
        aperture: null,
        apertureUnit: 'um',
        offset: null,
        offsetUnit: 'um',
      });
    }

    if (dilation) {
      types.push({
        type: 'Dilation',
        aperture: aperture === '' ? null : aperture,
        apertureUnit: apertureUnit,
        offset: null,
        offsetUnit: 'um',
      });
    }

    if (shear) {
      types.push({
        type: 'Shear',
        aperture: null,
        apertureUnit: 'um',
        offset: offset === '' ? null : offset,
        offsetUnit: offsetUnit,
      });
    }

    if (compaction) {
      types.push({
        type: 'Compaction',
        aperture: null,
        apertureUnit: 'um',
        offset: null,
        offsetUnit: 'um',
      });
    }

    const bandData: ClasticDeformationBandData = {
      types: types,
      thickness: thickness === '' ? null : thickness,
      thicknessUnit: thicknessUnit,
      cements: cements,
    };

    onAdd(bandData);

    // Reset form if adding new (not editing)
    if (!initialData) {
      setCataclastic(false);
      setDilation(false);
      setShear(false);
      setCompaction(false);
      setAperture('');
      setApertureUnit('um');
      setOffset('');
      setOffsetUnit('um');
      setThickness('');
      setThicknessUnit('um');
      setCements('');
      setMineralSearchKey(prev => prev + 1);
    }
  };

  // Form is valid if at least one type is selected
  const isValid = cataclastic || dilation || shear || compaction;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Band Types Section */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Band Type:</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Cataclastic */}
          <FormControlLabel
            control={
              <Checkbox
                checked={cataclastic}
                onChange={(e) => setCataclastic(e.target.checked)}
              />
            }
            label="Cataclastic"
          />

          {/* Dilation */}
          <Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={dilation}
                  onChange={(e) => {
                    setDilation(e.target.checked);
                    if (!e.target.checked) {
                      setAperture('');
                      setApertureUnit('um');
                    }
                  }}
                />
              }
              label="Dilation"
            />
            {dilation && (
              <Box sx={{ ml: 4, mt: 1 }}>
                <UnitInput
                  value={aperture}
                  unit={apertureUnit}
                  onValueChange={setAperture}
                  onUnitChange={setApertureUnit}
                  units={SIZE_UNITS}
                  label="Aperture"
                  min={0}
                />
              </Box>
            )}
          </Box>

          {/* Shear */}
          <Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={shear}
                  onChange={(e) => {
                    setShear(e.target.checked);
                    if (!e.target.checked) {
                      setOffset('');
                      setOffsetUnit('um');
                    }
                  }}
                />
              }
              label="Shear"
            />
            {shear && (
              <Box sx={{ ml: 4, mt: 1 }}>
                <UnitInput
                  value={offset}
                  unit={offsetUnit}
                  onValueChange={setOffset}
                  onUnitChange={setOffsetUnit}
                  units={SIZE_UNITS}
                  label="Offset"
                  min={0}
                />
              </Box>
            )}
          </Box>

          {/* Compaction */}
          <FormControlLabel
            control={
              <Checkbox
                checked={compaction}
                onChange={(e) => setCompaction(e.target.checked)}
              />
            }
            label="Compaction"
          />
        </Box>
      </Box>

      {/* Thickness */}
      <UnitInput
        value={thickness}
        unit={thicknessUnit}
        onValueChange={setThickness}
        onUnitChange={setThicknessUnit}
        units={SIZE_UNITS}
        label="Thickness"
        min={0}
      />

      {/* Cements - Matches legacy pattern: autocomplete field + display field */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Cements:</Typography>

        {/* Autocomplete field for searching/selecting minerals */}
        <AutocompleteMineralSearch
          key={mineralSearchKey}
          selectedMinerals={[]}
          onChange={(minerals) => {
            if (minerals.length > 0) {
              handleMineralSelected(minerals[minerals.length - 1]);
            }
          }}
          multiple={false}
          label="Search and select mineral to add"
        />

        {/* Display field showing comma-separated list of selected minerals */}
        <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'flex-start' }}>
          <TextField
            fullWidth
            label="Selected Cements"
            value={cements}
            multiline
            rows={2}
            InputProps={{
              readOnly: true,
            }}
            helperText="Comma-separated list of selected cements"
          />
          <Button
            variant="outlined"
            onClick={() => setCements('')}
            disabled={!cements}
            sx={{ minWidth: '80px', height: '56px' }}
          >
            Clear
          </Button>
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
