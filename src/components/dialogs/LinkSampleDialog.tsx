/**
 * Link Sample Dialog
 *
 * Multi-step wizard for linking a sample from StraboField server.
 * Steps:
 * 1. Select Project from user's projects
 * 2. Select Dataset from project's datasets
 * 3. Select Sample from dataset's spots
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  CircularProgress,
  Alert,
  Breadcrumbs,
  Link,
  Divider,
} from '@mui/material';
import { ChevronRight } from '@mui/icons-material';
import { authenticatedFetch } from '@/store/useAuthStore';
import { getRestServerUrl } from '@/components/dialogs/PreferencesDialog';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ServerProject {
  id: number;
  name: string;
  description?: string;
}

interface ServerDataset {
  id: number;
  name: string;
}

interface ServerSample {
  id: number;
  sample_id_name?: string;
  label?: string;
  sample_description?: string;
  material_type?: string;
  sample_type?: string;
  longitude?: number;
  latitude?: number;
  main_sampling_purpose?: string;
  inplaceness_of_sample?: string;
  oriented_sample?: string;
  sample_orientation_notes?: string;
  sample_size?: string;
  degree_of_weathering?: string;
  sample_notes?: string;
  color?: string;
  lithology?: string;
  sample_unit?: string;
  Sample_IGSN?: string;
}

interface LinkSampleDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectSample: (sample: ServerSample) => void;
}

type Step = 'projects' | 'datasets' | 'samples';

// ============================================================================
// COMPONENT
// ============================================================================

export function LinkSampleDialog({ open, onClose, onSelectSample }: LinkSampleDialogProps) {
  const [step, setStep] = useState<Step>('projects');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data for each step
  const [projects, setProjects] = useState<ServerProject[]>([]);
  const [datasets, setDatasets] = useState<ServerDataset[]>([]);
  const [samples, setSamples] = useState<ServerSample[]>([]);

  // Selected items
  const [selectedProject, setSelectedProject] = useState<ServerProject | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<ServerDataset | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep('projects');
      setProjects([]);
      setDatasets([]);
      setSamples([]);
      setSelectedProject(null);
      setSelectedDataset(null);
      setError(null);
      loadProjects();
    }
  }, [open]);

  // ========== API CALLS ==========

  const loadProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const restServer = getRestServerUrl();
      const response = await authenticatedFetch(`${restServer}/jwtdb/myProjects`);

      if (!response.ok) {
        throw new Error(`Failed to load projects: ${response.status}`);
      }

      const data = await response.json();
      // API returns array of projects
      setProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[LinkSampleDialog] Error loading projects:', err);
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const loadDatasets = async (projectId: number) => {
    setLoading(true);
    setError(null);

    try {
      const restServer = getRestServerUrl();
      const response = await authenticatedFetch(`${restServer}/jwtdb/projectDatasets/${projectId}`);

      if (!response.ok) {
        throw new Error(`Failed to load datasets: ${response.status}`);
      }

      const data = await response.json();
      setDatasets(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[LinkSampleDialog] Error loading datasets:', err);
      setError(err instanceof Error ? err.message : 'Failed to load datasets');
    } finally {
      setLoading(false);
    }
  };

  const loadSamples = async (datasetId: number) => {
    setLoading(true);
    setError(null);

    try {
      const restServer = getRestServerUrl();
      const response = await authenticatedFetch(`${restServer}/jwtdb/datasetSpots/${datasetId}`);

      if (!response.ok) {
        throw new Error(`Failed to load spots: ${response.status}`);
      }

      const data = await response.json();

      // Extract samples from spots
      // Each spot can have a "samples" array in properties
      const extractedSamples: ServerSample[] = [];

      if (Array.isArray(data)) {
        for (const spot of data) {
          const spotSamples = spot?.properties?.samples;
          if (Array.isArray(spotSamples)) {
            extractedSamples.push(...spotSamples);
          }
        }
      }

      setSamples(extractedSamples);
    } catch (err) {
      console.error('[LinkSampleDialog] Error loading samples:', err);
      setError(err instanceof Error ? err.message : 'Failed to load samples');
    } finally {
      setLoading(false);
    }
  };

  // ========== EVENT HANDLERS ==========

  const handleProjectSelect = (project: ServerProject) => {
    setSelectedProject(project);
    setSelectedDataset(null);
    setDatasets([]);
    setSamples([]);
    setStep('datasets');
    loadDatasets(project.id);
  };

  const handleDatasetSelect = (dataset: ServerDataset) => {
    setSelectedDataset(dataset);
    setSamples([]);
    setStep('samples');
    loadSamples(dataset.id);
  };

  const handleSampleSelect = (sample: ServerSample) => {
    onSelectSample(sample);
    onClose();
  };

  const handleBreadcrumbClick = (targetStep: Step) => {
    if (targetStep === 'projects') {
      setStep('projects');
      setSelectedProject(null);
      setSelectedDataset(null);
      setDatasets([]);
      setSamples([]);
    } else if (targetStep === 'datasets' && selectedProject) {
      setStep('datasets');
      setSelectedDataset(null);
      setSamples([]);
    }
  };

  // ========== RENDER HELPERS ==========

  const renderBreadcrumbs = () => (
    <Box sx={{ mb: 2 }}>
      <Breadcrumbs separator={<ChevronRight fontSize="small" />}>
        <Link
          component="button"
          variant="body2"
          onClick={() => handleBreadcrumbClick('projects')}
          underline={step === 'projects' ? 'none' : 'hover'}
          color={step === 'projects' ? 'text.primary' : 'inherit'}
          sx={{ fontWeight: step === 'projects' ? 600 : 400 }}
        >
          Projects
        </Link>
        {selectedProject && (
          <Link
            component="button"
            variant="body2"
            onClick={() => handleBreadcrumbClick('datasets')}
            underline={step === 'datasets' ? 'none' : 'hover'}
            color={step === 'datasets' ? 'text.primary' : 'inherit'}
            sx={{ fontWeight: step === 'datasets' ? 600 : 400 }}
          >
            {selectedProject.name}
          </Link>
        )}
        {selectedDataset && (
          <Typography
            variant="body2"
            color="text.primary"
            sx={{ fontWeight: 600 }}
          >
            {selectedDataset.name}
          </Typography>
        )}
      </Breadcrumbs>
    </Box>
  );

  const renderLoading = () => (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
      <CircularProgress />
    </Box>
  );

  const renderError = () => (
    <Alert severity="error" sx={{ my: 2 }}>
      {error}
    </Alert>
  );

  const renderProjects = () => {
    if (projects.length === 0) {
      return (
        <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          No projects found.
        </Typography>
      );
    }

    return (
      <List sx={{ maxHeight: 400, overflow: 'auto' }}>
        {projects.map((project) => (
          <ListItemButton
            key={project.id}
            onClick={() => handleProjectSelect(project)}
            divider
          >
            <ListItemText
              primary={project.name}
              secondary={project.description}
            />
            <ChevronRight color="action" />
          </ListItemButton>
        ))}
      </List>
    );
  };

  const renderDatasets = () => {
    if (datasets.length === 0) {
      return (
        <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          No datasets found in this project.
        </Typography>
      );
    }

    return (
      <List sx={{ maxHeight: 400, overflow: 'auto' }}>
        {datasets.map((dataset) => (
          <ListItemButton
            key={dataset.id}
            onClick={() => handleDatasetSelect(dataset)}
            divider
          >
            <ListItemText primary={dataset.name} />
            <ChevronRight color="action" />
          </ListItemButton>
        ))}
      </List>
    );
  };

  const renderSamples = () => {
    if (samples.length === 0) {
      return (
        <Box sx={{ py: 2, textAlign: 'center' }}>
          <Typography color="text.secondary" gutterBottom>
            No samples found in this dataset.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Samples must be added to spots in StraboField before they can be linked here.
          </Typography>
        </Box>
      );
    }

    return (
      <List sx={{ maxHeight: 400, overflow: 'auto' }}>
        {samples.map((sample) => (
          <ListItemButton
            key={sample.id}
            onClick={() => handleSampleSelect(sample)}
            divider
          >
            <ListItemText
              primary={sample.sample_id_name || sample.label || `Sample ${sample.id}`}
              secondary={
                <>
                  {sample.material_type && <span>Material: {sample.material_type}</span>}
                  {sample.sample_description && (
                    <>
                      {sample.material_type && ' | '}
                      {sample.sample_description}
                    </>
                  )}
                </>
              }
            />
          </ListItemButton>
        ))}
      </List>
    );
  };

  const renderContent = () => {
    if (loading) return renderLoading();
    if (error) return renderError();

    switch (step) {
      case 'projects':
        return renderProjects();
      case 'datasets':
        return renderDatasets();
      case 'samples':
        return renderSamples();
      default:
        return null;
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 'projects':
        return 'Select a Project';
      case 'datasets':
        return 'Select a Dataset';
      case 'samples':
        return 'Select a Sample';
      default:
        return '';
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Link Sample From StraboField</DialogTitle>
      <DialogContent>
        {renderBreadcrumbs()}
        <Divider sx={{ mb: 2 }} />
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {getStepTitle()}
        </Typography>
        {renderContent()}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}

// ============================================================================
// HELPER: Map server sample to local SampleMetadata fields
// ============================================================================

export function mapServerSampleToLocal(serverSample: ServerSample): {
  id: string;
  existsOnServer: boolean;
  sampleID?: string;
  label?: string;
  sampleDescription?: string;
  materialType?: string;
  sampleType?: string;
  longitude?: number;
  latitude?: number;
  mainSamplingPurpose?: string;
  inplacenessOfSample?: string;
  orientedSample?: string;
  sampleOrientationNotes?: string;
  sampleSize?: string;
  degreeOfWeathering?: string;
  sampleNotes?: string;
  color?: string;
  lithology?: string;
  sampleUnit?: string;
} {
  return {
    // CRITICAL: Preserve the server ID exactly for backend linking
    id: String(serverSample.id),
    existsOnServer: true,

    // Map snake_case server fields to camelCase local fields
    sampleID: serverSample.sample_id_name,
    label: serverSample.label,
    sampleDescription: serverSample.sample_description,
    materialType: serverSample.material_type,
    sampleType: serverSample.sample_type,
    longitude: serverSample.longitude,
    latitude: serverSample.latitude,
    mainSamplingPurpose: serverSample.main_sampling_purpose,
    inplacenessOfSample: serverSample.inplaceness_of_sample,
    orientedSample: serverSample.oriented_sample,
    sampleOrientationNotes: serverSample.sample_orientation_notes,
    sampleSize: serverSample.sample_size,
    degreeOfWeathering: serverSample.degree_of_weathering,
    sampleNotes: serverSample.sample_notes,
    color: serverSample.color,
    lithology: serverSample.lithology,
    sampleUnit: serverSample.sample_unit,
  };
}
