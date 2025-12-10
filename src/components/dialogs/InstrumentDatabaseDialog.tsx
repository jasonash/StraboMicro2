/**
 * Instrument Database Dialog
 *
 * Allows users to search and select from a community-defined list of instruments.
 * When an instrument is selected, its metadata is loaded and can be applied to
 * the micrograph's instrument fields.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  List,
  ListItemButton,
  ListItemText,
  Box,
  Typography,
  CircularProgress,
  Alert,
  InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { getRestServerUrl } from '@/components/dialogs/PreferencesDialog';
import type { InstrumentDetectorType } from '@/types/project-types';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface InstrumentListItem {
  id: string;
  name: string;
}

interface InstrumentDetail {
  instrumentname: string;
  instrumenttype: string;
  instrumentbrand: string;
  instrumentmodel: string;
  university: string;
  laboratory: string;
  datacollectionsoftware: string;
  datacollectionsoftwareversion: string;
  postprocessingsoftware: string;
  postprocessingsoftwareversion: string;
  filamenttype: string;
  detectors: Array<{
    type: string;
    make: string;
    model: string;
  }>;
  instrumentnotes: string;
}

export interface InstrumentData {
  instrumentType: string;
  instrumentBrand: string;
  instrumentModel: string;
  university: string;
  laboratory: string;
  dataCollectionSoftware: string;
  dataCollectionSoftwareVersion: string;
  postProcessingSoftware: string;
  postProcessingSoftwareVersion: string;
  filamentType: string;
  instrumentNotes: string;
  detectors: InstrumentDetectorType[];
}

interface InstrumentDatabaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (instrument: InstrumentData) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function InstrumentDatabaseDialog({
  isOpen,
  onClose,
  onSelect,
}: InstrumentDatabaseDialogProps) {
  const [instruments, setInstruments] = useState<InstrumentListItem[]>([]);
  const [filteredInstruments, setFilteredInstruments] = useState<InstrumentListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentListItem | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch instrument list on dialog open - always fetch fresh data
  // (no caching, so users see updates they made to the online repository)
  useEffect(() => {
    if (isOpen) {
      fetchInstrumentList();
      // Reset selection when dialog opens
      setSelectedInstrument(null);
      setSearchQuery('');
      setError(null);
    }
  }, [isOpen]);

  // Filter instruments when search query changes
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredInstruments(instruments);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredInstruments(
        instruments.filter((inst) => inst.name.toLowerCase().includes(query))
      );
    }
  }, [searchQuery, instruments]);

  const fetchInstrumentList = async () => {
    setIsLoadingList(true);
    setError(null);

    try {
      const restServer = getRestServerUrl();
      const response = await fetch(`${restServer}/instrument_list.js`);

      if (!response.ok) {
        throw new Error(`Failed to fetch instrument list: ${response.status}`);
      }

      const data = await response.json();
      setInstruments(data.instruments || []);
      setFilteredInstruments(data.instruments || []);
    } catch (err) {
      console.error('[InstrumentDatabase] Failed to fetch list:', err);
      setError(err instanceof Error ? err.message : 'Failed to load instrument list');
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleSelectInstrument = useCallback(async (inst: InstrumentListItem) => {
    setSelectedInstrument(inst);
    setIsSelecting(true);

    try {
      const restServer = getRestServerUrl();
      const response = await fetch(`${restServer}/instrument_detail/${inst.id}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch instrument details: ${response.status}`);
      }

      const detail: InstrumentDetail = await response.json();

      // Map API response to our instrument data format
      const instrumentData: InstrumentData = {
        instrumentType: detail.instrumenttype || '',
        instrumentBrand: detail.instrumentbrand || '',
        instrumentModel: detail.instrumentmodel || '',
        university: detail.university || '',
        laboratory: detail.laboratory || '',
        dataCollectionSoftware: detail.datacollectionsoftware || '',
        dataCollectionSoftwareVersion: detail.datacollectionsoftwareversion || '',
        postProcessingSoftware: detail.postprocessingsoftware || '',
        postProcessingSoftwareVersion: detail.postprocessingsoftwareversion || '',
        filamentType: detail.filamenttype || '',
        instrumentNotes: detail.instrumentnotes || '',
        detectors: (detail.detectors || []).map((d) => ({
          detectorType: d.type || '',
          detectorMake: d.make || '',
          detectorModel: d.model || '',
        })),
      };

      onSelect(instrumentData);
      handleClose();
    } catch (err) {
      console.error('[InstrumentDatabase] Failed to fetch detail:', err);
      setError(err instanceof Error ? err.message : 'Failed to load instrument details');
    } finally {
      setIsSelecting(false);
    }
  }, [onSelect]);

  const handleClose = () => {
    setSelectedInstrument(null);
    setSearchQuery('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Find Instrument in Database</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', height: 400 }}>
          <TextField
            fullWidth
            placeholder="Search instruments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            sx={{ mb: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />

          {isLoadingList ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <List
              sx={{
                flex: 1,
                overflow: 'auto',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
              }}
            >
              {filteredInstruments.length === 0 ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ p: 2, textAlign: 'center' }}
                >
                  {searchQuery ? 'No instruments match your search' : 'No instruments available'}
                </Typography>
              ) : (
                filteredInstruments.map((inst) => (
                  <ListItemButton
                    key={inst.id}
                    selected={selectedInstrument?.id === inst.id}
                    onClick={() => handleSelectInstrument(inst)}
                    disabled={isSelecting}
                  >
                    <ListItemText
                      primary={inst.name}
                      primaryTypographyProps={{
                        variant: 'body2',
                      }}
                    />
                  </ListItemButton>
                ))
              )}
            </List>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
            {filteredInstruments.length} instrument{filteredInstruments.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
