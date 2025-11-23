/**
 * Detailed Notes Panel Component
 *
 * Displays all notes from various metadata sections for a micrograph or spot.
 * Shows notes with headings and edit links, matching legacy showMicrographDetails.java
 * and showSpotDetails.java allNotesVBox behavior.
 */

import {
  Box,
  Typography,
  Divider,
  Link,
  Stack,
} from '@mui/material';
import { useAppStore } from '@/store';
import { findMicrographById, findSpotById, getMicrographParentSample } from '@/store/helpers';

interface DetailedNotesPanelProps {
  micrographId?: string;
  spotId?: string;
  onEditSection: (sectionId: string) => void;
  onViewAllNotes: () => void;
}

export function DetailedNotesPanel({ micrographId, spotId, onEditSection, onViewAllNotes }: DetailedNotesPanelProps) {
  const project = useAppStore((state) => state.project);

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

  // Helper to render a notes section
  const renderNoteSection = (label: string, notes: string | null | undefined, sectionId: string, showDivider: boolean = true) => {
    if (!notes || notes.trim() === '') return null;

    return (
      <Box key={sectionId}>
        {showDivider && <Divider sx={{ my: 1 }} />}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
            {label}
          </Typography>
          <Link
            component="button"
            variant="caption"
            onClick={() => onEditSection(sectionId)}
            sx={{ textDecoration: 'none', cursor: 'pointer' }}
          >
            (edit)
          </Link>
        </Box>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {notes}
        </Typography>
      </Box>
    );
  };

  // Collect all note sections
  const noteSections: JSX.Element[] = [];
  let isFirst = true;

  // Project notes
  const projectNotes = renderNoteSection('Project Notes', project?.notes, 'project', !isFirst);
  if (projectNotes) {
    noteSections.push(projectNotes);
    isFirst = false;
  }

  // Dataset notes (if dataset has notes field in the future)
  // Note: Dataset currently doesn't have notes field, but keeping structure for consistency

  // Sample notes
  if (sample?.sampleNotes) {
    const result = renderNoteSection('Sample Notes', sample.sampleNotes, 'sample', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Micrograph/Spot notes
  if (micrograph?.notes) {
    const result = renderNoteSection('Micrograph Notes', micrograph.notes, 'micrograph', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  } else if (spot?.notes) {
    const result = renderNoteSection('Spot Notes', spot.notes, 'spot', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Polish description
  if (micrograph?.polishDescription) {
    const result = renderNoteSection('Polish Description', micrograph.polishDescription, 'micrograph', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Instrument notes
  if (micrograph?.instrument?.instrumentNotes) {
    const result = renderNoteSection('Instrument Notes', micrograph.instrument.instrumentNotes, 'micrograph', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Post processing notes
  if (micrograph?.instrument?.notesOnPostProcessing) {
    const result = renderNoteSection('Post Processing Notes', micrograph.instrument.notesOnPostProcessing, 'micrograph', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Mineralogy notes
  if (data.mineralogy?.notes) {
    const result = renderNoteSection('Mineralogy Notes', data.mineralogy.notes, 'mineralogy', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Lithology notes
  if (data.lithologyInfo?.notes) {
    const result = renderNoteSection('Lithology Notes', data.lithologyInfo.notes, 'mineralogy', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Grain size notes
  if (data.grainInfo?.grainSizeNotes) {
    const result = renderNoteSection('Grain Size Notes', data.grainInfo.grainSizeNotes, 'grain', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Grain shape notes
  if (data.grainInfo?.grainShapeNotes) {
    const result = renderNoteSection('Grain Shape Notes', data.grainInfo.grainShapeNotes, 'grain', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Grain orientation notes
  if (data.grainInfo?.grainOrientationNotes) {
    const result = renderNoteSection('Grain Orientation Notes', data.grainInfo.grainOrientationNotes, 'grain', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Fabric notes
  if (data.fabricInfo?.notes) {
    const result = renderNoteSection('Fabric Notes', data.fabricInfo.notes, 'fabric', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Clastic deformation band notes
  if (data.clasticDeformationBandInfo?.notes) {
    const result = renderNoteSection('Clastic Deformation Band Notes', data.clasticDeformationBandInfo.notes, 'clastic', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Grain boundary notes
  if (data.grainBoundaryInfo?.notes) {
    const result = renderNoteSection('Grain Boundary/Contact Notes', data.grainBoundaryInfo.notes, 'grainBoundary', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Intragrain notes
  if (data.intraGrainInfo?.notes) {
    const result = renderNoteSection('Intragrain (Single Grain) Notes', data.intraGrainInfo.notes, 'intraGrain', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Vein notes
  if (data.veinInfo?.notes) {
    const result = renderNoteSection('Vein Notes', data.veinInfo.notes, 'vein', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Pseudotachylyte notes
  if (data.pseudotachylyteInfo?.notes) {
    const result = renderNoteSection('Pseudotachylyte Notes', data.pseudotachylyteInfo.notes, 'pseudotachylyte', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Fold notes
  if (data.foldInfo?.notes) {
    const result = renderNoteSection('Fold Notes', data.foldInfo.notes, 'fold', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Faults/Shear zones notes
  if (data.faultsShearZonesInfo?.notes) {
    const result = renderNoteSection('Faults/Shear Zones Notes', data.faultsShearZonesInfo.notes, 'faultsShearZones', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Extinction microstructures notes
  if (data.extinctionMicrostructureInfo?.notes) {
    const result = renderNoteSection('Extinction Microstructures Notes', data.extinctionMicrostructureInfo.notes, 'extinctionMicrostructures', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // Fracture notes
  if (data.fractureInfo?.notes) {
    const result = renderNoteSection('Fracture Notes', data.fractureInfo.notes, 'fracture', !isFirst);
    if (result) {
      noteSections.push(result);
      isFirst = false;
    }
  }

  // If no notes exist at all
  if (noteSections.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', textAlign: 'center' }}>
          No detailed notes recorded
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Detailed Notes</Typography>
        <Link
          component="button"
          variant="body2"
          onClick={onViewAllNotes}
          sx={{ cursor: 'pointer' }}
        >
          View All Notes
        </Link>
      </Box>
      <Stack spacing={1}>
        {noteSections}
      </Stack>
    </Box>
  );
}
