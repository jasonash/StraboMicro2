/**
 * Phase Selector Component
 *
 * Displays "Which Phases?" checkboxes populated from the sample's mineralogy data.
 * Used across multiple geological data dialogs (Grain Size, Fabrics, etc.).
 */

import {
  Box,
  FormControl,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Typography,
} from '@mui/material';

interface PhaseSelectorProps {
  availablePhases: string[]; // List of minerals from sample
  selectedPhases: string[];
  onChange: (phases: string[]) => void;
  label?: string;
  helperText?: string;
}

export function PhaseSelector({
  availablePhases,
  selectedPhases,
  onChange,
  label = 'Which Phases?',
  helperText,
}: PhaseSelectorProps) {
  const allPhasesChecked = availablePhases.length > 0 && selectedPhases.length === availablePhases.length;

  const handleAllPhasesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      // Select all phases
      onChange([...availablePhases]);
    } else {
      // Deselect all phases
      onChange([]);
    }
  };

  const handleChange = (phase: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      onChange([...selectedPhases, phase]);
    } else {
      onChange(selectedPhases.filter(p => p !== phase));
    }
  };

  if (availablePhases.length === 0) {
    return (
      <Box sx={{
        p: 2,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper'
      }}>
        <Typography variant="body2" color="text.primary" sx={{ fontStyle: 'italic' }}>
          No mineralogy data available for this micrograph.
          Please add minerals in the Mineralogy/Lithology dialog first.
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
      <FormGroup>
        {/* "All Phases" checkbox */}
        <FormControlLabel
          control={
            <Checkbox
              checked={allPhasesChecked}
              onChange={handleAllPhasesChange}
            />
          }
          label={<strong>All Phases</strong>}
          sx={{ mb: 1 }}
        />

        {/* Individual phase checkboxes */}
        {availablePhases.map((phase) => (
          <FormControlLabel
            key={phase}
            control={
              <Checkbox
                checked={selectedPhases.includes(phase)}
                onChange={handleChange(phase)}
              />
            }
            label={phase}
          />
        ))}
      </FormGroup>
    </FormControl>
  );
}
