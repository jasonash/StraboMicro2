/**
 * The state of the two instrument steps, shared by Batch Import and Finish
 * Importing: Instrument & Image Info (with an image type per micrograph),
 * Instrument Data, the instrument database, and copying from a micrograph.
 */

import { useMemo, useState } from 'react';
import { useAppStore } from '@/store';
import type { InstrumentType, MicrographMetadata } from '@/types/project-types';
import type { InstrumentFormData } from './InstrumentInfoForm';
import { initialInstrumentDataFormData, type Detector, type InstrumentDataFormData } from './InstrumentDataForm';
import type { InstrumentData } from './InstrumentDatabaseDialog';

const initialInfo: InstrumentFormData = { instrumentType: '', otherInstrumentType: '', dataType: '', imageType: '' };
const initialDetectors: Detector[] = [{ type: '', make: '', model: '' }];

export function useInstrumentForms() {
  const project = useAppStore((state) => state.project);
  const [info, setInfo] = useState<InstrumentFormData>(initialInfo);
  const [data, setData] = useState<InstrumentDataFormData>(initialInstrumentDataFormData);
  const [detectors, setDetectors] = useState<Detector[]>(initialDetectors);
  /** Image types chosen for one micrograph (row id => type); the rest take info.imageType */
  const [ownImageTypes, setOwnImageTypes] = useState<Record<string, string>>({});

  const existingMicrographs = useMemo((): MicrographMetadata[] => {
    const found: MicrographMetadata[] = [];
    for (const dataset of project?.datasets ?? []) {
      for (const sample of dataset.samples ?? []) {
        for (const micro of sample.micrographs ?? []) {
          if (micro.instrument?.instrumentType) found.push(micro);
        }
      }
    }
    return found;
  }, [project]);

  const reset = () => {
    setInfo(initialInfo);
    setData(initialInstrumentDataFormData);
    setDetectors(initialDetectors);
    setOwnImageTypes({});
  };

  const onInfoChange = (field: keyof InstrumentFormData, value: string) => {
    setInfo((prev) => ({ ...prev, [field]: value }));
    // Another instrument or data type has other image types
    if (field === 'instrumentType' || field === 'dataType') setOwnImageTypes({});
  };
  const onDataChange = (field: keyof InstrumentDataFormData, value: string) =>
    setData((prev) => ({ ...prev, [field]: value }));
  const onDetectorChange = (index: number, field: keyof Detector, value: string) =>
    setDetectors((prev) => prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  const onAddDetector = () => setDetectors((prev) => [...prev, { type: '', make: '', model: '' }]);
  const onRemoveDetector = (index: number) => setDetectors((prev) => prev.filter((_, i) => i !== index));
  const setOwnImageType = (rowId: string, value: string) =>
    setOwnImageTypes((prev) => ({ ...prev, [rowId]: value }));

  const onInstrumentFromDatabase = (instrument: InstrumentData) => {
    setInfo((prev) => ({ ...prev, instrumentType: instrument.instrumentType || prev.instrumentType }));
    setOwnImageTypes({});
    setData({
      instrumentBrand: instrument.instrumentBrand || '',
      instrumentModel: instrument.instrumentModel || '',
      university: instrument.university || '',
      laboratory: instrument.laboratory || '',
      dataCollectionSoftware: instrument.dataCollectionSoftware || '',
      dataCollectionSoftwareVersion: instrument.dataCollectionSoftwareVersion || '',
      postProcessingSoftware: instrument.postProcessingSoftware || '',
      postProcessingSoftwareVersion: instrument.postProcessingSoftwareVersion || '',
      filamentType: instrument.filamentType || '',
      instrumentNotes: instrument.instrumentNotes || '',
    });
    if (instrument.detectors && instrument.detectors.length > 0) {
      setDetectors(instrument.detectors.map((d) => ({
        type: d.detectorType || '',
        make: d.detectorMake || '',
        model: d.detectorModel || '',
      })));
    }
  };

  const onCopyFromExisting = (micrographId: string) => {
    const source = existingMicrographs.find((m) => m.id === micrographId);
    const inst = source?.instrument;
    if (!source || !inst) return;
    setInfo({
      instrumentType: inst.instrumentType || '',
      otherInstrumentType: inst.otherInstrumentType || '',
      dataType: inst.dataType || '',
      imageType: source.imageType || '',
    });
    setOwnImageTypes({});
    setData({
      instrumentBrand: inst.instrumentBrand || '',
      instrumentModel: inst.instrumentModel || '',
      university: inst.university || '',
      laboratory: inst.laboratory || '',
      dataCollectionSoftware: inst.dataCollectionSoftware || '',
      dataCollectionSoftwareVersion: inst.dataCollectionSoftwareVersion || '',
      postProcessingSoftware: inst.postProcessingSoftware || '',
      postProcessingSoftwareVersion: inst.postProcessingSoftwareVersion || '',
      filamentType: inst.filamentType || '',
      instrumentNotes: inst.instrumentNotes || '',
    });
    if (inst.instrumentDetectors && inst.instrumentDetectors.length > 0) {
      setDetectors(inst.instrumentDetectors.map((d) => ({
        type: d.detectorType || '',
        make: d.detectorMake || '',
        model: d.detectorModel || '',
      })));
    }
  };

  /** The saved instrument (full data model) */
  const buildInstrument = (): InstrumentType => ({
    instrumentType: info.instrumentType,
    otherInstrumentType: info.otherInstrumentType || undefined,
    dataType: info.dataType || undefined,
    instrumentBrand: data.instrumentBrand || undefined,
    instrumentModel: data.instrumentModel || undefined,
    university: data.university || undefined,
    laboratory: data.laboratory || undefined,
    dataCollectionSoftware: data.dataCollectionSoftware || undefined,
    dataCollectionSoftwareVersion: data.dataCollectionSoftwareVersion || undefined,
    postProcessingSoftware: data.postProcessingSoftware || undefined,
    postProcessingSoftwareVersion: data.postProcessingSoftwareVersion || undefined,
    filamentType: data.filamentType || undefined,
    instrumentNotes: data.instrumentNotes || undefined,
    instrumentDetectors: detectors
      .filter((d) => d.type || d.make || d.model)
      .map((d) => ({
        detectorType: d.type || undefined,
        detectorMake: d.make || undefined,
        detectorModel: d.model || undefined,
      })),
  });

  return {
    info, data, detectors, ownImageTypes, existingMicrographs,
    reset, onInfoChange, onDataChange, onDetectorChange, onAddDetector, onRemoveDetector,
    setOwnImageType, onInstrumentFromDatabase, onCopyFromExisting, buildInstrument,
  };
}
