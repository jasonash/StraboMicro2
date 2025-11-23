/**
 * Single Phase Selector Component
 *
 * Displays radio buttons for selecting ONE phase from the sample's mineralogy data.
 * LEGACY MATCH: editExtinctionMicrostructure.java lines 162-183
 * Uses radio buttons with "None" option (single selection, not multiple)
 *
 * Different from PhaseSelector which uses checkboxes for multiple selection.
 */

import {
  Box,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Typography,
} from '@mui/material';

interface SinglePhaseSelectorProps {
  availablePhases: string[]; // List of minerals from sample
  selectedPhase: string; // Single selected phase (or empty string)
  onChange: (phase: string) => void;
  label?: string;
  helperText?: string;
}

export function SinglePhaseSelector({
  availablePhases,
  selectedPhase,
  onChange,
  label = 'Phase Involved:',
  helperText,
}: SinglePhaseSelectorProps) {
  if (availablePhases.length === 0) {
    return (
      <Box sx={{
        p: 2,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper'
      }}>
        <Typography variant="body2" color="text.primary">
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mt: 1 }}>
          No mineralogy found. If you would like to set phases for Extinction Microstructures, please set mineralogy first.
        </Typography>
      </Box>
    );
  }

  return (
    <FormControl component="fieldset" fullWidth>
      <FormLabel component="legend">{label}</FormLabel>
      {helperText && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, mb: 1 }}>
          {helperText}
        </Typography>
      )}
      <RadioGroup
        value={selectedPhase}
        onChange={(e) => onChange(e.target.value)}
      >
        {/* "None" option - LEGACY: line 166 in editExtinctionMicrostructure.java */}
        <FormControlLabel
          value=""
          control={<Radio />}
          label="None"
        />

        {/* Individual phase radio buttons - LEGACY: lines 173-182 */}
        {availablePhases.map((phase) => (
          <FormControlLabel
            key={phase}
            value={phase}
            control={<Radio />}
            label={phase}
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
}
