/**
 * New Project Wizard
 *
 * Multi-step wizard matching the legacy JavaFX workflow:
 * Step 1: Project Metadata (name, dates, purpose, etc.)
 * Step 2: Dataset Name
 * Step 3: Sample Information
 *
 * After completion, creates project structure in store (without micrograph)
 */

import { useState } from 'react';
import { useAppStore } from '@/store';
import './NewProjectWizard.css';

interface NewProjectWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ProjectFormData {
  // Step 1: Project Metadata
  name: string;
  startDate: string;
  endDate: string;
  purposeOfStudy: string;
  otherTeamMembers: string;
  areaOfInterest: string;
  gpsDatum: string;
  magneticDeclination: string;
  notes: string;

  // Step 2: Dataset
  datasetName: string;

  // Step 3: Sample
  sampleID: string;
  longitude: string;
  latitude: string;
  mainSamplingPurpose: string;
  otherSamplingPurpose: string;
  sampleDescription: string;
  materialType: string;
  inplacenessOfSample: string;
  orientedSample: string;
  sampleOrientationNotes: string;
  sampleSize: string;
  degreeOfWeathering: string;
  sampleNotes: string;
  // Conditional fields for materialType
  sampleType: string;
  color: string;
  lithology: string;
  sampleUnit: string;
  otherMaterialType: string;
}

const initialFormData: ProjectFormData = {
  name: '',
  startDate: '',
  endDate: '',
  purposeOfStudy: '',
  otherTeamMembers: '',
  areaOfInterest: '',
  gpsDatum: '',
  magneticDeclination: '',
  notes: '',
  datasetName: '',
  sampleID: '',
  longitude: '',
  latitude: '',
  mainSamplingPurpose: '',
  otherSamplingPurpose: '',
  sampleDescription: '',
  materialType: '',
  inplacenessOfSample: '',
  orientedSample: '',
  sampleOrientationNotes: '',
  sampleSize: '',
  degreeOfWeathering: '',
  sampleNotes: '',
  sampleType: '',
  color: '',
  lithology: '',
  sampleUnit: '',
  otherMaterialType: '',
};

export const NewProjectWizard: React.FC<NewProjectWizardProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<ProjectFormData>(initialFormData);
  const loadProject = useAppStore(state => state.loadProject);

  const updateField = (field: keyof ProjectFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleFinish = () => {
    // Create complete project structure
    const newProject = {
      id: crypto.randomUUID(),
      name: formData.name,
      startDate: formData.startDate || undefined,
      endDate: formData.endDate || undefined,
      purposeOfStudy: formData.purposeOfStudy || undefined,
      otherTeamMembers: formData.otherTeamMembers || undefined,
      areaOfInterest: formData.areaOfInterest || undefined,
      gpsDatum: formData.gpsDatum || undefined,
      magneticDeclination: formData.magneticDeclination || undefined,
      notes: formData.notes || undefined,
      projectLocation: 'local',
      datasets: [{
        id: crypto.randomUUID(),
        name: formData.datasetName,
        samples: [{
          id: crypto.randomUUID(),
          label: formData.sampleID,
          sampleID: formData.sampleID,
          longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
          latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
          mainSamplingPurpose: formData.mainSamplingPurpose || undefined,
          otherSamplingPurpose: formData.otherSamplingPurpose || undefined,
          sampleDescription: formData.sampleDescription || undefined,
          materialType: formData.materialType || undefined,
          inplacenessOfSample: formData.inplacenessOfSample || undefined,
          orientedSample: formData.orientedSample || undefined,
          sampleOrientationNotes: formData.sampleOrientationNotes || undefined,
          sampleSize: formData.sampleSize || undefined,
          degreeOfWeathering: formData.degreeOfWeathering || undefined,
          sampleNotes: formData.sampleNotes || undefined,
          sampleType: formData.sampleType || undefined,
          color: formData.color || undefined,
          lithology: formData.lithology || undefined,
          sampleUnit: formData.sampleUnit || undefined,
          otherMaterialType: formData.otherMaterialType || undefined,
          micrographs: []
        }]
      }]
    };

    loadProject(newProject, null);

    // Reset and close
    setFormData(initialFormData);
    setCurrentStep(1);
    onClose();
  };

  const handleCancel = () => {
    setFormData(initialFormData);
    setCurrentStep(1);
    onClose();
  };

  // Validation for each step
  const canProceedStep1 = formData.name.trim() !== '';
  const canProceedStep2 = formData.datasetName.trim() !== '';
  const canProceedStep3 = formData.sampleID.trim() !== '';

  if (!isOpen) return null;

  return (
    <div className="wizard-overlay" onClick={handleCancel}>
      <div className="wizard-content" onClick={(e) => e.stopPropagation()}>
        <div className="wizard-header">
          <h2>New Project - Step {currentStep} of 3</h2>
          <button className="wizard-close" onClick={handleCancel}>×</button>
        </div>

        <div className="wizard-body">
          {/* Step 1: Project Metadata */}
          {currentStep === 1 && (
            <div className="wizard-step">
              <h3>Project Metadata</h3>

              <div className="form-group">
                <label htmlFor="projectName">
                  Project Name <span className="required">*</span>
                </label>
                <input
                  id="projectName"
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="Enter project name"
                  autoFocus
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="startDate">Start Date</label>
                  <input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => updateField('startDate', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="endDate">End Date</label>
                  <input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => updateField('endDate', e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="purposeOfStudy">Purpose of Study</label>
                <input
                  id="purposeOfStudy"
                  type="text"
                  value={formData.purposeOfStudy}
                  onChange={(e) => updateField('purposeOfStudy', e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="form-group">
                <label htmlFor="otherTeamMembers">Other Team Members</label>
                <input
                  id="otherTeamMembers"
                  type="text"
                  value={formData.otherTeamMembers}
                  onChange={(e) => updateField('otherTeamMembers', e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="form-group">
                <label htmlFor="areaOfInterest">Area of Interest</label>
                <input
                  id="areaOfInterest"
                  type="text"
                  value={formData.areaOfInterest}
                  onChange={(e) => updateField('areaOfInterest', e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="gpsDatum">GPS Datum</label>
                  <input
                    id="gpsDatum"
                    type="text"
                    value={formData.gpsDatum}
                    onChange={(e) => updateField('gpsDatum', e.target.value)}
                    placeholder="Optional"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="magneticDeclination">Magnetic Declination</label>
                  <input
                    id="magneticDeclination"
                    type="text"
                    value={formData.magneticDeclination}
                    onChange={(e) => updateField('magneticDeclination', e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="notes">Notes</label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  placeholder="Optional project notes"
                  rows={4}
                />
              </div>
            </div>
          )}

          {/* Step 2: Dataset Name */}
          {currentStep === 2 && (
            <div className="wizard-step">
              <h3>Dataset Information</h3>

              <div className="form-group">
                <label htmlFor="datasetName">
                  Dataset Name <span className="required">*</span>
                </label>
                <input
                  id="datasetName"
                  type="text"
                  value={formData.datasetName}
                  onChange={(e) => updateField('datasetName', e.target.value)}
                  placeholder="Enter dataset name"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Step 3: Sample Information */}
          {currentStep === 3 && (
            <div className="wizard-step">
              <h3>Sample Information</h3>

              <div className="form-group">
                <label htmlFor="sampleID">
                  Sample ID <span className="required">*</span>
                </label>
                <input
                  id="sampleID"
                  type="text"
                  value={formData.sampleID}
                  onChange={(e) => updateField('sampleID', e.target.value)}
                  placeholder="Enter sample ID"
                  autoFocus
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="longitude">Longitude</label>
                  <input
                    id="longitude"
                    type="number"
                    step="0.000001"
                    min="-180"
                    max="180"
                    value={formData.longitude}
                    onChange={(e) => updateField('longitude', e.target.value)}
                    placeholder="-180 to 180"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="latitude">Latitude</label>
                  <input
                    id="latitude"
                    type="number"
                    step="0.000001"
                    min="-90"
                    max="90"
                    value={formData.latitude}
                    onChange={(e) => updateField('latitude', e.target.value)}
                    placeholder="-90 to 90"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="mainSamplingPurpose">Main Sampling Purpose</label>
                <select
                  id="mainSamplingPurpose"
                  value={formData.mainSamplingPurpose}
                  onChange={(e) => updateField('mainSamplingPurpose', e.target.value)}
                >
                  <option value="">Select Main Sampling Purpose...</option>
                  <option value="fabric___micro">Fabric / Microstructure</option>
                  <option value="petrology">Petrology</option>
                  <option value="geochronology">Geochronology</option>
                  <option value="geochemistry">Geochemistry</option>
                  <option value="active_eruptio">Active Eruption</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {formData.mainSamplingPurpose === 'other' && (
                <div className="form-group">
                  <label htmlFor="otherSamplingPurpose">Other Sampling Purpose</label>
                  <input
                    id="otherSamplingPurpose"
                    type="text"
                    value={formData.otherSamplingPurpose}
                    onChange={(e) => updateField('otherSamplingPurpose', e.target.value)}
                    placeholder="Specify other purpose"
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="sampleDescription">Sample Description</label>
                <input
                  id="sampleDescription"
                  type="text"
                  value={formData.sampleDescription}
                  onChange={(e) => updateField('sampleDescription', e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="form-group">
                <label htmlFor="materialType">Material Type</label>
                <select
                  id="materialType"
                  value={formData.materialType}
                  onChange={(e) => updateField('materialType', e.target.value)}
                >
                  <option value="">Select Material Type...</option>
                  <option value="intact_rock">Intact Rock</option>
                  <option value="fragmented_roc">Fragmented Rock</option>
                  <option value="sediment">Sediment</option>
                  <option value="tephra">Tephra</option>
                  <option value="carbon_or_animal">Carbon or Animal</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {formData.materialType === 'tephra' && (
                <>
                  <div className="form-group">
                    <label htmlFor="sampleType">Sample Type</label>
                    <input
                      id="sampleType"
                      type="text"
                      value={formData.sampleType}
                      onChange={(e) => updateField('sampleType', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="color">Color</label>
                    <input
                      id="color"
                      type="text"
                      value={formData.color}
                      onChange={(e) => updateField('color', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="lithology">Lithology</label>
                    <input
                      id="lithology"
                      type="text"
                      value={formData.lithology}
                      onChange={(e) => updateField('lithology', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="sampleUnit">Sample Unit</label>
                    <input
                      id="sampleUnit"
                      type="text"
                      value={formData.sampleUnit}
                      onChange={(e) => updateField('sampleUnit', e.target.value)}
                    />
                  </div>
                </>
              )}

              {formData.materialType === 'other' && (
                <div className="form-group">
                  <label htmlFor="otherMaterialType">Other Material Type</label>
                  <input
                    id="otherMaterialType"
                    type="text"
                    value={formData.otherMaterialType}
                    onChange={(e) => updateField('otherMaterialType', e.target.value)}
                    placeholder="Specify other material type"
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="inplacenessOfSample">Inplaceness of Sample</label>
                <select
                  id="inplacenessOfSample"
                  value={formData.inplacenessOfSample}
                  onChange={(e) => updateField('inplacenessOfSample', e.target.value)}
                >
                  <option value="">Select Inplaceness of Sample...</option>
                  <option value="5___definitely">5 - Definitely in Place</option>
                  <option value="4">4</option>
                  <option value="3">3</option>
                  <option value="2">2</option>
                  <option value="1___float">1 - Float</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="orientedSample">Oriented Sample</label>
                <select
                  id="orientedSample"
                  value={formData.orientedSample}
                  onChange={(e) => updateField('orientedSample', e.target.value)}
                >
                  <option value="">Select Oriented Sample...</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              {formData.orientedSample === 'yes' && (
                <div className="form-group">
                  <label htmlFor="sampleOrientationNotes">Sample Orientation Notes</label>
                  <textarea
                    id="sampleOrientationNotes"
                    value={formData.sampleOrientationNotes}
                    onChange={(e) => updateField('sampleOrientationNotes', e.target.value)}
                    rows={3}
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="sampleSize">Sample Size</label>
                <input
                  id="sampleSize"
                  type="text"
                  value={formData.sampleSize}
                  onChange={(e) => updateField('sampleSize', e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="form-group">
                <label htmlFor="degreeOfWeathering">Degree of Weathering</label>
                <select
                  id="degreeOfWeathering"
                  value={formData.degreeOfWeathering}
                  onChange={(e) => updateField('degreeOfWeathering', e.target.value)}
                >
                  <option value="">Select Degree of Weathering...</option>
                  <option value="5___fresh">5 - Fresh</option>
                  <option value="4">4</option>
                  <option value="3">3</option>
                  <option value="2">2</option>
                  <option value="1___highly_wea">1 - Highly Weathered</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="sampleNotes">Sample Notes</label>
                <textarea
                  id="sampleNotes"
                  value={formData.sampleNotes}
                  onChange={(e) => updateField('sampleNotes', e.target.value)}
                  placeholder="Optional sample notes"
                  rows={4}
                />
              </div>
            </div>
          )}
        </div>

        <div className="wizard-footer">
          <button className="button-secondary" onClick={handleCancel}>
            Cancel
          </button>

          {currentStep > 1 && (
            <button className="button-secondary" onClick={handleBack}>
              Back
            </button>
          )}

          {currentStep < 3 ? (
            <button
              className="button-primary"
              onClick={handleNext}
              disabled={
                (currentStep === 1 && !canProceedStep1) ||
                (currentStep === 2 && !canProceedStep2)
              }
            >
              Next
            </button>
          ) : (
            <button
              className="button-primary"
              onClick={handleFinish}
              disabled={!canProceedStep3}
            >
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
