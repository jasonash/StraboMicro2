/**
 * BatchEditSpotsDialog Component
 *
 * Dialog for batch editing multiple selected spots.
 * Uses checkbox + field pattern - only checked fields are applied.
 *
 * Editable fields:
 * - Primary Mineral (mineralogy)
 * - Color
 * - Opacity
 * - Links (added to each spot's links; a URL the spot already has is skipped)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Checkbox,
  FormControlLabel,
  TextField,
  Typography,
  Slider,
  IconButton,
  DialogContentText,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useReadOnly } from '../ReadOnlyScope';
import { useAppStore } from '@/store';
import { AutocompleteMineralSearch } from './metadata/reusable/AutocompleteMineralSearch';
import { LinkAddForm, isValidURL, type LinkData } from './metadata/links/LinkAddForm';
import type { LinkType, Spot } from '@/types/project-types';
import { addLinks } from '@/utils/spotLinks';

interface BatchEditSpotsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FieldState<T> {
  enabled: boolean;
  value: T;
}

// Default color and localStorage key for remembering last used color
const DEFAULT_COLOR = '#e53935'; // Nice red
const LAST_COLOR_KEY = 'strabomicro2-batch-edit-last-color';

function getLastUsedColor(): string {
  try {
    return localStorage.getItem(LAST_COLOR_KEY) || DEFAULT_COLOR;
  } catch {
    return DEFAULT_COLOR;
  }
}

function saveLastUsedColor(color: string): void {
  try {
    localStorage.setItem(LAST_COLOR_KEY, color);
  } catch {
    // Ignore localStorage errors
  }
}

export function BatchEditSpotsDialog({ isOpen, onClose }: BatchEditSpotsDialogProps) {
  const readOnlyScope = useReadOnly().readOnly;
  const selectedSpotIds = useAppStore((state) => state.selectedSpotIds);
  const spotIndex = useAppStore((state) => state.spotIndex);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  // Field states with checkbox enable/disable
  const [mineral, setMineral] = useState<FieldState<string>>({
    enabled: false,
    value: '',
  });
  const [color, setColor] = useState<FieldState<string>>({
    enabled: false,
    value: DEFAULT_COLOR,
  });
  const [opacity, setOpacity] = useState<FieldState<number>>({
    enabled: false,
    value: 50,
  });
  const [links, setLinks] = useState<FieldState<LinkType[]>>({
    enabled: false,
    value: [],
  });
  // A link typed in the form but not added yet, and the question about it
  const [linkDraft, setLinkDraft] = useState<LinkData>({ label: '', url: '' });
  const [askNotAdded, setAskNotAdded] = useState(false);
  const handleDraftChange = useCallback((draft: LinkData) => setLinkDraft(draft), []);

  // Reset form when dialog opens, using last used color
  useEffect(() => {
    if (isOpen) {
      setMineral({ enabled: false, value: '' });
      setColor({ enabled: false, value: getLastUsedColor() });
      setOpacity({ enabled: false, value: 50 });
      setLinks({ enabled: false, value: [] });
      setLinkDraft({ label: '', url: '' });
      setAskNotAdded(false);
    }
  }, [isOpen]);

  const draftHasText = links.enabled && (linkDraft.label.trim() !== '' || linkDraft.url.trim() !== '');
  const draftIsValid = linkDraft.label.trim() !== '' && isValidURL(linkDraft.url);

  const handleApplyClick = () => {
    if (draftHasText) {
      setAskNotAdded(true);
      return;
    }
    applyToSpots(links.value);
  };

  const applyToSpots = (linksToAdd: LinkType[]) => {
    setAskNotAdded(false);

    // Build update object with only enabled fields
    const updates: Record<string, unknown> = {};

    if (mineral.enabled && mineral.value) {
      updates.mineralogy = {
        minerals: [
          {
            name: mineral.value,
            operator: 'eq',
            percentage: 100,
          },
        ],
      };
    }

    if (color.enabled) {
      updates.color = color.value;
      saveLastUsedColor(color.value);
    }

    if (opacity.enabled) {
      updates.opacity = opacity.value;
    }

    // Apply updates to all selected spots; a spot with nothing to change is left alone
    for (const spotId of selectedSpotIds) {
      const spot = spotIndex.get(spotId);
      if (!spot) continue;

      const spotUpdates: Partial<Spot> = {};
      if (updates.mineralogy) {
        spotUpdates.mineralogy = updates.mineralogy as typeof spot.mineralogy;
      }
      if (updates.color !== undefined) {
        spotUpdates.color = updates.color as string;
      }
      if (updates.opacity !== undefined) {
        spotUpdates.opacity = updates.opacity as number;
      }
      if (links.enabled) {
        const merged = addLinks(spot.links, linksToAdd);
        if (merged) spotUpdates.links = merged;
      }

      if (Object.keys(spotUpdates).length > 0) {
        updateSpotData(spotId, spotUpdates);
      }
    }

    onClose();
  };

  const hasEnabledFields =
    mineral.enabled || color.enabled || opacity.enabled || (links.enabled && (links.value.length > 0 || draftHasText));

  return (
    <>
      <Dialog open={askNotAdded} onClose={() => setAskNotAdded(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add before applying?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You filled in the link {linkDraft.label.trim() || linkDraft.url.trim()} but did not press Add, so it is not
            in the list yet. Only links in the list are added to the spots.
            {!draftIsValid && ' It needs a label and a URL beginning with http:// or https:// before it can be added.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAskNotAdded(false)}>Back</Button>
          <Button onClick={() => applyToSpots(links.value)}>Apply Without It</Button>
          <Button
            variant="contained"
            disabled={!draftIsValid}
            onClick={() => applyToSpots([...links.value, linkDraft])}
          >
            Add and Apply
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          Edit {selectedSpotIds.length} Spots
        </DialogTitle>

        <DialogContent>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              mb: 2
            }}>
            Check the fields you want to update. Only checked fields will be applied to all selected spots.
          </Typography>

          {/* Primary Mineral */}
          <Box sx={{ mb: 3 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={mineral.enabled}
                  onChange={(e) => setMineral((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
              }
              label="Primary Mineral"
            />
            {mineral.enabled && (
              <Box sx={{ ml: 4, mt: 1 }}>
                <AutocompleteMineralSearch
                  selectedMinerals={mineral.value ? [mineral.value] : []}
                  onChange={(minerals) => setMineral((prev) => ({ ...prev, value: minerals[0] || '' }))}
                  label="Mineral"
                  multiple={false}
                />
              </Box>
            )}
          </Box>

          {/* Color */}
          <Box sx={{ mb: 3 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={color.enabled}
                  onChange={(e) => setColor((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
              }
              label="Color"
            />
            {color.enabled && (
              <Box sx={{ ml: 4, mt: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                <input
                  type="color"
                  disabled={readOnlyScope}
                  value={color.value}
                  onChange={(e) => setColor((prev) => ({ ...prev, value: e.target.value }))}
                  style={{
                    width: 60,
                    height: 36,
                    padding: 0,
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                />
                <TextField
                  value={color.value}
                  onChange={(e) => setColor((prev) => ({ ...prev, value: e.target.value }))}
                  size="small"
                  sx={{ width: 100 }}
                />
              </Box>
            )}
          </Box>

          {/* Opacity */}
          <Box sx={{ mb: 3 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={opacity.enabled}
                  onChange={(e) => setOpacity((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
              }
              label="Opacity"
            />
            {opacity.enabled && (
              <Box sx={{ ml: 4, mt: 1, pr: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Slider
                    value={opacity.value}
                    onChange={(_, value) => setOpacity((prev) => ({ ...prev, value: value as number }))}
                    min={0}
                    max={100}
                    valueLabelDisplay="auto"
                    sx={{ flex: 1 }}
                  />
                  <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'right' }}>
                    {opacity.value}%
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>

          {/* Links */}
          <Box sx={{ mb: 3 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={links.enabled}
                  onChange={(e) => setLinks((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
              }
              label="Links"
            />
            {links.enabled && (
              <Box sx={{ ml: 4, mt: 1 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                  These links are added to each spot's links. A spot that already has a link's URL keeps it once.
                </Typography>
                {links.value.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', mb: 2 }}>
                    No links added yet. Fill in the form below and click Add.
                  </Typography>
                ) : (
                  <Box sx={{ mb: 2 }}>
                    {links.value.map((link, index) => (
                      <Box
                        key={`${link.url}-${index}`}
                        sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {link.label}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', wordBreak: 'break-all' }}>
                            {link.url}
                          </Typography>
                        </Box>
                        <IconButton
                          size="small"
                          aria-label={`Remove ${link.label}`}
                          onClick={() =>
                            setLinks((prev) => ({ ...prev, value: prev.value.filter((_, i) => i !== index) }))
                          }
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>
                )}
                <LinkAddForm
                  onAdd={(link) => setLinks((prev) => ({ ...prev, value: [...prev.value, link] }))}
                  onDraftChange={handleDraftChange}
                />
              </Box>
            )}
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleApplyClick}
            variant="contained"
            disabled={!hasEnabledFields}
          >
            Apply to {selectedSpotIds.length} Spots
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default BatchEditSpotsDialog;
