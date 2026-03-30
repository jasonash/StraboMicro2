/**
 * MetadataSummary — Read-only metadata display
 *
 * Uses MUI Accordions matching the desktop app's MetadataSummary styling.
 * No edit buttons — purely read-only display.
 */

import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Box,
  Stack,
  Chip,
  Link,
  styled,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  hasData,
  getItemCount,
  toArray,
  implode,
  formatFracture,
  formatFabric,
  formatVein,
  formatFold,
  formatGrainBoundary,
  formatIntraGrain,
  formatClasticBand,
  formatFaultShearZone,
  formatExtinctionMicrostructure,
  formatPseudotachylyte,
} from '../utils/metadataFormatters';
import type {
  MicrographMetadata,
  Spot,
  SampleMetadata,
  GrainSizeType,
  GrainShapeType,
  GrainOrientationType,
  FabricType,
  FractureType,
  VeinType,
  FoldType,
  GrainBoundaryType,
  IntraGrainType,
  ClasticDeformationBandType,
  FaultsShearZonesType,
  ExtinctionMicrostructureType,
  PseudotachylyteType,
} from '../types/project-types';

type DataItem = MicrographMetadata | Spot;

// Styled Accordion matching desktop app
const StyledAccordion = styled(Accordion)(({ theme }) => ({
  '&:before': { display: 'none' },
  borderLeft: '3px solid transparent',
  transition: 'border-color 0.2s ease',
  '&.Mui-expanded': {
    borderLeftColor: theme.palette.primary.main,
  },
}));

const StyledAccordionSummary = styled(AccordionSummary)(({ theme }) => ({
  minHeight: 32,
  padding: '0 12px',
  transition: 'background-color 0.2s ease',
  '& .MuiAccordionSummary-content': {
    alignItems: 'center',
    gap: 8,
    margin: '6px 0',
  },
  '&.Mui-expanded': {
    minHeight: 32,
  },
  '& .MuiAccordionSummary-content.Mui-expanded': {
    margin: '6px 0',
  },
  '.Mui-expanded &, &.Mui-expanded': {
    backgroundColor: theme.palette.mode === 'dark'
      ? 'rgba(228, 76, 101, 0.12)'
      : 'rgba(228, 76, 101, 0.08)',
  },
}));

/** Label: Value row */
function Field({ label, value }: { label: string; value?: string | number | boolean | null }) {
  if (value === undefined || value === null || value === '') return null;
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}: </Typography>
      <Typography variant="body2" component="span">{display}</Typography>
    </Box>
  );
}

interface MetadataSummaryProps {
  micrograph?: MicrographMetadata | null;
  spot?: Spot | null;
  sample?: SampleMetadata | null;
  isMicrograph: boolean;
}

export function MetadataSummary({ micrograph, spot, sample, isMicrograph }: MetadataSummaryProps) {
  const data: DataItem | null | undefined = micrograph || spot;

  if (!data) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', p: 2 }}>
        No data available
      </Typography>
    );
  }

  return (
    <Stack spacing={0.5}>
      {/* ============ Sample Metadata ============ */}
      {sample && (
        <StyledAccordion disableGutters>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Sample Metadata</Typography>
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={0.5}>
              <Field label="Sample ID" value={sample.sampleID} />
              <Field label="IGSN" value={sample.igsn} />
              {sample.longitude != null && sample.longitude !== 0 && <Field label="Longitude" value={sample.longitude} />}
              {sample.latitude != null && sample.latitude !== 0 && <Field label="Latitude" value={sample.latitude} />}
              <Field label="Description" value={sample.sampleDescription} />
              <Field label="Material Type" value={
                sample.materialType === 'other' && sample.otherMaterialType
                  ? sample.otherMaterialType : sample.materialType
              } />
              <Field label="Sample Type" value={sample.sampleType} />
              <Field label="Rock Type" value={sample.rockType} />
              <Field label="Lithology" value={sample.lithology} />
              <Field label="Notes" value={sample.notes} />
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* ============ Micrograph/Spot Metadata ============ */}
      <StyledAccordion disableGutters defaultExpanded>
        <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">{isMicrograph ? 'Micrograph' : 'Spot'} Metadata</Typography>
        </StyledAccordionSummary>
        <AccordionDetails sx={{ py: 1 }}>
          <Stack spacing={0.5}>
            <Field label="Name" value={data.name} />
            {isMicrograph && micrograph && (
              <>
                <Field label="Polished" value={
                  micrograph.polish != null
                    ? (micrograph.polish ? `Yes${micrograph.polishDescription ? ` (${micrograph.polishDescription})` : ''}` : 'No')
                    : undefined
                } />
                <Field label="Instrument" value={micrograph.instrument?.instrumentType} />
                <Field label="Image Type" value={micrograph.imageType} />
                {micrograph.orientationInfo?.orientationMethod && (
                  <>
                    <Field label="Orientation" value={
                      micrograph.orientationInfo.orientationMethod === 'trendPlunge' ? 'Trend & Plunge'
                        : micrograph.orientationInfo.orientationMethod === 'fabricReference' ? 'Fabric Reference'
                        : micrograph.orientationInfo.orientationMethod
                    } />
                    {micrograph.orientationInfo.orientationMethod === 'trendPlunge' && (
                      <>
                        {micrograph.orientationInfo.topTrend != null && micrograph.orientationInfo.topPlunge != null && (
                          <Box sx={{ pl: 1 }}>
                            <Field label="Top" value={`${micrograph.orientationInfo.topTrend}\u00B0 / ${micrograph.orientationInfo.topPlunge}\u00B0${micrograph.orientationInfo.topReferenceCorner ? ` (${micrograph.orientationInfo.topReferenceCorner})` : ''}`} />
                          </Box>
                        )}
                        {micrograph.orientationInfo.sideTrend != null && micrograph.orientationInfo.sidePlunge != null && (
                          <Box sx={{ pl: 1 }}>
                            <Field label="Side" value={`${micrograph.orientationInfo.sideTrend}\u00B0 / ${micrograph.orientationInfo.sidePlunge}\u00B0${micrograph.orientationInfo.sideReferenceCorner ? ` (${micrograph.orientationInfo.sideReferenceCorner})` : ''}`} />
                          </Box>
                        )}
                      </>
                    )}
                    {micrograph.orientationInfo.orientationMethod === 'fabricReference' && (
                      <>
                        <Box sx={{ pl: 1 }}><Field label="Reference" value={micrograph.orientationInfo.fabricReference} /></Box>
                        {micrograph.orientationInfo.fabricStrike != null && micrograph.orientationInfo.fabricDip != null && (
                          <Box sx={{ pl: 1 }}><Field label="Strike/Dip" value={`${micrograph.orientationInfo.fabricStrike}\u00B0 / ${micrograph.orientationInfo.fabricDip}\u00B0`} /></Box>
                        )}
                        {micrograph.orientationInfo.fabricTrend != null && micrograph.orientationInfo.fabricPlunge != null && (
                          <Box sx={{ pl: 1 }}><Field label="Trend/Plunge" value={`${micrograph.orientationInfo.fabricTrend}\u00B0 / ${micrograph.orientationInfo.fabricPlunge}\u00B0`} /></Box>
                        )}
                        <Box sx={{ pl: 1 }}><Field label="Rake" value={micrograph.orientationInfo.fabricRake != null ? `${micrograph.orientationInfo.fabricRake}\u00B0` : undefined} /></Box>
                        <Box sx={{ pl: 1 }}><Field label="Look Direction" value={micrograph.orientationInfo.lookDirection} /></Box>
                        <Box sx={{ pl: 1 }}><Field label="Top Corner" value={micrograph.orientationInfo.topCorner} /></Box>
                      </>
                    )}
                  </>
                )}
              </>
            )}
            {spot && (
              <>
                <Field label="Type" value={spot.geometryType || spot.geometry?.type} />
                <Field label="Date" value={spot.date} />
                <Field label="Notes" value={spot.notes} />
              </>
            )}
          </Stack>
        </AccordionDetails>
      </StyledAccordion>

      {/* ============ Mineralogy/Lithology ============ */}
      {(hasData(data.mineralogy) || hasData(data.lithologyInfo)) && (
        <StyledAccordion disableGutters>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Mineralogy/Lithology</Typography>
            {data.mineralogy?.minerals && data.mineralogy.minerals.length > 0 && (
              <Chip label={`${data.mineralogy.minerals.length} minerals`} size="small" />
            )}
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={1}>
              {data.mineralogy?.minerals && data.mineralogy.minerals.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Minerals:</Typography>
                  {data.mineralogy.minerals.map((mineral, i) => (
                    <Typography key={i} variant="body2">
                      &bull; {mineral.name}
                      {mineral.operator && mineral.percentage != null && ` ${mineral.operator} ${mineral.percentage}%`}
                    </Typography>
                  ))}
                </Box>
              )}
              {data.lithologyInfo?.lithologies && data.lithologyInfo.lithologies.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Lithology:</Typography>
                  {data.lithologyInfo.lithologies.map((lith, i) => (
                    <Typography key={i} variant="body2">
                      &bull; {lith.level1}{lith.level2 && ` / ${lith.level2}`}{lith.level3 && ` / ${lith.level3}`}
                    </Typography>
                  ))}
                </Box>
              )}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* ============ Grain Info ============ */}
      {(hasData(data.grainInfo?.grainSizeInfo) || hasData(data.grainInfo?.grainShapeInfo) || hasData(data.grainInfo?.grainOrientationInfo)) && (
        <StyledAccordion disableGutters>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Grain Info</Typography>
            <Chip label={`${getItemCount(data.grainInfo?.grainSizeInfo) + getItemCount(data.grainInfo?.grainShapeInfo) + getItemCount(data.grainInfo?.grainOrientationInfo)} items`} size="small" />
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={1.5}>
              {data.grainInfo?.grainSizeInfo && data.grainInfo.grainSizeInfo.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Grain Size:</Typography>
                  {toArray(data.grainInfo.grainSizeInfo).map((size: GrainSizeType, i: number) => {
                    const sv = size.mean ?? size.median ?? size.mode;
                    return <Typography key={i} variant="body2">&bull; {implode(size.phases)} - {sv != null ? `${sv}${size.sizeUnit || ''}${size.standardDeviation != null ? ` \u00B1 ${size.standardDeviation}` : ''}` : ''}</Typography>;
                  })}
                </Box>
              )}
              {data.grainInfo?.grainShapeInfo && data.grainInfo.grainShapeInfo.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Grain Shape:</Typography>
                  {toArray(data.grainInfo.grainShapeInfo).map((shape: GrainShapeType, i: number) => (
                    <Typography key={i} variant="body2">&bull; {implode(shape.phases)} - {shape.shape}</Typography>
                  ))}
                </Box>
              )}
              {data.grainInfo?.grainOrientationInfo && data.grainInfo.grainOrientationInfo.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Grain Orientation:</Typography>
                  {toArray(data.grainInfo.grainOrientationInfo).map((orient: GrainOrientationType, i: number) => (
                    <Typography key={i} variant="body2">&bull; {implode(orient.phases)} - {orient.meanOrientation}\u00B0 from {orient.relativeTo}</Typography>
                  ))}
                </Box>
              )}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* ============ Fabric Info ============ */}
      {hasData(data.fabricInfo?.fabrics) && (
        <StyledAccordion disableGutters>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Fabric Info</Typography>
            <Chip label={`${getItemCount(data.fabricInfo?.fabrics)} fabrics`} size="small" />
          </StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={1.5}>
              {toArray(data.fabricInfo?.fabrics).map((fabric: FabricType, i: number) => {
                const f = formatFabric(fabric);
                return <Box key={i}><Typography variant="body2" sx={{ fontWeight: 'bold', textDecoration: 'underline' }}>&bull; {f.label}</Typography><Typography variant="body2" sx={{ ml: 2 }}>{f.details}</Typography></Box>;
              })}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* ============ Fracture Info ============ */}
      {hasData(data.fractureInfo?.fractures) && (
        <StyledAccordion disableGutters>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="subtitle2">Fracture Info</Typography><Chip label={`${getItemCount(data.fractureInfo?.fractures)}`} size="small" /></StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}><Stack spacing={0.5}>{toArray(data.fractureInfo?.fractures).map((f: FractureType, i: number) => <Typography key={i} variant="body2">&bull; {formatFracture(f)}</Typography>)}</Stack></AccordionDetails>
        </StyledAccordion>
      )}

      {/* ============ Vein Info ============ */}
      {hasData(data.veinInfo?.veins) && (
        <StyledAccordion disableGutters>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="subtitle2">Vein Info</Typography><Chip label={`${getItemCount(data.veinInfo?.veins)}`} size="small" /></StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}><Stack spacing={0.5}>{toArray(data.veinInfo?.veins).map((v: VeinType, i: number) => <Typography key={i} variant="body2">&bull; {formatVein(v)}</Typography>)}</Stack></AccordionDetails>
        </StyledAccordion>
      )}

      {/* ============ Fold Info ============ */}
      {hasData(data.foldInfo?.folds) && (
        <StyledAccordion disableGutters>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="subtitle2">Fold Info</Typography><Chip label={`${getItemCount(data.foldInfo?.folds)}`} size="small" /></StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}><Stack spacing={1.5}>{toArray(data.foldInfo?.folds).map((f: FoldType, i: number) => { const fmt = formatFold(f); return <Box key={i}><Typography variant="body2" sx={{ fontWeight: 'bold' }}>&bull; {fmt.label}</Typography><Typography variant="body2" sx={{ ml: 2 }}>{fmt.details}</Typography></Box>; })}</Stack></AccordionDetails>
        </StyledAccordion>
      )}

      {/* ============ Grain Boundary Info ============ */}
      {hasData(data.grainBoundaryInfo?.boundaries) && (
        <StyledAccordion disableGutters>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="subtitle2">Grain Boundary Info</Typography><Chip label={`${getItemCount(data.grainBoundaryInfo?.boundaries)}`} size="small" /></StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}><Stack spacing={0.5}>{toArray(data.grainBoundaryInfo?.boundaries).map((b: GrainBoundaryType, i: number) => <Typography key={i} variant="body2">&bull; {formatGrainBoundary(b)}</Typography>)}</Stack></AccordionDetails>
        </StyledAccordion>
      )}

      {/* ============ Intra-Grain Info ============ */}
      {hasData(data.intraGrainInfo?.grains) && (
        <StyledAccordion disableGutters>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="subtitle2">Intra-Grain Info</Typography><Chip label={`${getItemCount(data.intraGrainInfo?.grains)}`} size="small" /></StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}><Stack spacing={0.5}>{toArray(data.intraGrainInfo?.grains).map((g: IntraGrainType, i: number) => <Typography key={i} variant="body2">&bull; {formatIntraGrain(g)}</Typography>)}</Stack></AccordionDetails>
        </StyledAccordion>
      )}

      {/* ============ Clastic Deformation Bands ============ */}
      {hasData(data.clasticDeformationBandInfo?.bands) && (
        <StyledAccordion disableGutters>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="subtitle2">Clastic Deformation Bands</Typography><Chip label={`${getItemCount(data.clasticDeformationBandInfo?.bands)}`} size="small" /></StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}><Stack spacing={0.5}>{toArray(data.clasticDeformationBandInfo?.bands).map((b: ClasticDeformationBandType, i: number) => <Typography key={i} variant="body2">&bull; {formatClasticBand(b)}</Typography>)}</Stack></AccordionDetails>
        </StyledAccordion>
      )}

      {/* ============ Faults and Shear Zones ============ */}
      {hasData(data.faultsShearZonesInfo?.faultsShearZones) && (
        <StyledAccordion disableGutters>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="subtitle2">Faults and Shear Zones</Typography><Chip label={`${getItemCount(data.faultsShearZonesInfo?.faultsShearZones)}`} size="small" /></StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}><Stack spacing={0.5}>{toArray(data.faultsShearZonesInfo?.faultsShearZones).map((f: FaultsShearZonesType, i: number) => <Typography key={i} variant="body2">&bull; {formatFaultShearZone(f)}</Typography>)}</Stack></AccordionDetails>
        </StyledAccordion>
      )}

      {/* ============ Extinction Microstructures ============ */}
      {hasData(data.extinctionMicrostructureInfo?.extinctionMicrostructures) && (
        <StyledAccordion disableGutters>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="subtitle2">Extinction Microstructures</Typography><Chip label={`${getItemCount(data.extinctionMicrostructureInfo?.extinctionMicrostructures)}`} size="small" /></StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}><Stack spacing={0.5}>{toArray(data.extinctionMicrostructureInfo?.extinctionMicrostructures).map((e: ExtinctionMicrostructureType, i: number) => <Typography key={i} variant="body2">&bull; {formatExtinctionMicrostructure(e)}</Typography>)}</Stack></AccordionDetails>
        </StyledAccordion>
      )}

      {/* ============ Pseudotachylyte Info ============ */}
      {hasData(data.pseudotachylyteInfo?.pseudotachylytes) && (
        <StyledAccordion disableGutters>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="subtitle2">Pseudotachylyte Info</Typography><Chip label={`${getItemCount(data.pseudotachylyteInfo?.pseudotachylytes)}`} size="small" /></StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}>
            <Stack spacing={1}>
              {toArray(data.pseudotachylyteInfo?.pseudotachylytes).map((p: PseudotachylyteType, i: number) => {
                const fmt = formatPseudotachylyte(p);
                return (
                  <Box key={i}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>&bull; {fmt.label}</Typography>
                    {fmt.sections.map((s, j) => (
                      <Box key={j} sx={{ ml: 2 }}><Typography variant="caption" color="text.secondary">{s.title}: </Typography><Typography variant="body2" component="span">{s.content}</Typography></Box>
                    ))}
                  </Box>
                );
              })}
            </Stack>
          </AccordionDetails>
        </StyledAccordion>
      )}

      {/* ============ Notes ============ */}
      {data.notes && (
        <StyledAccordion disableGutters>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="subtitle2">Notes</Typography></StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{data.notes}</Typography></AccordionDetails>
        </StyledAccordion>
      )}

      {/* ============ Associated Files ============ */}
      {hasData(data.associatedFiles) && (
        <StyledAccordion disableGutters>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="subtitle2">Associated Files</Typography><Chip label={`${data.associatedFiles?.length}`} size="small" /></StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}><Stack spacing={0.5}>{data.associatedFiles?.map((f, i) => <Typography key={i} variant="body2">&bull; {f.fileName || 'Unnamed'}{f.fileType && ` (${f.fileType})`}{f.notes && ` - ${f.notes}`}</Typography>)}</Stack></AccordionDetails>
        </StyledAccordion>
      )}

      {/* ============ Links ============ */}
      {hasData(data.links) && (
        <StyledAccordion disableGutters>
          <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="subtitle2">Links</Typography><Chip label={`${data.links?.length}`} size="small" /></StyledAccordionSummary>
          <AccordionDetails sx={{ py: 1 }}><Stack spacing={0.5}>{data.links?.map((l, i) => <Typography key={i} variant="body2">&bull; {l.url ? <Link href={l.url} target="_blank" rel="noopener noreferrer">{l.label || l.url}</Link> : l.label || 'No URL'}</Typography>)}</Stack></AccordionDetails>
        </StyledAccordion>
      )}
    </Stack>
  );
}
