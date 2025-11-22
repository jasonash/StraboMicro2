/**
 * Generic List Manager Component
 *
 * Reusable component for managing arrays of items with add/edit/delete functionality.
 * Used by all "Info" dialogs (FractureInfo, FabricInfo, VeinInfo, etc.)
 *
 * Pattern from legacy JavaFX:
 * - Top: List of existing items with Edit/Delete buttons
 * - Middle: Separator + "Add [Type]" form
 * - Bottom: Notes textarea + Cancel/Save buttons
 */

import { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Divider,
  TextField,
  Stack,
  IconButton,
  Paper,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';

export interface ListManagerProps<T> {
  // Data
  items: T[];
  notes: string;

  // Callbacks for state changes
  onItemsChange?: (items: T[]) => void;
  onNotesChange?: (notes: string) => void;

  // Legacy callbacks (still supported but optional)
  onSave?: (data: { items: T[]; notes: string }) => void;
  onCancel?: () => void;

  // Render props for custom UI
  renderItem: (item: T, index: number) => React.ReactNode;
  renderAddForm: (props: {
    onAdd: (item: T) => void;
    onCancel?: () => void;
  }) => React.ReactNode;

  // Optional customization
  title?: string;
  addSectionTitle?: string;
  emptyMessage?: string;
  notesLabel?: string;
  hideButtons?: boolean; // New: Hide cancel/save buttons when using DialogActions in parent
}

export function ListManager<T>({
  items: initialItems,
  notes: initialNotes,
  onItemsChange,
  onNotesChange,
  onSave,
  onCancel,
  renderItem,
  renderAddForm,
  title = 'Items',
  addSectionTitle = 'Add New Item',
  emptyMessage = 'No items added yet.',
  notesLabel = 'Notes',
  hideButtons = false,
}: ListManagerProps<T>) {
  const [items, setItems] = useState<T[]>(initialItems);
  const [notes, setNotes] = useState(initialNotes);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleAdd = (newItem: T) => {
    const newItems = [...items, newItem];
    setItems(newItems);
    onItemsChange?.(newItems);
  };

  const handleEdit = (index: number, updatedItem: T) => {
    const newItems = [...items];
    newItems[index] = updatedItem;
    setItems(newItems);
    setEditingIndex(null);
    onItemsChange?.(newItems);
  };

  const handleDelete = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    onItemsChange?.(newItems);
  };

  const handleNotesChange = (newNotes: string) => {
    setNotes(newNotes);
    onNotesChange?.(newNotes);
  };

  const handleSave = () => {
    onSave?.({ items, notes });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* List Section */}
      <Box sx={{
        flex: '1 1 auto',
        minHeight: '200px',
        maxHeight: items.length > 0 ? `${Math.min(items.length * 120 + 100, 400)}px` : '200px',
        overflowY: 'auto',
        mb: 2
      }}>
        <Typography variant="h6" sx={{ mb: 2, fontSize: '1.1rem', fontWeight: 600 }}>
          {title}:
        </Typography>

        {items.length === 0 ? (
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              textAlign: 'center',
              bgcolor: 'action.hover',
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              {emptyMessage}
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={1}>
            {items.map((item, index) => (
              <Paper
                key={index}
                variant="outlined"
                sx={{
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                }}
              >
                {/* Item content (rendered by parent) */}
                <Box sx={{ flex: 1 }}>{renderItem(item, index)}</Box>

                {/* Action buttons */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <IconButton
                    size="small"
                    onClick={() => setEditingIndex(index)}
                    title="Edit"
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleDelete(index)}
                    title="Delete"
                    color="error"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Paper>
            ))}
          </Stack>
        )}
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Add Form Section */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
          {addSectionTitle}:
        </Typography>
        {editingIndex !== null ? (
          // Edit mode: render form with existing item
          renderAddForm({
            onAdd: (updatedItem) => handleEdit(editingIndex, updatedItem),
            onCancel: () => setEditingIndex(null),
          })
        ) : (
          // Add mode: render form for new item
          renderAddForm({
            onAdd: handleAdd,
          })
        )}
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Notes Section */}
      <Box sx={{ mb: hideButtons ? 0 : 2 }}>
        <TextField
          fullWidth
          multiline
          rows={3}
          label={notesLabel}
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="General notes about all items..."
        />
      </Box>

      {/* Action Buttons - Only show if not hidden */}
      {!hideButtons && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 2 }}>
          <Button onClick={onCancel} variant="outlined">
            Cancel
          </Button>
          <Button onClick={handleSave} variant="contained">
            Save
          </Button>
        </Box>
      )}
    </Box>
  );
}
