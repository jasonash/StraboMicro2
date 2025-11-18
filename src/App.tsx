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

  const handleTestScaleBarStep = () => {
    // For "Optical Microscopy", Instrument Settings is not shown, so scale bar is step 9 (index 9)
    const testStep = 9; // This will be the "Trace Scale Bar" input step

    const testData = {
      // Step 1: Project Metadata
      name: 'Debug Test Project - Scale Bar',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      purposeOfStudy: 'Testing scale bar functionality',
      otherTeamMembers: '',
      areaOfInterest: 'Test Area',
      gpsDatum: 'WGS84',
      magneticDeclination: '0',
      notes: 'Debug test for scale bar canvas',

      // Step 2: Dataset Information
      datasetName: 'Test Dataset',

      // Step 3: Sample Information
      sampleID: 'TEST-SCALE-001',
      longitude: '0',
      latitude: '0',
      mainSamplingPurpose: 'Microstructure',
      sampleDescription: 'Test sample for scale bar',
      materialType: 'Rock',
      lithology: 'Quartzite',
      inplacenessOfSample: 'In Place',
      orientedSample: 'no',
      sampleOrientationNotes: '',
      sampleSize: 'Hand Sample',
      degreeOfWeathering: 'Fresh',
      sampleNotes: '',
      sampleType: 'Thin Section',
      color: 'Gray',
      sampleUnit: '',

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
      instrumentModel: 'Test Model',
      university: 'Test University',
      laboratory: 'Test Lab',

      // Step 6: Instrument Data
      dataCollectionSoftware: 'Test Software',
      dataCollectionSoftwareVersion: '1.0',
      postProcessingSoftware: '',
      postProcessingSoftwareVersion: '',
      instrumentNotes: '',

      // Step 7: Micrograph Metadata
      micrographName: 'Test Scale Bar Micrograph',
      micrographPolished: true,
      micrographPolishDescription: 'Standard thin section',
      micrographNotes: '',

      // Step 8: Micrograph Orientation
      orientationMethod: 'unoriented' as const,

      // Step 9: Scale Method (already selected)
      scaleMethod: 'Trace Scale Bar' as const,
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

    // Debug: Test Scale Bar Step
    window.api.onTestScaleBarStep(() => {
      handleTestScaleBarStep();
    });

    // Debug: Clear Project
    window.api.onClearProject(() => {
      if (confirm('Are you sure you want to clear the current project? This will remove it from localStorage.')) {
        closeProject();
        console.log('Project cleared');
      }
    });

    // Debug: Quick Load Image
    window.api.onQuickLoadImage(async () => {
      try {
        // Clear all tile caches first
        if (window.api.clearAllCaches) {
          await window.api.clearAllCaches();
          console.log('Tile cache cleared');
        }

        // Prompt user to select an image file
        const filePath = await window.api.openTiffDialog();
        if (!filePath) {
          console.log('No file selected');
          return;
        }

        // Load image metadata
        const imageData = await window.api.loadTiffImage(filePath);
        console.log('Image loaded:', imageData);

        // Create a minimal project with just this one micrograph
        const micrographId = crypto.randomUUID();
        const quickProject = {
          id: crypto.randomUUID(),
          name: 'Quick Load Project',
          projectLocation: 'local' as const,
          datasets: [
            {
              id: crypto.randomUUID(),
              name: 'Quick Dataset',
              samples: [
                {
                  id: crypto.randomUUID(),
                  name: 'Quick Sample',
                  label: 'Quick Sample',
                  sampleID: 'QUICK-001',
                  micrographs: [
                    {
                      id: micrographId,
                      name: imageData.fileName,
                      imagePath: filePath,
                      imageFilename: imageData.fileName,
                      imageWidth: imageData.width,
                      imageHeight: imageData.height,
                      width: imageData.width, // Legacy field
                      height: imageData.height, // Legacy field
                      opacity: 1.0,
                      polish: false,
                      polishDescription: '',
                      notes: 'Quick load for testing',
                      orientationInfo: { orientationMethod: 'unoriented' as const },
                      scalePixelsPerCentimeter: 100, // Placeholder
                      instrument: {},
                      isMicroVisible: true,
                      isFlipped: false,
                    },
                  ],
                },
              ],
            },
          ],
        };

        // Load the project
        useAppStore.getState().loadProject(quickProject, null);

        // Select the micrograph
        setTimeout(() => {
          useAppStore.getState().selectMicrograph(micrographId);
          console.log('Micrograph loaded and selected');
        }, 0);
      } catch (error) {
        console.error('Failed to quick load image:', error);
        alert('Failed to load image: ' + (error as Error).message);
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
