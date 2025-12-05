/**
 * Incomplete Micrographs Dialog
 *
 * Displays a warning dialog when the user tries to export or upload a project
 * that contains micrographs missing required scale or location data.
 */

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Box,
  Chip,
  Stack,
} from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';
import type { ProjectMetadata } from '@/types/project-types';

export interface IncompleteMicrograph {
  id: string;
  name: string;
  needsScale: boolean;
  needsLocation: boolean;
  isReference: boolean;
}

interface IncompleteMicrographsDialogProps {
  open: boolean;
  onClose: () => void;
  micrographs: IncompleteMicrograph[];
  actionName: string; // e.g., "export" or "upload"
}

export function IncompleteMicrographsDialog({
  open,
  onClose,
  micrographs,
  actionName,
}: IncompleteMicrographsDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="incomplete-micrographs-dialog-title"
    >
      <DialogTitle id="incomplete-micrographs-dialog-title" sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <WarningIcon color="warning" />
          <span>Cannot {actionName} project</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ mb: 2 }}>
          The following micrographs are missing required scale or location data.
          Please set up these micrographs before {actionName}ing.
        </Typography>

        <Box
          sx={{
            maxHeight: 300,
            overflow: 'auto',
            bgcolor: 'action.hover',
            borderRadius: 1,
            mb: 2,
          }}
        >
          <List dense>
            {micrographs.map((micro) => (
              <ListItem key={micro.id}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <WarningIcon color="warning" fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={micro.name}
                  secondary={
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                      {micro.needsScale && (
                        <Chip
                          label="Needs scale"
                          size="small"
                          color="warning"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                      {micro.needsLocation && (
                        <Chip
                          label="Needs location"
                          size="small"
                          color="warning"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                    </Stack>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Box>

        <Typography variant="body2" color="text.secondary">
          <strong>To set scale:</strong> Right-click the micrograph in the tree and select "Set Scale"
          <br />
          <strong>To set location:</strong> Right-click the micrograph and select "Edit Location"
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained" autoFocus>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Helper function to find all incomplete micrographs in a project
 */
export function findIncompleteMicrographs(project: ProjectMetadata): IncompleteMicrograph[] {
  const incomplete: IncompleteMicrograph[] = [];

  for (const dataset of project.datasets ?? []) {
    for (const sample of dataset.samples ?? []) {
      for (const micro of sample.micrographs ?? []) {
        const isReference = !micro.parentID;
        const needsScale = !micro.scalePixelsPerCentimeter;
        const needsLocation = !isReference && !micro.offsetInParent && micro.xOffset === undefined;

        if (needsScale || needsLocation) {
          incomplete.push({
            id: micro.id,
            name: micro.name || micro.imageFilename || 'Unnamed',
            needsScale,
            needsLocation,
            isReference,
          });
        }
      }
    }
  }

  return incomplete;
}
