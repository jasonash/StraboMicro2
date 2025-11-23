/**
 * Metadata Summary Component
 *
 * Displays an accordion-style summary of all collected metadata for a micrograph or spot.
 * Each section has an edit icon that opens the corresponding metadata dialog.
 * Matches the legacy JavaFX interface (showMicrographDetails.java, showSpotDetails.java)
 */

import { useState, useEffect } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  IconButton,
  Box,
  Stack,
  Chip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import { useAppStore } from '@/store';
import { findMicrographById, findSpotById } from '@/store/helpers';

interface MetadataSummaryProps {
  micrographId?: string;
  spotId?: string;
  onEditSection: (sectionId: string) => void;
}

interface AccordionState {
  [key: string]: boolean;
}

export function MetadataSummary({ micrographId, spotId, onEditSection }: MetadataSummaryProps) {
  const project = useAppStore((state) => state.project);

  // Load expansion state from localStorage
  const [expanded, setExpanded] = useState<AccordionState>(() => {
    const saved = localStorage.getItem('metadataSummaryExpanded');
    return saved ? JSON.parse(saved) : {};
  });

  // Save expansion state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('metadataSummaryExpanded', JSON.stringify(expanded));
  }, [expanded]);

  const handleExpand = (panel: string) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded((prev) => ({ ...prev, [panel]: isExpanded }));
  };

  const handleEdit = (sectionId: string) => (event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent accordion from expanding/collapsing
    onEditSection(sectionId);
  };

  // Get the micrograph or spot data
  const micrograph = micrographId ? findMicrographById(project, micrographId) : undefined;
  const spot = spotId ? findSpotById(project, spotId) : undefined;
  const data = micrograph || spot;

  if (!data) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', p: 2 }}>
        No data available
      </Typography>
    );
  }

  // Helper to check if a section has data
  const hasData = (field: any): boolean => {
    if (field === null || field === undefined) return false;
    if (typeof field === 'string') return field.length > 0;
    if (typeof field === 'number') return true;
    if (typeof field === 'boolean') return true;
    if (Array.isArray(field)) return field.length > 0;
    if (typeof field === 'object') {
      // Check if object has any non-null values
      return Object.values(field).some(val => val !== null && val !== undefined);
    }
    return false;
  };

  // Count items in array-based data
  const getItemCount = (items: any[] | undefined | null): number => {
    return items?.length || 0;
  };

  return (
    <Stack spacing={0.5}>
      {/* Project/Dataset Metadata */}
      <Accordion
        expanded={expanded['project'] || false}
        onChange={handleExpand('project')}
        disableGutters
        sx={{ '&:before': { display: 'none' } }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            minHeight: 48,
            '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
          }}
        >
          <Typography variant="subtitle2">Project/Dataset Metadata</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton
            size="small"
            onClick={handleEdit('sample')}
            sx={{ mr: 1 }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </AccordionSummary>
        <AccordionDetails sx={{ py: 1 }}>
          <Stack spacing={1}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Project: {project?.name || 'Untitled Project'}
              </Typography>
            </Box>
            {/* TODO: Add dataset info when available */}
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Sample Metadata */}
      <Accordion
        expanded={expanded['sample'] || false}
        onChange={handleExpand('sample')}
        disableGutters
        sx={{ '&:before': { display: 'none' } }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            minHeight: 48,
            '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
          }}
        >
          <Typography variant="subtitle2">Sample Metadata</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton
            size="small"
            onClick={handleEdit('sample')}
            sx={{ mr: 1 }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </AccordionSummary>
        <AccordionDetails sx={{ py: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            Sample information
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* Micrograph/Spot Metadata */}
      <Accordion
        expanded={expanded['metadata'] || false}
        onChange={handleExpand('metadata')}
        disableGutters
        sx={{ '&:before': { display: 'none' } }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            minHeight: 48,
            '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
          }}
        >
          <Typography variant="subtitle2">
            {micrographId ? 'Micrograph' : 'Spot'} Metadata
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton
            size="small"
            onClick={handleEdit(micrographId ? 'micrograph' : 'spot')}
            sx={{ mr: 1 }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </AccordionSummary>
        <AccordionDetails sx={{ py: 1 }}>
          <Stack spacing={0.5}>
            {data.name && (
              <Box>
                <Typography variant="caption" color="text.secondary">Name: </Typography>
                <Typography variant="body2" component="span">{data.name}</Typography>
              </Box>
            )}
            {micrograph && micrograph.polish !== null && micrograph.polish !== undefined && (
              <Box>
                <Typography variant="caption" color="text.secondary">Polished: </Typography>
                <Typography variant="body2" component="span">
                  {micrograph.polish ? 'Yes' : 'No'}
                  {micrograph.polish && micrograph.polishDescription && ` (${micrograph.polishDescription})`}
                </Typography>
              </Box>
            )}
            {micrograph?.instrument?.instrumentType && (
              <Box>
                <Typography variant="caption" color="text.secondary">Instrument: </Typography>
                <Typography variant="body2" component="span">
                  {micrograph.instrument.instrumentType}
                </Typography>
              </Box>
            )}
            {micrograph?.imageType && (
              <Box>
                <Typography variant="caption" color="text.secondary">Image Type: </Typography>
                <Typography variant="body2" component="span">{micrograph.imageType}</Typography>
              </Box>
            )}
            {!data.name && !micrograph?.instrument && (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No metadata set
              </Typography>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Mineralogy/Lithology */}
      {(hasData(data.mineralogy) || hasData(data.lithologyInfo)) && (
        <Accordion
          expanded={expanded['mineralogy'] || false}
          onChange={handleExpand('mineralogy')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Mineralogy/Lithology</Typography>
            {data.mineralogy?.minerals && data.mineralogy.minerals.length > 0 && (
              <Chip label={`${data.mineralogy.minerals.length} minerals`} size="small" />
            )}
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              size="small"
              onClick={handleEdit('mineralogy')}
              sx={{ mr: 1 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={1}>
              {data.mineralogy?.minerals && data.mineralogy.minerals.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Minerals:
                  </Typography>
                  {data.mineralogy.minerals.map((mineral, index) => (
                    <Typography key={index} variant="body2">
                      {mineral.name}
                      {mineral.operator && mineral.percentage && ` ${mineral.operator} ${mineral.percentage}%`}
                    </Typography>
                  ))}
                </Box>
              )}
              {data.lithologyInfo?.lithologies && data.lithologyInfo.lithologies.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Lithology:
                  </Typography>
                  {data.lithologyInfo.lithologies.map((lithology, index) => (
                    <Typography key={index} variant="body2">
                      {lithology.level1}
                      {lithology.level2 && ` / ${lithology.level2}`}
                      {lithology.level3 && ` / ${lithology.level3}`}
                    </Typography>
                  ))}
                </Box>
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Grain Info */}
      {(hasData(data.grainInfo?.grainSizeInfo) ||
        hasData(data.grainInfo?.grainShapeInfo) ||
        hasData(data.grainInfo?.grainOrientationInfo)) && (
        <Accordion
          expanded={expanded['grain'] || false}
          onChange={handleExpand('grain')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Grain Info</Typography>
            <Chip
              label={`${
                getItemCount(data.grainInfo?.grainSizeInfo) +
                getItemCount(data.grainInfo?.grainShapeInfo) +
                getItemCount(data.grainInfo?.grainOrientationInfo)
              } items`}
              size="small"
            />
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              size="small"
              onClick={handleEdit('grain')}
              sx={{ mr: 1 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={1}>
              {data.grainInfo?.grainSizeInfo && data.grainInfo.grainSizeInfo.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {data.grainInfo.grainSizeInfo.length} grain size measurement{data.grainInfo.grainSizeInfo.length > 1 ? 's' : ''}
                  </Typography>
                </Box>
              )}
              {data.grainInfo?.grainShapeInfo && data.grainInfo.grainShapeInfo.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {data.grainInfo.grainShapeInfo.length} grain shape measurement{data.grainInfo.grainShapeInfo.length > 1 ? 's' : ''}
                  </Typography>
                </Box>
              )}
              {data.grainInfo?.grainOrientationInfo && data.grainInfo.grainOrientationInfo.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {data.grainInfo.grainOrientationInfo.length} grain orientation measurement{data.grainInfo.grainOrientationInfo.length > 1 ? 's' : ''}
                  </Typography>
                </Box>
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Fabric Info */}
      {hasData(data.fabricInfo?.fabrics) && (
        <Accordion
          expanded={expanded['fabric'] || false}
          onChange={handleExpand('fabric')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Fabric Info</Typography>
            <Chip label={`${getItemCount(data.fabricInfo?.fabrics)} fabrics`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              size="small"
              onClick={handleEdit('fabric')}
              sx={{ mr: 1 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {getItemCount(data.fabricInfo?.fabrics)} fabric{getItemCount(data.fabricInfo?.fabrics) > 1 ? 's' : ''} recorded
            </Typography>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Clastic Deformation Bands */}
      {hasData(data.clasticDeformationBandInfo?.bands) && (
        <Accordion
          expanded={expanded['clastic'] || false}
          onChange={handleExpand('clastic')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Clastic Deformation Bands</Typography>
            <Chip label={`${getItemCount(data.clasticDeformationBandInfo?.bands)} bands`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              size="small"
              onClick={handleEdit('clastic')}
              sx={{ mr: 1 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {getItemCount(data.clasticDeformationBandInfo?.bands)} deformation band{getItemCount(data.clasticDeformationBandInfo?.bands) > 1 ? 's' : ''} recorded
            </Typography>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Faults and Shear Zones */}
      {hasData(data.faultsShearZonesInfo?.faultsShearZones) && (
        <Accordion
          expanded={expanded['faultsShearZones'] || false}
          onChange={handleExpand('faultsShearZones')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Faults and Shear Zones</Typography>
            <Chip label={`${getItemCount(data.faultsShearZonesInfo?.faultsShearZones)} items`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              size="small"
              onClick={handleEdit('faultsShearZones')}
              sx={{ mr: 1 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {getItemCount(data.faultsShearZonesInfo?.faultsShearZones)} fault/shear zone{getItemCount(data.faultsShearZonesInfo?.faultsShearZones) > 1 ? 's' : ''} recorded
            </Typography>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Extinction Microstructures */}
      {hasData(data.extinctionMicrostructureInfo?.extinctionMicrostructures) && (
        <Accordion
          expanded={expanded['extinctionMicrostructures'] || false}
          onChange={handleExpand('extinctionMicrostructures')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Extinction Microstructures</Typography>
            <Chip label={`${getItemCount(data.extinctionMicrostructureInfo?.extinctionMicrostructures)} items`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              size="small"
              onClick={handleEdit('extinctionMicrostructures')}
              sx={{ mr: 1 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {getItemCount(data.extinctionMicrostructureInfo?.extinctionMicrostructures)} extinction microstructure{getItemCount(data.extinctionMicrostructureInfo?.extinctionMicrostructures) > 1 ? 's' : ''} recorded
            </Typography>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Grain Boundary/Contact Info */}
      {hasData(data.grainBoundaryInfo?.boundaries) && (
        <Accordion
          expanded={expanded['grainBoundary'] || false}
          onChange={handleExpand('grainBoundary')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Grain Boundary/Contact Info</Typography>
            <Chip label={`${getItemCount(data.grainBoundaryInfo?.boundaries)} items`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              size="small"
              onClick={handleEdit('grainBoundary')}
              sx={{ mr: 1 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {getItemCount(data.grainBoundaryInfo?.boundaries)} grain boundar{getItemCount(data.grainBoundaryInfo?.boundaries) > 1 ? 'ies' : 'y'} recorded
            </Typography>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Intragrain Info */}
      {hasData(data.intraGrainInfo?.grains) && (
        <Accordion
          expanded={expanded['intraGrain'] || false}
          onChange={handleExpand('intraGrain')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Intragrain (Single Grain) Info</Typography>
            <Chip label={`${getItemCount(data.intraGrainInfo?.grains)} items`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              size="small"
              onClick={handleEdit('intraGrain')}
              sx={{ mr: 1 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {getItemCount(data.intraGrainInfo?.grains)} intragrain structure{getItemCount(data.intraGrainInfo?.grains) > 1 ? 's' : ''} recorded
            </Typography>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Vein Info */}
      {hasData(data.veinInfo?.veins) && (
        <Accordion
          expanded={expanded['vein'] || false}
          onChange={handleExpand('vein')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Vein Info</Typography>
            <Chip label={`${getItemCount(data.veinInfo?.veins)} veins`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              size="small"
              onClick={handleEdit('vein')}
              sx={{ mr: 1 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {getItemCount(data.veinInfo?.veins)} vein{getItemCount(data.veinInfo?.veins) > 1 ? 's' : ''} recorded
            </Typography>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Pseudotachylyte Info */}
      {hasData(data.pseudotachylyteInfo?.pseudotachylytes) && (
        <Accordion
          expanded={expanded['pseudotachylyte'] || false}
          onChange={handleExpand('pseudotachylyte')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Pseudotachylyte Info</Typography>
            <Chip label={`${getItemCount(data.pseudotachylyteInfo?.pseudotachylytes)} items`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              size="small"
              onClick={handleEdit('pseudotachylyte')}
              sx={{ mr: 1 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {getItemCount(data.pseudotachylyteInfo?.pseudotachylytes)} pseudotachylyte{getItemCount(data.pseudotachylyteInfo?.pseudotachylytes) > 1 ? 's' : ''} recorded
            </Typography>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Fold Info */}
      {hasData(data.foldInfo?.folds) && (
        <Accordion
          expanded={expanded['fold'] || false}
          onChange={handleExpand('fold')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Fold Info</Typography>
            <Chip label={`${getItemCount(data.foldInfo?.folds)} folds`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              size="small"
              onClick={handleEdit('fold')}
              sx={{ mr: 1 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {getItemCount(data.foldInfo?.folds)} fold{getItemCount(data.foldInfo?.folds) > 1 ? 's' : ''} recorded
            </Typography>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Fracture Info */}
      {hasData(data.fractureInfo?.fractures) && (
        <Accordion
          expanded={expanded['fracture'] || false}
          onChange={handleExpand('fracture')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Fracture Info</Typography>
            <Chip label={`${getItemCount(data.fractureInfo?.fractures)} fractures`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              size="small"
              onClick={handleEdit('fracture')}
              sx={{ mr: 1 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {getItemCount(data.fractureInfo?.fractures)} fracture{getItemCount(data.fractureInfo?.fractures) > 1 ? 's' : ''} recorded
            </Typography>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Notes */}
      {hasData(data.notes) && (
        <Accordion
          expanded={expanded['notes'] || false}
          onChange={handleExpand('notes')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Notes</Typography>
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              size="small"
              onClick={handleEdit('notes')}
              sx={{ mr: 1 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Typography variant="body2">{data.notes}</Typography>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Associated Files */}
      {hasData(data.associatedFiles) && (
        <Accordion
          expanded={expanded['files'] || false}
          onChange={handleExpand('files')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Associated Files</Typography>
            <Chip label={`${getItemCount(data.associatedFiles)} files`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              size="small"
              onClick={handleEdit('files')}
              sx={{ mr: 1 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {data.associatedFiles?.map((file, index) => (
                <Typography key={index} variant="body2">
                  {file.fileName}
                </Typography>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Links */}
      {hasData(data.links) && (
        <Accordion
          expanded={expanded['links'] || false}
          onChange={handleExpand('links')}
          disableGutters
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
            }}
          >
            <Typography variant="subtitle2">Links</Typography>
            <Chip label={`${getItemCount(data.links)} links`} size="small" />
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              size="small"
              onClick={handleEdit('links')}
              sx={{ mr: 1 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </AccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              {data.links?.map((link, index) => (
                <Box key={index}>
                  <Typography variant="body2" fontWeight="medium">{link.label}</Typography>
                  <Typography variant="caption" color="primary" sx={{ wordBreak: 'break-all' }}>
                    {link.url}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Show empty state if no metadata exists */}
      {!hasData(data.mineralogy) &&
       !hasData(data.lithologyInfo) &&
       !hasData(data.grainInfo) &&
       !hasData(data.fabricInfo) &&
       !hasData(data.clasticDeformationBandInfo) &&
       !hasData(data.faultsShearZonesInfo) &&
       !hasData(data.extinctionMicrostructureInfo) &&
       !hasData(data.grainBoundaryInfo) &&
       !hasData(data.intraGrainInfo) &&
       !hasData(data.veinInfo) &&
       !hasData(data.pseudotachylyteInfo) &&
       !hasData(data.foldInfo) &&
       !hasData(data.fractureInfo) &&
       !hasData(data.notes) &&
       !hasData(data.associatedFiles) &&
       !hasData(data.links) && (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', p: 2, textAlign: 'center' }}>
          No metadata collected yet. Use the dropdown above to add data.
        </Typography>
      )}
    </Stack>
  );
}
