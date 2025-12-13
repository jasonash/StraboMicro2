/**
 * Point Count Statistics Dialog
 *
 * Modal dialog wrapper for displaying point counting statistics.
 */

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { PointCountingStatistics } from '../PointCountingStatistics';

interface PointCountStatisticsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string | null;
}

export function PointCountStatisticsDialog({
  isOpen,
  onClose,
  micrographId,
}: PointCountStatisticsDialogProps) {
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { maxHeight: '80vh' },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Point Count Statistics
        <IconButton size="small" onClick={onClose}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <PointCountingStatistics
          micrographId={micrographId}
          showExport={true}
          compact={false}
        />
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default PointCountStatisticsDialog;
