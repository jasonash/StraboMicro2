/**
 * Link StraboSample Dialog
 *
 * Picker for linking a sample from the StraboSamples system (the central
 * cross-system sample spine shared by StraboField, StraboMicro, and
 * StraboExperimental). Replaces the old StraboField project/dataset/spot
 * drill-down: one flat, searchable list from GET /mysamples, with the full
 * record fetched on selection.
 *
 * Samples the user collaborates on but does not own are shown disabled:
 * a Micro upload registers samples under the uploader's own account, so
 * linking someone else's sample would create a duplicate instead of a link.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  List,
  ListItemButton,
  ListItemText,
  CircularProgress,
  Alert,
  InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useAuthStore } from '@/store/useAuthStore';
import {
  fetchMySamples,
  fetchSample,
  SAMPLE_MATERIAL_TYPE_LABELS,
  SAMPLE_PURPOSE_LABELS,
  type SpineSampleSummary,
  type SpineSampleRecord,
} from '@/services/straboSamplesApi';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface LinkStraboSampleDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the full spine record when the user picks a sample */
  onSelectSample: (record: SpineSampleRecord) => void;
  /** Sample IDs already linked in the project (to prevent duplicates) */
  existingSampleIds?: Set<string>;
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

function sampleDisplayName(sample: SpineSampleSummary): string {
  return sample.name || `Sample ${sample.id}`;
}

function sampleSecondaryText(sample: SpineSampleSummary): string {
  const parts: string[] = [];
  if (sample.display_sample_type) {
    parts.push(SAMPLE_MATERIAL_TYPE_LABELS[sample.display_sample_type] ?? sample.display_sample_type);
  }
  if (sample.display_sample_purpose) {
    parts.push(SAMPLE_PURPOSE_LABELS[sample.display_sample_purpose] ?? sample.display_sample_purpose);
  }
  if (sample.description) {
    parts.push(sample.description);
  }
  return parts.join(' | ');
}

const COLLABORATED_HINT =
  "Owned by another user. Samples you collaborate on can't be linked from StraboMicro yet.";

// ============================================================================
// COMPONENT
// ============================================================================

export function LinkStraboSampleDialog({
  open,
  onClose,
  onSelectSample,
  existingSampleIds,
}: LinkStraboSampleDialogProps) {
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [samples, setSamples] = useState<SpineSampleSummary[]>([]);
  const [searchText, setSearchText] = useState('');

  const myPkey = useAuthStore((state) => state.user?.pkey);

  // Load the sample list when the dialog opens
  useEffect(() => {
    if (!open) return;
    setSamples([]);
    setSearchText('');
    setError(null);
    setSelecting(null);
    setLoading(true);

    let cancelled = false;
    (async () => {
      try {
        const list = await fetchMySamples();
        if (!cancelled) setSamples(list);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.message === 'Login cancelled') {
          onClose();
          return;
        }
        console.error('[LinkStraboSampleDialog] Error loading samples:', err);
        setError(err instanceof Error ? err.message : 'Failed to load samples');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filteredSamples = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return samples;
    return samples.filter((sample) => {
      const haystack = [sample.name, sample.igsn, sample.description, sample.id]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [samples, searchText]);

  const handleSampleClick = async (sample: SpineSampleSummary) => {
    if (selecting) return;
    setSelecting(sample.id);
    setError(null);
    try {
      const record = await fetchSample(sample.id);
      onSelectSample(record);
      onClose();
    } catch (err) {
      if (err instanceof Error && err.message === 'Login cancelled') {
        onClose();
        return;
      }
      console.error('[LinkStraboSampleDialog] Error loading sample record:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sample');
    } finally {
      setSelecting(null);
    }
  };

  const renderList = () => {
    if (samples.length === 0) {
      return (
        <Box sx={{ py: 2, textAlign: 'center' }}>
          <Typography color="text.secondary" gutterBottom>
            No samples found in your StraboSamples account.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Samples appear here after they are created in StraboField, StraboMicro,
            or StraboExperimental and uploaded to the server.
          </Typography>
        </Box>
      );
    }

    if (filteredSamples.length === 0) {
      return (
        <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          No samples match your search.
        </Typography>
      );
    }

    return (
      <List sx={{ maxHeight: 400, overflow: 'auto' }}>
        {filteredSamples.map((sample) => {
          const isCollaborated = myPkey != null && String(sample.userpkey) !== String(myPkey);
          const alreadyLinked = existingSampleIds?.has(String(sample.id)) ?? false;
          const disabled = isCollaborated || alreadyLinked || selecting !== null;
          return (
            <ListItemButton
              key={`${sample.id}-${sample.userpkey}`}
              onClick={() => !disabled && handleSampleClick(sample)}
              disabled={disabled}
              divider
            >
              <ListItemText
                primary={
                  sampleDisplayName(sample) + (alreadyLinked ? ' (already linked)' : '')
                }
                secondary={isCollaborated ? COLLABORATED_HINT : sampleSecondaryText(sample)}
                secondaryTypographyProps={
                  isCollaborated ? { sx: { fontStyle: 'italic' } } : undefined
                }
              />
              {selecting === sample.id && <CircularProgress size={20} />}
            </ListItemButton>
          );
        })}
      </List>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Link Sample From StraboSamples</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Your samples across StraboField, StraboMicro, and StraboExperimental.
          Select one to link it to this project.
        </Typography>
        <TextField
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search by name, IGSN, or description..."
          size="small"
          fullWidth
          autoFocus
          sx={{ mb: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        {error && (
          <Alert severity="error" sx={{ my: 2 }}>
            {error}
          </Alert>
        )}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          renderList()
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
