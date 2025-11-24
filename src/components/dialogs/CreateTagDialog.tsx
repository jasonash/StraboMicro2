/**
 * Create Tag Dialog
 *
 * Modal dialog for creating a new tag or editing an existing tag.
 * Matches the legacy JavaFX newTag.java / editTag.java functionality.
 *
 * Note: Tag type selection is commented out but preserved for future use.
 * Currently defaults to tagType="Other" and otherTagType="Legacy" as per legacy app behavior.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Slider,
  Stack,
  // Uncomment when tag types are enabled:
  // FormControl,
  // InputLabel,
  // Select,
  // MenuItem,
} from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import { MuiColorInput } from 'mui-color-input';
import { useAppStore } from '@/store';
import type { Tag } from '@/types/project-types';

// ============================================================================
// TAG TYPE OPTIONS (commented out for future use)
// ============================================================================

// const TAG_TYPES = [
//   { id: 'Conceptual', label: 'Conceptual' },
//   { id: 'Documentation', label: 'Documentation' },
//   { id: 'Rosetta', label: 'Rosetta' },
//   { id: 'Experimental Apparatus', label: 'Experimental Apparatus' },
//   { id: 'Other', label: 'Other' },
//   { id: 'No Type Specified', label: 'No Type Specified' },
// ];

// const CONCEPTUAL_SUBTYPES = [
//   { id: 'Geological Structure', label: 'Geological Structure' },
//   { id: 'Marker Layer', label: 'Marker Layer' },
//   { id: 'Deformation Event', label: 'Deformation Event' },
//   { id: 'Degree of Deformation', label: 'Degree of Deformation' },
//   { id: 'Metamorphic Facies', label: 'Metamorphic Facies' },
//   { id: 'Other Concept', label: 'Other Concept' },
// ];

// const DOCUMENTATION_SUBTYPES = [
//   { id: 'Observation Timing', label: 'Observation Timing' },
//   { id: 'Type of Data', label: 'Type of Data' },
//   { id: 'Other Documentation', label: 'Other Documentation' },
// ];

// ============================================================================
// COMPONENT
// ============================================================================

interface CreateTagDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  editMode?: boolean;
  editTag?: Tag | null;
  onTagSaved?: (tag: Tag) => void;
}

// Color presets for quick selection (used in commented-out line color picker)
// const COLOR_PRESETS = [
//   '#FF0000', // Red
//   '#00FF00', // Green
//   '#0000FF', // Blue
//   '#FFFF00', // Yellow
//   '#FF00FF', // Magenta
//   '#00FFFF', // Cyan
//   '#FFA500', // Orange
//   '#800080', // Purple
// ];

export function CreateTagDialog({
  open,
  onClose,
  onCreated,
  editMode = false,
  editTag = null,
  onTagSaved,
}: CreateTagDialogProps) {
  const createTag = useAppStore((state) => state.createTag);
  const updateTag = useAppStore((state) => state.updateTag);

  // Form state
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [lineColor, setLineColor] = useState('#FFFFFF'); // Default to white
  const [fillColor, setFillColor] = useState('#FF0000');
  const [transparency, setTransparency] = useState(100); // 0-100%
  const [tagSize, setTagSize] = useState(10); // pixels
  const [error, setError] = useState('');

  // Commented out tag type state for future use:
  // const [tagType, setTagType] = useState('Other');
  // const [tagSubtype, setTagSubtype] = useState('');
  // const [otherConcept, setOtherConcept] = useState('');
  // const [otherDocumentation, setOtherDocumentation] = useState('');
  // const [otherTagType, setOtherTagType] = useState('');

  // Load saved preferences from localStorage
  const loadSavedPreferences = useCallback(() => {
    const savedFillColor = localStorage.getItem('lastTagFillColor');
    // const savedLineColor = localStorage.getItem('lastTagLineColor'); // Commented out - defaulting to white
    const savedSize = localStorage.getItem('lastTagSize');
    const savedTransparency = localStorage.getItem('lastTagTransparency');

    if (savedFillColor) setFillColor(savedFillColor);
    // if (savedLineColor) setLineColor(savedLineColor); // Commented out - defaulting to white
    if (savedSize) setTagSize(parseInt(savedSize, 10));
    if (savedTransparency) setTransparency(parseInt(savedTransparency, 10));
  }, []);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (editMode && editTag) {
        // Edit mode - load existing tag data
        setName(editTag.name || '');
        setNotes(editTag.notes || '');
        setLineColor(editTag.lineColor || '#000000');
        setFillColor(editTag.fillColor || '#FF0000');
        setTransparency(editTag.transparency ?? 100);
        setTagSize(editTag.tagSize ?? 10);
        // Commented out for future use:
        // setTagType(editTag.tagType || 'Other');
        // setTagSubtype(editTag.tagSubtype || '');
        // setOtherConcept(editTag.otherConcept || '');
        // setOtherDocumentation(editTag.otherDocumentation || '');
        // setOtherTagType(editTag.otherTagType || '');
      } else {
        // Create mode - reset to defaults and load saved preferences
        setName('');
        setNotes('');
        loadSavedPreferences();
      }
      setError('');
    }
  }, [open, editMode, editTag, loadSavedPreferences]);

  const handleSubmit = () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('Tag name is required');
      return;
    }

    // Save preferences for next time
    localStorage.setItem('lastTagFillColor', fillColor);
    localStorage.setItem('lastTagLineColor', lineColor);
    localStorage.setItem('lastTagSize', tagSize.toString());
    localStorage.setItem('lastTagTransparency', transparency.toString());

    if (editMode && editTag && onTagSaved) {
      // Edit mode - update existing tag
      const updatedTag: Tag = {
        ...editTag,
        name: trimmedName,
        notes: notes || null,
        lineColor,
        fillColor,
        transparency,
        tagSize,
        // Commented out for future use - defaults to "Other" and "Legacy":
        tagType: 'Other',
        otherTagType: 'Legacy',
        // tagType,
        // tagSubtype: tagSubtype || null,
        // otherConcept: otherConcept || null,
        // otherDocumentation: otherDocumentation || null,
        // otherTagType: otherTagType || null,
      };

      updateTag(editTag.id, updatedTag);
      onTagSaved(updatedTag);
    } else {
      // Create mode - create new tag
      const newTag: Tag = {
        id: uuidv4(),
        name: trimmedName,
        notes: notes || null,
        lineColor,
        fillColor,
        transparency,
        tagSize,
        // Defaults to "Other" and "Legacy" per legacy app behavior:
        tagType: 'Other',
        otherTagType: 'Legacy',
        // Commented out for future use:
        // tagType,
        // tagSubtype: tagSubtype || null,
        // otherConcept: otherConcept || null,
        // otherDocumentation: otherDocumentation || null,
        // otherTagType: otherTagType || null,
        isExpanded: true,
      };

      createTag(newTag);
      onCreated();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && name.trim()) {
      handleSubmit();
    }
  };

  // Calculate preview circle style
  const getPreviewStyle = () => {
    // Convert transparency percentage to hex alpha (0-255 -> 00-FF)
    const alphaHex = Math.round((transparency / 100) * 255)
      .toString(16)
      .padStart(2, '0');

    return {
      width: tagSize,
      height: tagSize,
      borderRadius: '50%',
      backgroundColor: `${fillColor}${alphaHex}`,
      border: `2px solid ${lineColor}`,
      minWidth: 10,
      minHeight: 10,
      maxWidth: 50,
      maxHeight: 50,
    };
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {editMode ? 'Edit Tag' : 'Create New Tag'}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          {/* Tag Name */}
          <TextField
            autoFocus
            fullWidth
            label="Tag Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            onKeyDown={handleKeyDown}
            error={!!error}
            helperText={error}
            placeholder="Enter tag name"
          />

          {/* ================================================================
              TAG TYPE SELECTION - Commented out for future use
              To enable: uncomment the imports at the top and the state
              variables, then uncomment this block.
              ================================================================ */}
          {/*
          <FormControl fullWidth>
            <InputLabel>Tag Type</InputLabel>
            <Select
              value={tagType}
              label="Tag Type"
              onChange={(e) => {
                setTagType(e.target.value);
                setTagSubtype('');
                setOtherConcept('');
                setOtherDocumentation('');
                setOtherTagType('');
              }}
            >
              {TAG_TYPES.map((type) => (
                <MenuItem key={type.id} value={type.id}>
                  {type.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {tagType === 'Conceptual' && (
            <FormControl fullWidth>
              <InputLabel>Concept Type</InputLabel>
              <Select
                value={tagSubtype}
                label="Concept Type"
                onChange={(e) => setTagSubtype(e.target.value)}
              >
                <MenuItem value="">Select...</MenuItem>
                {CONCEPTUAL_SUBTYPES.map((type) => (
                  <MenuItem key={type.id} value={type.id}>
                    {type.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {tagType === 'Conceptual' && tagSubtype === 'Other Concept' && (
            <TextField
              fullWidth
              label="Other Concept"
              value={otherConcept}
              onChange={(e) => setOtherConcept(e.target.value)}
              placeholder="Enter concept type"
            />
          )}

          {tagType === 'Documentation' && (
            <FormControl fullWidth>
              <InputLabel>Documentation Type</InputLabel>
              <Select
                value={tagSubtype}
                label="Documentation Type"
                onChange={(e) => setTagSubtype(e.target.value)}
              >
                <MenuItem value="">Select...</MenuItem>
                {DOCUMENTATION_SUBTYPES.map((type) => (
                  <MenuItem key={type.id} value={type.id}>
                    {type.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {tagType === 'Documentation' && tagSubtype === 'Other Documentation' && (
            <TextField
              fullWidth
              label="Other Documentation"
              value={otherDocumentation}
              onChange={(e) => setOtherDocumentation(e.target.value)}
              placeholder="Enter documentation type"
            />
          )}

          {tagType === 'Other' && (
            <TextField
              fullWidth
              label="Other Tag Type"
              value={otherTagType}
              onChange={(e) => setOtherTagType(e.target.value)}
              placeholder="Enter tag type"
            />
          )}
          */}

          {/* ================================================================
              LINE COLOR PICKER - Commented out for now, defaulting to white
              To enable: uncomment this block
              ================================================================ */}
          {/*
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Line Color
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <input
                type="color"
                value={lineColor}
                onChange={(e) => setLineColor(e.target.value)}
                style={{ width: 40, height: 40, border: 'none', cursor: 'pointer' }}
              />
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {COLOR_PRESETS.map((color) => (
                  <Box
                    key={`line-${color}`}
                    onClick={() => setLineColor(color)}
                    sx={{
                      width: 24,
                      height: 24,
                      bgcolor: color,
                      border: lineColor === color ? '2px solid white' : '1px solid grey',
                      borderRadius: 0.5,
                      cursor: 'pointer',
                      '&:hover': { transform: 'scale(1.1)' },
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Box>
          */}

          {/* Fill Color */}
          <MuiColorInput
            label="Fill Color"
            value={fillColor}
            onChange={(newColor) => setFillColor(newColor)}
            format="hex"
            fullWidth
          />

          {/* Transparency Slider */}
          <Box>
            <Typography variant="body2" color="text.secondary">
              Transparency: {transparency}%
            </Typography>
            <Slider
              value={transparency}
              onChange={(_e, value) => setTransparency(value as number)}
              min={0}
              max={100}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${value}%`}
            />
          </Box>

          {/* Size Slider */}
          <Box>
            <Typography variant="body2" color="text.secondary">
              Size: {tagSize} px
            </Typography>
            <Slider
              value={tagSize}
              onChange={(_e, value) => setTagSize(value as number)}
              min={5}
              max={50}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${value}px`}
            />
          </Box>

          {/* Preview */}
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Preview
            </Typography>
            <Box
              sx={{
                width: 100,
                height: 100,
                bgcolor: 'action.hover',
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Box sx={getPreviewStyle()} />
            </Box>
          </Box>

          {/* Notes */}
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about this tag"
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!name.trim()}
        >
          {editMode ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
