/**
 * Detailed Notes Dialog
 *
 * Full-screen modal displaying all notes from a micrograph or spot.
 * Matches legacy detailedNotes.java and detailedNotes.fxml functionality.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Divider,
  Link,
  Stack,
  CircularProgress,
} from '@mui/material';
import { PictureAsPdf } from '@mui/icons-material';
import { useAppStore } from '@/store';
import { findMicrographById, findSpotById, getMicrographParentSample } from '@/store/helpers';

interface DetailedNotesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
  onEditSection: (sectionId: string) => void;
}

export function DetailedNotesDialog({ isOpen, onClose, micrographId, spotId, onEditSection }: DetailedNotesDialogProps) {
  const project = useAppStore((state) => state.project);
  const [isExporting, setIsExporting] = useState(false);

  // Get the micrograph or spot data
  const micrograph = micrographId ? findMicrographById(project, micrographId) : undefined;
  const spot = spotId ? findSpotById(project, spotId) : undefined;
  const data = micrograph || spot;

  // Get parent sample
  const sample = micrographId && project
    ? getMicrographParentSample(project, micrographId)
    : undefined;

  if (!data) {
    return null;
  }

  const entityName = data.name || (micrographId ? 'Unnamed Micrograph' : 'Unnamed Spot');
  const entityType = micrographId ? 'Micrograph' : 'Spot';

  // Helper to render a notes section
  const renderNoteSection = (label: string, notes: string | null | undefined, sectionId: string) => {
    if (!notes || notes.trim() === '') return null;

    return (
      <Box key={sectionId}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
            {label}
          </Typography>
          <Link
            component="button"
            variant="caption"
            onClick={() => {
              onEditSection(sectionId);
              onClose();
            }}
            sx={{ textDecoration: 'none', cursor: 'pointer' }}
          >
            (edit)
          </Link>
        </Box>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', mb: 2 }}>
          {notes}
        </Typography>
        <Divider sx={{ my: 2 }} />
      </Box>
    );
  };

  // Collect all note sections
  const noteSections: JSX.Element[] = [];

  // Project notes
  if (project?.notes) {
    const result = renderNoteSection('Project Notes', project.notes, 'project');
    if (result) {
      noteSections.push(result);
    }
  }

  // Sample notes
  if (sample?.sampleNotes) {
    const result = renderNoteSection('Sample Notes', sample.sampleNotes, 'sample');
    if (result) {
      noteSections.push(result);
    }
  }

  // Micrograph/Spot notes
  if (micrograph?.notes) {
    const result = renderNoteSection('Micrograph Notes', micrograph.notes, 'micrograph-notes');
    if (result) {
      noteSections.push(result);
    }
  } else if (spot?.notes) {
    const result = renderNoteSection('Spot Notes', spot.notes, 'spot-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Polish description
  if (micrograph?.polishDescription) {
    const result = renderNoteSection('Polish Description', micrograph.polishDescription, 'polish-description');
    if (result) {
      noteSections.push(result);
    }
  }

  // Instrument notes
  if (micrograph?.instrument?.instrumentNotes) {
    const result = renderNoteSection('Instrument Notes', micrograph.instrument.instrumentNotes, 'instrument-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Post processing notes
  if (micrograph?.instrument?.notesOnPostProcessing) {
    const result = renderNoteSection('Post Processing Notes', micrograph.instrument.notesOnPostProcessing, 'post-processing-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Mineralogy notes
  if (data.mineralogy?.notes) {
    const result = renderNoteSection('Mineralogy Notes', data.mineralogy.notes, 'mineralogy-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Lithology notes
  if (data.lithologyInfo?.notes) {
    const result = renderNoteSection('Lithology Notes', data.lithologyInfo.notes, 'lithology-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Grain size notes
  if (data.grainInfo?.grainSizeNotes) {
    const result = renderNoteSection('Grain Size Notes', data.grainInfo.grainSizeNotes, 'grain-size-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Grain shape notes
  if (data.grainInfo?.grainShapeNotes) {
    const result = renderNoteSection('Grain Shape Notes', data.grainInfo.grainShapeNotes, 'grain-shape-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Grain orientation notes
  if (data.grainInfo?.grainOrientationNotes) {
    const result = renderNoteSection('Grain Orientation Notes', data.grainInfo.grainOrientationNotes, 'grain-orientation-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Fabric notes
  if (data.fabricInfo?.notes) {
    const result = renderNoteSection('Fabric Notes', data.fabricInfo.notes, 'fabric-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Clastic deformation band notes
  if (data.clasticDeformationBandInfo?.notes) {
    const result = renderNoteSection('Clastic Deformation Band Notes', data.clasticDeformationBandInfo.notes, 'clastic-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Grain boundary notes
  if (data.grainBoundaryInfo?.notes) {
    const result = renderNoteSection('Grain Boundary/Contact Notes', data.grainBoundaryInfo.notes, 'grain-boundary-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Intragrain notes
  if (data.intraGrainInfo?.notes) {
    const result = renderNoteSection('Intragrain (Single Grain) Notes', data.intraGrainInfo.notes, 'intragrain-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Vein notes
  if (data.veinInfo?.notes) {
    const result = renderNoteSection('Vein Notes', data.veinInfo.notes, 'vein-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Pseudotachylyte notes
  if (data.pseudotachylyteInfo?.notes) {
    const result = renderNoteSection('Pseudotachylyte Notes', data.pseudotachylyteInfo.notes, 'pseudotachylyte-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Fold notes
  if (data.foldInfo?.notes) {
    const result = renderNoteSection('Fold Notes', data.foldInfo.notes, 'fold-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Faults/Shear zones notes
  if (data.faultsShearZonesInfo?.notes) {
    const result = renderNoteSection('Faults/Shear Zones Notes', data.faultsShearZonesInfo.notes, 'faults-shear-zones-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Extinction microstructures notes
  if (data.extinctionMicrostructureInfo?.notes) {
    const result = renderNoteSection('Extinction Microstructures Notes', data.extinctionMicrostructureInfo.notes, 'extinction-microstructures-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Fracture notes
  if (data.fractureInfo?.notes) {
    const result = renderNoteSection('Fracture Notes', data.fractureInfo.notes, 'fracture-notes');
    if (result) {
      noteSections.push(result);
    }
  }

  // Handle PDF export
  const handleExportPDF = async () => {
    if (!window.api || !project) return;

    setIsExporting(true);
    try {
      const result = await window.api.exportDetailedNotesToPDF(
        project,
        micrographId,
        spotId
      );

      if (result.success && !result.canceled) {
        // PDF exported successfully
        console.log(`PDF exported to: ${result.filePath}`);
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      // You could show a toast/snackbar here with error message
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
    >
      <DialogTitle>
        Detailed Notes for {entityType} {entityName}
      </DialogTitle>
      <DialogContent dividers>
        {noteSections.length > 0 ? (
          <Stack spacing={0}>
            {noteSections}
          </Stack>
        ) : (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              No detailed notes recorded for this {entityType.toLowerCase()}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={handleExportPDF}
          startIcon={isExporting ? <CircularProgress size={20} /> : <PictureAsPdf />}
          disabled={isExporting || noteSections.length === 0}
          variant="contained"
        >
          {isExporting ? 'Creating PDF...' : 'Create PDF'}
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
