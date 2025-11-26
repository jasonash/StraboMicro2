/**
 * Sortable Item Component
 *
 * A wrapper component that makes any child draggable using @dnd-kit.
 * Includes a drag handle for intuitive drag-and-drop reordering.
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Box, IconButton } from '@mui/material';
import { DragIndicator } from '@mui/icons-material';
import type { ReactNode } from 'react';

interface SortableItemProps {
  id: string;
  children: ReactNode;
  disabled?: boolean;
}

export function SortableItem({ id, children, disabled = false }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
  };

  return (
    <Box ref={setNodeRef} style={style} sx={{ display: 'flex', alignItems: 'flex-start' }}>
      {/* Drag Handle */}
      {!disabled && (
        <IconButton
          {...attributes}
          {...listeners}
          size="small"
          sx={{
            cursor: 'grab',
            p: 0.25,
            mr: 0.5,
            mt: 0.5,
            opacity: 0.5,
            '&:hover': {
              opacity: 1,
              backgroundColor: 'action.hover',
            },
            '&:active': {
              cursor: 'grabbing',
            },
          }}
          tabIndex={-1}
        >
          <DragIndicator fontSize="small" />
        </IconButton>
      )}
      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {children}
      </Box>
    </Box>
  );
}
