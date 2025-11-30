/**
 * WizardProgress Component
 *
 * A clean, compact progress indicator for multi-step wizards.
 * Shows current step number, total steps, step name, and a progress bar.
 *
 * Replaces the crowded MUI Stepper with a simpler design:
 * - "Step 3 of 7" text
 * - Progress bar showing percentage complete
 * - Current step name/label
 *
 * Usage:
 * ```tsx
 * <WizardProgress
 *   currentStep={2}
 *   totalSteps={7}
 *   stepLabel="Instrument Settings"
 * />
 * ```
 */

import { Box, Typography, LinearProgress } from '@mui/material';

interface WizardProgressProps {
  /** Current step number (1-indexed for display, but 0-indexed internally is fine) */
  currentStep: number;
  /** Total number of steps in the wizard */
  totalSteps: number;
  /** Label/name of the current step */
  stepLabel: string;
  /** Whether to use 0-indexed steps (default: true, so step 0 displays as "Step 1") */
  zeroIndexed?: boolean;
}

export function WizardProgress({
  currentStep,
  totalSteps,
  stepLabel,
  zeroIndexed = true,
}: WizardProgressProps) {
  // Convert to 1-indexed for display if needed
  const displayStep = zeroIndexed ? currentStep + 1 : currentStep;

  // Calculate progress percentage (0-100)
  // For a wizard with N steps, step 1 = 0%, step N = 100%
  const progressPercent = totalSteps > 1
    ? ((displayStep - 1) / (totalSteps - 1)) * 100
    : 100;

  return (
    <Box sx={{ pt: 2, pb: 3 }}>
      {/* Step counter and label row */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          mb: 1,
        }}
      >
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontWeight: 500 }}
        >
          Step {displayStep} of {totalSteps}
        </Typography>
        <Typography
          variant="body1"
          sx={{ fontWeight: 600 }}
        >
          {stepLabel}
        </Typography>
      </Box>

      {/* Progress bar */}
      <LinearProgress
        variant="determinate"
        value={progressPercent}
        sx={{
          height: 6,
          borderRadius: 3,
          backgroundColor: 'action.hover',
          '& .MuiLinearProgress-bar': {
            borderRadius: 3,
          },
        }}
      />
    </Box>
  );
}

export default WizardProgress;
