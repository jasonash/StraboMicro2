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
  Divider,
  Chip,
  Stack,
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
  const [instrumentDetail, setInstrumentDetail] = useState<InstrumentDetail | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch instrument list on dialog open
  useEffect(() => {
    if (isOpen && instruments.length === 0) {
      fetchInstrumentList();
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

  // Fetch instrument detail when selection changes
  useEffect(() => {
    if (selectedInstrument) {
      fetchInstrumentDetail(selectedInstrument.id);
    } else {
      setInstrumentDetail(null);
    }
  }, [selectedInstrument]);

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

  const fetchInstrumentDetail = async (id: string) => {
    setIsLoadingDetail(true);

    try {
      const restServer = getRestServerUrl();
      const response = await fetch(`${restServer}/instrument_detail/${id}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch instrument details: ${response.status}`);
      }

      const data: InstrumentDetail = await response.json();
      setInstrumentDetail(data);
    } catch (err) {
      console.error('[InstrumentDatabase] Failed to fetch detail:', err);
      setInstrumentDetail(null);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleSelect = useCallback(() => {
    if (!instrumentDetail) return;

    // Map API response to our instrument data format
    const instrumentData: InstrumentData = {
      instrumentType: instrumentDetail.instrumenttype || '',
      instrumentBrand: instrumentDetail.instrumentbrand || '',
      instrumentModel: instrumentDetail.instrumentmodel || '',
      university: instrumentDetail.university || '',
      laboratory: instrumentDetail.laboratory || '',
      dataCollectionSoftware: instrumentDetail.datacollectionsoftware || '',
      dataCollectionSoftwareVersion: instrumentDetail.datacollectionsoftwareversion || '',
      postProcessingSoftware: instrumentDetail.postprocessingsoftware || '',
      postProcessingSoftwareVersion: instrumentDetail.postprocessingsoftwareversion || '',
      filamentType: instrumentDetail.filamenttype || '',
      instrumentNotes: instrumentDetail.instrumentnotes || '',
      detectors: (instrumentDetail.detectors || []).map((d) => ({
        detectorType: d.type || '',
        detectorMake: d.make || '',
        detectorModel: d.model || '',
      })),
    };

    onSelect(instrumentData);
    handleClose();
  }, [instrumentDetail, onSelect]);

  const handleClose = () => {
    setSelectedInstrument(null);
    setInstrumentDetail(null);
    setSearchQuery('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Find Instrument in Database</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 2, height: 400 }}>
          {/* Left side: Search and list */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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
                      onClick={() => setSelectedInstrument(inst)}
                    >
                      <ListItemText
                        primary={inst.name}
                        primaryTypographyProps={{
                          variant: 'body2',
                          noWrap: true,
                        }}
                      />
                    </ListItemButton>
                  ))
                )}
              </List>
            )}

            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              {filteredInstruments.length} instrument{filteredInstruments.length !== 1 ? 's' : ''}{' '}
              {searchQuery && `matching "${searchQuery}"`}
            </Typography>
          </Box>

          <Divider orientation="vertical" flexItem />

          {/* Right side: Selected instrument details */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {isLoadingDetail ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : instrumentDetail ? (
              <Stack spacing={2}>
                <Typography variant="h6" sx={{ fontSize: '1rem' }}>
                  {instrumentDetail.instrumentname}
                </Typography>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Type
                  </Typography>
                  <Typography variant="body2">{instrumentDetail.instrumenttype || '—'}</Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Brand
                    </Typography>
                    <Typography variant="body2">
                      {instrumentDetail.instrumentbrand || '—'}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Model
                    </Typography>
                    <Typography variant="body2">
                      {instrumentDetail.instrumentmodel || '—'}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      University
                    </Typography>
                    <Typography variant="body2">{instrumentDetail.university || '—'}</Typography>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Laboratory
                    </Typography>
                    <Typography variant="body2">{instrumentDetail.laboratory || '—'}</Typography>
                  </Box>
                </Box>

                {instrumentDetail.datacollectionsoftware && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Data Collection Software
                    </Typography>
                    <Typography variant="body2">
                      {instrumentDetail.datacollectionsoftware}
                      {instrumentDetail.datacollectionsoftwareversion &&
                        ` (v${instrumentDetail.datacollectionsoftwareversion})`}
                    </Typography>
                  </Box>
                )}

                {instrumentDetail.postprocessingsoftware && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Post-Processing Software
                    </Typography>
                    <Typography variant="body2">
                      {instrumentDetail.postprocessingsoftware}
                      {instrumentDetail.postprocessingsoftwareversion &&
                        ` (v${instrumentDetail.postprocessingsoftwareversion})`}
                    </Typography>
                  </Box>
                )}

                {instrumentDetail.filamenttype && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Filament Type
                    </Typography>
                    <Typography variant="body2">{instrumentDetail.filamenttype}</Typography>
                  </Box>
                )}

                {instrumentDetail.detectors && instrumentDetail.detectors.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Detectors
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      {instrumentDetail.detectors.map((det, idx) => (
                        <Chip
                          key={idx}
                          label={det.type || 'Unknown'}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </Box>
                )}

                {instrumentDetail.instrumentnotes && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Notes
                    </Typography>
                    <Typography variant="body2">{instrumentDetail.instrumentnotes}</Typography>
                  </Box>
                )}
              </Stack>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Select an instrument to view details
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleSelect}
          variant="contained"
          disabled={!instrumentDetail}
        >
          Use This Instrument
        </Button>
      </DialogActions>
    </Dialog>
  );
}
