/**
 * MetadataSummary — Read-only metadata display
 *
 * Displays all collected geological metadata for a micrograph or spot
 * using lightweight CollapsibleSection components (no MUI dependency).
 * Adapted from the desktop app's MetadataSummary.tsx.
 */

import { CollapsibleSection } from './ui/CollapsibleSection';
import { StatRow } from './ui/StatRow';
import { colors, fonts } from '../styles/theme';
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

// Common data shape for micrograph or spot
type DataItem = MicrographMetadata | Spot;

interface MetadataSummaryProps {
  /** The micrograph data (when viewing a micrograph) */
  micrograph?: MicrographMetadata | null;
  /** The spot data (when viewing a spot) */
  spot?: Spot | null;
  /** The parent sample (for sample metadata section) */
  sample?: SampleMetadata | null;
  /** Whether this is a micrograph view (vs spot) */
  isMicrograph: boolean;
}

/** Bulleted item */
function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: fonts.sizeBase, color: colors.textSecondary, padding: '1px 0' }}>
      {children}
    </div>
  );
}

/** Sub-label for grouped data */
function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: fonts.sizeSm, color: colors.textMuted, marginTop: '6px', marginBottom: '2px' }}>
      {children}
    </div>
  );
}

export function MetadataSummary({ micrograph, spot, sample, isMicrograph }: MetadataSummaryProps) {
  const data: DataItem | null | undefined = micrograph || spot;

  if (!data) {
    return (
      <div style={{ padding: '16px', color: colors.textMuted, fontStyle: 'italic', fontSize: fonts.sizeBase }}>
        No data available
      </div>
    );
  }

  return (
    <div>
      {/* ============ Sample Metadata ============ */}
      {sample && (
        <CollapsibleSection title="Sample Metadata">
          <StatRow label="Sample ID" value={sample.sampleID} />
          <StatRow label="IGSN" value={sample.igsn} />
          {sample.longitude != null && sample.longitude !== 0 && (
            <StatRow label="Longitude" value={sample.longitude} />
          )}
          {sample.latitude != null && sample.latitude !== 0 && (
            <StatRow label="Latitude" value={sample.latitude} />
          )}
          <StatRow label="Description" value={sample.sampleDescription} />
          <StatRow label="Material Type" value={
            sample.materialType === 'other' && sample.otherMaterialType
              ? sample.otherMaterialType
              : sample.materialType
          } />
          <StatRow label="Sample Type" value={sample.sampleType} />
          <StatRow label="Rock Type" value={sample.rockType} />
          <StatRow label="Lithology" value={sample.lithology} />
          <StatRow label="Notes" value={sample.notes} />
        </CollapsibleSection>
      )}

      {/* ============ Micrograph/Spot Metadata ============ */}
      <CollapsibleSection title={isMicrograph ? 'Micrograph Metadata' : 'Spot Metadata'} defaultOpen>
        <StatRow label="Name" value={data.name} />
        {isMicrograph && micrograph && (
          <>
            <StatRow label="Polished" value={
              micrograph.polish != null
                ? (micrograph.polish ? `Yes${micrograph.polishDescription ? ` (${micrograph.polishDescription})` : ''}` : 'No')
                : undefined
            } />
            <StatRow label="Instrument" value={micrograph.instrument?.instrumentType} />
            <StatRow label="Image Type" value={micrograph.imageType} />
            {micrograph.orientationInfo?.orientationMethod && (
              <>
                <StatRow label="Orientation" value={
                  micrograph.orientationInfo.orientationMethod === 'trendPlunge'
                    ? 'Trend & Plunge'
                    : micrograph.orientationInfo.orientationMethod === 'fabricReference'
                      ? 'Fabric Reference'
                      : micrograph.orientationInfo.orientationMethod
                } />
                {micrograph.orientationInfo.orientationMethod === 'trendPlunge' && (
                  <>
                    {micrograph.orientationInfo.topTrend != null && micrograph.orientationInfo.topPlunge != null && (
                      <StatRow label="  Top" value={`${micrograph.orientationInfo.topTrend}\u00B0 / ${micrograph.orientationInfo.topPlunge}\u00B0${micrograph.orientationInfo.topReferenceCorner ? ` (${micrograph.orientationInfo.topReferenceCorner})` : ''}`} />
                    )}
                    {micrograph.orientationInfo.sideTrend != null && micrograph.orientationInfo.sidePlunge != null && (
                      <StatRow label="  Side" value={`${micrograph.orientationInfo.sideTrend}\u00B0 / ${micrograph.orientationInfo.sidePlunge}\u00B0${micrograph.orientationInfo.sideReferenceCorner ? ` (${micrograph.orientationInfo.sideReferenceCorner})` : ''}`} />
                    )}
                  </>
                )}
                {micrograph.orientationInfo.orientationMethod === 'fabricReference' && (
                  <>
                    <StatRow label="  Reference" value={micrograph.orientationInfo.fabricReference} />
                    {micrograph.orientationInfo.fabricStrike != null && micrograph.orientationInfo.fabricDip != null && (
                      <StatRow label="  Strike/Dip" value={`${micrograph.orientationInfo.fabricStrike}\u00B0 / ${micrograph.orientationInfo.fabricDip}\u00B0`} />
                    )}
                    {micrograph.orientationInfo.fabricTrend != null && micrograph.orientationInfo.fabricPlunge != null && (
                      <StatRow label="  Trend/Plunge" value={`${micrograph.orientationInfo.fabricTrend}\u00B0 / ${micrograph.orientationInfo.fabricPlunge}\u00B0`} />
                    )}
                    <StatRow label="  Rake" value={micrograph.orientationInfo.fabricRake != null ? `${micrograph.orientationInfo.fabricRake}\u00B0` : undefined} />
                    <StatRow label="  Look Direction" value={micrograph.orientationInfo.lookDirection} />
                    <StatRow label="  Top Corner" value={micrograph.orientationInfo.topCorner} />
                  </>
                )}
              </>
            )}
          </>
        )}
        {spot && (
          <>
            <StatRow label="Type" value={spot.geometryType || spot.geometry?.type} />
            <StatRow label="Date" value={spot.date} />
            <StatRow label="Notes" value={spot.notes} />
          </>
        )}
      </CollapsibleSection>

      {/* ============ Mineralogy/Lithology ============ */}
      {(hasData(data.mineralogy) || hasData(data.lithologyInfo)) && (
        <CollapsibleSection
          title="Mineralogy/Lithology"
          count={(data.mineralogy?.minerals?.length || 0) + (data.lithologyInfo?.lithologies?.length || 0)}
        >
          {data.mineralogy?.minerals && data.mineralogy.minerals.length > 0 && (
            <>
              <SubLabel>Minerals:</SubLabel>
              {data.mineralogy.minerals.map((mineral, i) => (
                <BulletItem key={i}>
                  &bull; {mineral.name}
                  {mineral.operator && mineral.percentage != null && ` ${mineral.operator} ${mineral.percentage}%`}
                </BulletItem>
              ))}
            </>
          )}
          {data.lithologyInfo?.lithologies && data.lithologyInfo.lithologies.length > 0 && (
            <>
              <SubLabel>Lithology:</SubLabel>
              {data.lithologyInfo.lithologies.map((lith, i) => (
                <BulletItem key={i}>
                  &bull; {lith.level1}
                  {lith.level2 && ` / ${lith.level2}`}
                  {lith.level3 && ` / ${lith.level3}`}
                </BulletItem>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* ============ Grain Info ============ */}
      {(hasData(data.grainInfo?.grainSizeInfo) ||
        hasData(data.grainInfo?.grainShapeInfo) ||
        hasData(data.grainInfo?.grainOrientationInfo)) && (
        <CollapsibleSection
          title="Grain Info"
          count={
            getItemCount(data.grainInfo?.grainSizeInfo) +
            getItemCount(data.grainInfo?.grainShapeInfo) +
            getItemCount(data.grainInfo?.grainOrientationInfo)
          }
        >
          {data.grainInfo?.grainSizeInfo && data.grainInfo.grainSizeInfo.length > 0 && (
            <>
              <SubLabel>Grain Size:</SubLabel>
              {toArray(data.grainInfo.grainSizeInfo).map((size: GrainSizeType, i: number) => {
                const sizeValue = size.mean ?? size.median ?? size.mode;
                const sizeStr = sizeValue != null
                  ? `${sizeValue}${size.sizeUnit || ''}${size.standardDeviation != null ? ` \u00B1 ${size.standardDeviation}` : ''}`
                  : '';
                return (
                  <BulletItem key={i}>&bull; {implode(size.phases)} - {sizeStr}</BulletItem>
                );
              })}
            </>
          )}
          {data.grainInfo?.grainShapeInfo && data.grainInfo.grainShapeInfo.length > 0 && (
            <>
              <SubLabel>Grain Shape:</SubLabel>
              {toArray(data.grainInfo.grainShapeInfo).map((shape: GrainShapeType, i: number) => (
                <BulletItem key={i}>&bull; {implode(shape.phases)} - {shape.shape}</BulletItem>
              ))}
            </>
          )}
          {data.grainInfo?.grainOrientationInfo && data.grainInfo.grainOrientationInfo.length > 0 && (
            <>
              <SubLabel>Grain Orientation:</SubLabel>
              {toArray(data.grainInfo.grainOrientationInfo).map((orient: GrainOrientationType, i: number) => (
                <BulletItem key={i}>&bull; {implode(orient.phases)} - {orient.meanOrientation}\u00B0 from {orient.relativeTo}</BulletItem>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* ============ Fabric Info ============ */}
      {hasData(data.fabricInfo?.fabrics) && (
        <CollapsibleSection title="Fabric Info" count={getItemCount(data.fabricInfo?.fabrics)}>
          {toArray(data.fabricInfo?.fabrics).map((fabric: FabricType, i: number) => {
            const formatted = formatFabric(fabric);
            return (
              <div key={i} style={{ marginBottom: '6px' }}>
                <div style={{ fontWeight: 'bold', fontSize: fonts.sizeBase, color: colors.textSecondary }}>
                  &bull; {formatted.label}
                </div>
                <div style={{ marginLeft: '12px', fontSize: fonts.sizeBase, color: colors.textMuted }}>
                  {formatted.details}
                </div>
              </div>
            );
          })}
        </CollapsibleSection>
      )}

      {/* ============ Fracture Info ============ */}
      {hasData(data.fractureInfo?.fractures) && (
        <CollapsibleSection title="Fracture Info" count={getItemCount(data.fractureInfo?.fractures)}>
          {toArray(data.fractureInfo?.fractures).map((fracture: FractureType, i: number) => (
            <BulletItem key={i}>&bull; {formatFracture(fracture)}</BulletItem>
          ))}
        </CollapsibleSection>
      )}

      {/* ============ Vein Info ============ */}
      {hasData(data.veinInfo?.veins) && (
        <CollapsibleSection title="Vein Info" count={getItemCount(data.veinInfo?.veins)}>
          {toArray(data.veinInfo?.veins).map((vein: VeinType, i: number) => (
            <BulletItem key={i}>&bull; {formatVein(vein)}</BulletItem>
          ))}
        </CollapsibleSection>
      )}

      {/* ============ Fold Info ============ */}
      {hasData(data.foldInfo?.folds) && (
        <CollapsibleSection title="Fold Info" count={getItemCount(data.foldInfo?.folds)}>
          {toArray(data.foldInfo?.folds).map((fold: FoldType, i: number) => {
            const formatted = formatFold(fold);
            return (
              <div key={i} style={{ marginBottom: '6px' }}>
                <div style={{ fontWeight: 'bold', fontSize: fonts.sizeBase, color: colors.textSecondary }}>
                  &bull; {formatted.label}
                </div>
                <div style={{ marginLeft: '12px', fontSize: fonts.sizeBase, color: colors.textMuted }}>
                  {formatted.details}
                </div>
              </div>
            );
          })}
        </CollapsibleSection>
      )}

      {/* ============ Grain Boundary Info ============ */}
      {hasData(data.grainBoundaryInfo?.boundaries) && (
        <CollapsibleSection title="Grain Boundary Info" count={getItemCount(data.grainBoundaryInfo?.boundaries)}>
          {toArray(data.grainBoundaryInfo?.boundaries).map((boundary: GrainBoundaryType, i: number) => (
            <BulletItem key={i}>&bull; {formatGrainBoundary(boundary)}</BulletItem>
          ))}
        </CollapsibleSection>
      )}

      {/* ============ Intra-Grain Info ============ */}
      {hasData(data.intraGrainInfo?.grains) && (
        <CollapsibleSection title="Intra-Grain Info" count={getItemCount(data.intraGrainInfo?.grains)}>
          {toArray(data.intraGrainInfo?.grains).map((grain: IntraGrainType, i: number) => (
            <BulletItem key={i}>&bull; {formatIntraGrain(grain)}</BulletItem>
          ))}
        </CollapsibleSection>
      )}

      {/* ============ Clastic Deformation Bands ============ */}
      {hasData(data.clasticDeformationBandInfo?.bands) && (
        <CollapsibleSection title="Clastic Deformation Bands" count={getItemCount(data.clasticDeformationBandInfo?.bands)}>
          {toArray(data.clasticDeformationBandInfo?.bands).map((band: ClasticDeformationBandType, i: number) => (
            <BulletItem key={i}>&bull; {formatClasticBand(band)}</BulletItem>
          ))}
        </CollapsibleSection>
      )}

      {/* ============ Faults and Shear Zones ============ */}
      {hasData(data.faultsShearZonesInfo?.faultsShearZones) && (
        <CollapsibleSection title="Faults and Shear Zones" count={getItemCount(data.faultsShearZonesInfo?.faultsShearZones)}>
          {toArray(data.faultsShearZonesInfo?.faultsShearZones).map((fault: FaultsShearZonesType, i: number) => (
            <BulletItem key={i}>&bull; {formatFaultShearZone(fault)}</BulletItem>
          ))}
        </CollapsibleSection>
      )}

      {/* ============ Extinction Microstructures ============ */}
      {hasData(data.extinctionMicrostructureInfo?.extinctionMicrostructures) && (
        <CollapsibleSection title="Extinction Microstructures" count={getItemCount(data.extinctionMicrostructureInfo?.extinctionMicrostructures)}>
          {toArray(data.extinctionMicrostructureInfo?.extinctionMicrostructures).map((ext: ExtinctionMicrostructureType, i: number) => (
            <BulletItem key={i}>&bull; {formatExtinctionMicrostructure(ext)}</BulletItem>
          ))}
        </CollapsibleSection>
      )}

      {/* ============ Pseudotachylyte Info ============ */}
      {hasData(data.pseudotachylyteInfo?.pseudotachylytes) && (
        <CollapsibleSection title="Pseudotachylyte Info" count={getItemCount(data.pseudotachylyteInfo?.pseudotachylytes)}>
          {toArray(data.pseudotachylyteInfo?.pseudotachylytes).map((pseudo: PseudotachylyteType, i: number) => {
            const formatted = formatPseudotachylyte(pseudo);
            return (
              <div key={i} style={{ marginBottom: '8px' }}>
                <div style={{ fontWeight: 'bold', fontSize: fonts.sizeBase, color: colors.textSecondary }}>
                  &bull; {formatted.label}
                </div>
                {formatted.sections.map((section, j) => (
                  <div key={j} style={{ marginLeft: '12px', marginTop: '2px' }}>
                    <span style={{ color: colors.textMuted, fontSize: fonts.sizeSm }}>{section.title}: </span>
                    <span style={{ color: colors.textSecondary, fontSize: fonts.sizeBase }}>{section.content}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </CollapsibleSection>
      )}

      {/* ============ Notes ============ */}
      {data.notes && (
        <CollapsibleSection title="Notes">
          <div style={{ fontSize: fonts.sizeBase, color: colors.textSecondary, whiteSpace: 'pre-wrap' }}>
            {data.notes}
          </div>
        </CollapsibleSection>
      )}

      {/* ============ Associated Files ============ */}
      {hasData(data.associatedFiles) && (
        <CollapsibleSection title="Associated Files" count={data.associatedFiles?.length}>
          {data.associatedFiles?.map((file, i) => (
            <BulletItem key={i}>
              &bull; {file.fileName || 'Unnamed file'}
              {file.fileType && ` (${file.fileType})`}
              {file.notes && ` - ${file.notes}`}
            </BulletItem>
          ))}
        </CollapsibleSection>
      )}

      {/* ============ Links ============ */}
      {hasData(data.links) && (
        <CollapsibleSection title="Links" count={data.links?.length}>
          {data.links?.map((link, i) => (
            <BulletItem key={i}>
              &bull;{' '}
              {link.url ? (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: colors.textLink, textDecoration: 'none' }}
                >
                  {link.label || link.url}
                </a>
              ) : (
                link.label || 'No URL'
              )}
            </BulletItem>
          ))}
        </CollapsibleSection>
      )}
    </div>
  );
}
