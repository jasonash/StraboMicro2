import { useState, useEffect } from 'react';
import MainLayout from './components/MainLayout';
import { NewProjectWizard } from './components/dialogs/NewProjectWizard';
import { EditProjectDialog } from './components/dialogs/EditProjectDialog';
import { ProjectDebugModal } from './components/dialogs/ProjectDebugModal';
import { useAppStore } from '@/store';
import { useTheme } from './hooks/useTheme';
import './App.css';

function App() {
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false);
  const [isEditProjectDialogOpen, setIsEditProjectDialogOpen] = useState(false);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [debugWizardStep, setDebugWizardStep] = useState<number | undefined>(undefined);
  const [debugWizardData, setDebugWizardData] = useState<any>(undefined);
  const closeProject = useAppStore(state => state.closeProject);
  const project = useAppStore(state => state.project);
  const setTheme = useAppStore(state => state.setTheme);

  const handleTestOrientationStep = () => {
    // Determine which step to jump to based on whether Instrument Settings would be shown
    // For "Optical Microscopy", Instrument Settings is not shown, so orientation is step 7 (index 7)
    const testStep = 7; // This will be step 7 or 8 depending on the steps array

    const testData = {
      // Step 1: Project Metadata
      name: 'Debug Test Project',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      purposeOfStudy: 'Microstructural analysis of deformed rocks',
      otherTeamMembers: 'Dr. Jane Smith, Dr. Bob Jones',
      areaOfInterest: 'Western Alps',
      gpsDatum: 'WGS84',
      magneticDeclination: '2.5',
      notes: 'Debug test project for orientation step development',

      // Step 2: Dataset Information
      datasetName: 'Test Dataset',

      // Step 3: Sample Information
      sampleID: 'TEST-001',
      longitude: '7.5',
      latitude: '45.8',
      mainSamplingPurpose: 'Microstructure',
      sampleDescription: 'Mylonitic quartzite sample from shear zone',
      materialType: 'Rock',
      lithology: 'Quartzite',
      inplacenessOfSample: 'In Place',
      orientedSample: 'yes',
      sampleOrientationNotes: 'Oriented with magnetic compass',
      sampleSize: 'Hand Sample',
      degreeOfWeathering: 'Fresh',
      sampleNotes: 'Well-developed mylonitic foliation',
      sampleType: 'Thin Section',
      color: 'Gray',
      sampleUnit: 'Shear Zone Unit A',

      // Step 4: Load Reference Micrograph
      micrographFilePath: '/Volumes/8TB/Work/StraboMicro/Micro/ThinSections/good/A_Big.tif',
      micrographFileName: 'A_Big.tif',
      micrographWidth: 10000,
      micrographHeight: 7500,

      // Step 5: Instrument & Image Information
      instrumentType: 'Optical Microscopy',
      dataType: 'Transmitted Light',
      imageType: 'Transmitted Light',
      instrumentBrand: 'Nikon',
      instrumentModel: 'Eclipse LV100N POL',
      university: 'Test University',
      laboratory: 'Structural Geology Lab',

      // Step 6: Instrument Data
      dataCollectionSoftware: 'NIS-Elements',
      dataCollectionSoftwareVersion: '5.2',
      postProcessingSoftware: 'ImageJ',
      postProcessingSoftwareVersion: '1.53',
      instrumentNotes: 'Cross-polarized light imaging',

      // Step 7: Micrograph Metadata
      micrographName: 'Test Micrograph A_Big',
      micrographPolished: true,
      micrographPolishDescription: 'Standard 30 micron thin section, polished to optical quality',
      micrographNotes: 'Cross-polarized light image showing quartz ribbon grains',

      // Step 8: Micrograph Orientation (default to unoriented for testing)
      orientationMethod: 'unoriented' as const,
    };

    setDebugWizardStep(testStep);
    setDebugWizardData(testData);
    setIsNewProjectDialogOpen(true);
  };

  // Initialize theme system
  useTheme();

  // Update window title when project changes
  useEffect(() => {
    if (!window.api) return;

    if (project && project.name) {
      window.api.setWindowTitle(`StraboMicro - ${project.name}`);
    } else {
      window.api.setWindowTitle('StraboMicro');
    }
  }, [project]);

  // Listen for menu events from Electron
  useEffect(() => {
    // Check if window.api is available (Electron context)
    if (!window.api) {
      console.warn('window.api not available - running outside Electron context');
      return;
    }

    // New Project menu item
    window.api.onNewProject(() => {
      setIsNewProjectDialogOpen(true);
    });

    // Open Project menu item (TODO: implement)
    window.api.onOpenProject(() => {
      console.log('Open Project clicked');
    });

    // Edit Project menu item
    window.api.onEditProject(() => {
      setIsEditProjectDialogOpen(true);
    });

    // Debug: Show Project Structure
    window.api.onShowProjectDebug(() => {
      setIsDebugModalOpen(true);
    });

    // Debug: Test Orientation Step
    window.api.onTestOrientationStep(() => {
      handleTestOrientationStep();
    });

    // Debug: Clear Project
    window.api.onClearProject(() => {
      if (confirm('Are you sure you want to clear the current project? This will remove it from localStorage.')) {
        closeProject();
        console.log('Project cleared');
      }
    });

    // Theme menu item
    window.api.onThemeChange((theme) => {
      setTheme(theme);
    });
  }, [closeProject, setTheme]);

  return (
    <>
      <MainLayout />
      <NewProjectWizard
        isOpen={isNewProjectDialogOpen}
        onClose={() => {
          setIsNewProjectDialogOpen(false);
          setDebugWizardStep(undefined);
          setDebugWizardData(undefined);
        }}
        debugInitialStep={debugWizardStep}
        debugTestData={debugWizardData}
      />
      <EditProjectDialog
        isOpen={isEditProjectDialogOpen}
        onClose={() => setIsEditProjectDialogOpen(false)}
      />
      <ProjectDebugModal
        isOpen={isDebugModalOpen}
        onClose={() => setIsDebugModalOpen(false)}
        onTestOrientationStep={handleTestOrientationStep}
      />
    </>
  );
}

export default App;
