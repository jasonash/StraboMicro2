/**
 * Which Image Type an instrument and data type allow: a list to choose from,
 * element names (EDS/WDS maps), or none to choose (the data type is the image
 * type, or "Other"). One list for InstrumentInfoForm and the per-micrograph
 * image types of Batch Import and Finish Importing.
 */

export type ImageTypeChoices =
  | { kind: 'list'; options: string[] }
  | { kind: 'elements' }
  | { kind: 'none' };

const EDS = 'Energy Dispersive X-ray Spectroscopy (EDS)';
const WDS = 'Wavelength-dispersive X-ray spectroscopy (WDS)';
const CL = 'Cathodoluminescence (CL)';

export function imageTypeChoices(instrumentType: string, dataType: string): ImageTypeChoices {
  const list = (options: string[]): ImageTypeChoices => ({ kind: 'list', options });
  switch (instrumentType) {
    case 'Optical Microscopy':
      return list(['Plane Polarized Light', 'Cross Polarized Light', 'Reflected Light', '1/4 Lambda Plate', 'Cathodoluminescence', 'Gypsum Plate']);
    case 'Scanner':
      return list(['No Polarizer', 'Plane Polarized', 'Cross Polarized', 'Other']);
    case 'Fourier Transform Infrared Spectroscopy (FTIR)':
    case 'Raman Spectroscopy':
      return list(['False Color Map', 'Intensity Map']);
    case 'Atomic Force Microscopy (AFM)':
      return list(['Topography Image']);
    case 'Transmission Electron Microscopy (TEM)':
      if (dataType === 'Electron Diffraction') {
        return list([
          'Selected Area Electron Diffraction (SAED)',
          'Convergent Beam Electron Diffraction (CBED)',
          'Nano Beam Diffraction (NBD)',
          'Large Area Convergent Beam Electron Diffraction (LACBED)',
        ]);
      }
      return dataType === EDS ? { kind: 'elements' } : { kind: 'none' };
    case 'Scanning Transmission Electron Microscopy (STEM)':
      if (dataType === CL) return list(['Panchromatic CL Image', 'Wavelength Filtered CL Image', 'Cathodoluminescence Spectroscopy']);
      return dataType === EDS ? { kind: 'elements' } : { kind: 'none' };
    case 'Scanning Electron Microscopy (SEM)':
      if (dataType === 'Electron Backscatter Diffraction (EBSD)') {
        return list([
          'Orientation (Euler)', 'Orientation (IPF-X)', 'Orientation (IPF-Y)', 'Orientation (IPF-Z)',
          'Band Contrast', 'Phase Map', 'Misorientation to Mean', 'Grain Boundaries', 'Sub-grain Boundaries',
        ]);
      }
      if (dataType === CL) return list(['Panchromatic CL Image', 'Wavelength Filtered CL Image']);
      if (dataType === 'Focused Ion Beam Scanning Electron Microscopy (FIB-SEM)') return list(['FIB Imaging']);
      return dataType === EDS || dataType === WDS ? { kind: 'elements' } : { kind: 'none' };
    case 'Electron Microprobe':
      if (dataType === CL) return list(['Panchromatic SEM-CL Image', 'Wavelength Filtered SEM-CL Image']);
      return dataType === EDS || dataType === WDS ? { kind: 'elements' } : { kind: 'none' };
    default:
      return { kind: 'none' };
  }
}

/** Each row's image type: its own choice, else the common one (empty when neither) */
export function effectiveImageType(common: string, own: Record<string, string>, rowId: string): string {
  return own[rowId] ?? common;
}

/**
 * Whether the Instrument & Image Info step can go on: an instrument, and an
 * image type for every row where one applies. Rows may each have their own,
 * so the common field can stay empty when all of them do.
 */
export function imageTypesComplete(
  data: { instrumentType: string; otherInstrumentType: string; dataType: string; imageType: string },
  own: Record<string, string>,
  rowIds: readonly string[]
): boolean {
  if (!data.instrumentType) return false;
  if (data.instrumentType === 'Other') return data.otherInstrumentType.trim() !== '';
  if (imageTypeChoices(data.instrumentType, data.dataType).kind === 'none') return data.imageType !== '';
  return rowIds.length > 0 && rowIds.every((id) => effectiveImageType(data.imageType, own, id).trim() !== '');
}
