/**
 * Tags Panel Component
 *
 * Displays the Tags tab content in the sidebar.
 * Allows users to create tags and assign spots to them.
 * Matches the legacy JavaFX FrontPageController.loadCurrentTags() functionality.
 *
 * Note: Tag type grouping (Conceptual, Documentation, etc.) is commented out
 * but preserved for future use. Currently all tags are displayed in a flat list
 * since they default to type="Other".
 */

import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Collapse,
  Menu,
  MenuItem,
  Divider,
  Link,
} from '@mui/material';
import {
  ExpandMore,
  ChevronRight,
  MoreVert,
  Delete,
  Edit,
  PersonAdd,
} from '@mui/icons-material';
import { useAppStore } from '@/store';
import { CreateTagDialog } from './dialogs/CreateTagDialog';
import { AddSpotsToTagDialog } from './dialogs/AddSpotsToTagDialog';
import type { Tag, Spot } from '@/types/project-types';

// ============================================================================
// TAG TYPE GROUPINGS (commented out for future use)
// ============================================================================

// const TAG_TYPE_ORDER = [
//   'Conceptual',
//   'Documentation',
//   'Rosetta',
//   'Experimental Apparatus',
//   'Other',
//   'No Type Specified',
// ];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all spots that have a specific tag
 */
function getSpotsWithTag(tag: Tag, spotIndex: Map<string, Spot>): Spot[] {
  const spots: Spot[] = [];
  spotIndex.forEach(spot => {
    if (spot.tags?.includes(tag.id)) {
      spots.push(spot);
    }
  });
  return spots;
}

// ============================================================================
// TAG ITEM COMPONENT
// ============================================================================

interface TagItemProps {
  tag: Tag;
  spotCount: number;
  onEdit: (tag: Tag) => void;
  onDelete: (tag: Tag) => void;
  onAssignSpots: (tag: Tag) => void;
}

function TagItem({
  tag,
  spotCount,
  onEdit,
  onDelete,
  onAssignSpots,
}: TagItemProps) {
  const setTagExpanded = useAppStore((state) => state.setTagExpanded);
  const selectMicrograph = useAppStore((state) => state.selectMicrograph);
  const selectActiveSpot = useAppStore((state) => state.selectActiveSpot);
  const spotIndex = useAppStore((state) => state.spotIndex);

  const isExpanded = tag.isExpanded ?? true;

  // Menu state
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const handleToggleExpand = () => {
    setTagExpanded(tag.id, !isExpanded);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  // Get spots that have this tag
  const taggedSpots = useMemo(() => {
    return getSpotsWithTag(tag, spotIndex);
  }, [tag, spotIndex]);

  // Handle clicking on a spot to navigate to it
  const handleSpotClick = (spot: Spot) => {
    // Find which micrograph this spot belongs to
    // We need to search through the project structure
    const project = useAppStore.getState().project;
    if (!project) return;

    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micrograph of sample.micrographs || []) {
          if (micrograph.spots?.some(s => s.id === spot.id)) {
            selectMicrograph(micrograph.id);
            selectActiveSpot(spot.id);
            return;
          }
        }
      }
    }
  };

  // Calculate preview circle style
  const getPreviewStyle = () => {
    const transparency = tag.transparency ?? 100;
    const alphaHex = Math.round((transparency / 100) * 255)
      .toString(16)
      .padStart(2, '0');
    const size = Math.min(tag.tagSize ?? 10, 16); // Cap at 16px for list display

    return {
      width: size,
      height: size,
      borderRadius: '50%',
      backgroundColor: `${tag.fillColor || '#FF0000'}${alphaHex}`,
      border: `1px solid ${tag.lineColor || '#000000'}`,
      flexShrink: 0,
    };
  };

  return (
    <Box sx={{ mb: 0.5 }}>
      {/* Tag Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          py: 0.5,
          px: 1,
          bgcolor: 'action.hover',
          borderRadius: 1,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.selected' },
        }}
        onClick={handleToggleExpand}
      >
        <IconButton size="small" sx={{ p: 0, mr: 0.5 }}>
          {isExpanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
        </IconButton>

        {/* Color preview circle */}
        <Box sx={getPreviewStyle()} />

        <Typography variant="body2" sx={{ flex: 1, ml: 1, fontWeight: 500 }}>
          {tag.name}
        </Typography>

        <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
          ({spotCount} spot{spotCount !== 1 ? 's' : ''})
        </Typography>

        <IconButton
          size="small"
          onClick={handleMenuOpen}
          sx={{ p: 0.5 }}
        >
          <MoreVert fontSize="small" />
        </IconButton>

        {/* Tag Menu */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleMenuClose}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem onClick={() => { onAssignSpots(tag); handleMenuClose(); }}>
            <PersonAdd fontSize="small" sx={{ mr: 1 }} />
            Assign Spots
          </MenuItem>
          <MenuItem onClick={() => { onEdit(tag); handleMenuClose(); }}>
            <Edit fontSize="small" sx={{ mr: 1 }} />
            Edit Tag
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => { onDelete(tag); handleMenuClose(); }}
            sx={{ color: 'error.main' }}
          >
            <Delete fontSize="small" sx={{ mr: 1 }} />
            Delete Tag
          </MenuItem>
        </Menu>
      </Box>

      {/* Tagged Spots List */}
      <Collapse in={isExpanded}>
        <Box sx={{ pl: 4, py: 0.5 }}>
          {taggedSpots.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              No spots assigned
            </Typography>
          ) : (
            taggedSpots.map(spot => (
              <Box
                key={spot.id}
                sx={{
                  py: 0.25,
                  '&:hover': { bgcolor: 'action.hover' },
                  borderRadius: 0.5,
                  px: 1,
                }}
              >
                <Link
                  component="button"
                  variant="body2"
                  onClick={() => handleSpotClick(spot)}
                  sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                >
                  {spot.name || 'Unnamed Spot'}
                </Link>
              </Box>
            ))
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

// ============================================================================
// MAIN TAGS PANEL COMPONENT
// ============================================================================

export function TagsPanel() {
  const project = useAppStore((state) => state.project);
  const deleteTag = useAppStore((state) => state.deleteTag);
  const spotIndex = useAppStore((state) => state.spotIndex);

  // Dialog states
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [showAddSpots, setShowAddSpots] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);

  // Get tags with spot counts
  const tagsWithCounts = useMemo(() => {
    const tags = project?.tags || [];
    return tags.map(tag => ({
      tag,
      spotCount: getSpotsWithTag(tag, spotIndex).length,
    }));
  }, [project?.tags, spotIndex]);

  // ========================================================================
  // TAG TYPE GROUPING (commented out for future use)
  // ========================================================================
  // const groupedTags = useMemo(() => {
  //   const groups = new Map<string, Array<{ tag: Tag; spotCount: number }>>();
  //
  //   TAG_TYPE_ORDER.forEach(type => {
  //     groups.set(type, []);
  //   });
  //
  //   tagsWithCounts.forEach(item => {
  //     const type = item.tag.tagType || 'No Type Specified';
  //     const group = groups.get(type) || groups.get('Other')!;
  //     group.push(item);
  //   });
  //
  //   // Filter out empty groups
  //   return Array.from(groups.entries()).filter(([_, items]) => items.length > 0);
  // }, [tagsWithCounts]);

  const handleCreateNewTag = () => {
    setEditingTag(null);
    setShowCreateTag(true);
  };

  const handleEditTag = (tag: Tag) => {
    setEditingTag(tag);
    setShowCreateTag(true);
  };

  const handleDeleteTag = (tag: Tag) => {
    if (window.confirm(`Are you sure you want to delete the tag "${tag.name}"?`)) {
      deleteTag(tag.id);
    }
  };

  const handleAssignSpots = (tag: Tag) => {
    setSelectedTag(tag);
    setShowAddSpots(true);
  };

  const handleTagCreated = () => {
    setShowCreateTag(false);
    setEditingTag(null);
  };

  const handleTagSaved = () => {
    setShowCreateTag(false);
    setEditingTag(null);
  };

  if (!project) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No project loaded
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header with New Tag link */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Link
          component="button"
          variant="body2"
          onClick={handleCreateNewTag}
          sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
        >
          New Tag
        </Link>
      </Box>

      {/* Tags List */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        {tagsWithCounts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No tags defined.
          </Typography>
        ) : (
          tagsWithCounts.map(({ tag, spotCount }) => (
            <TagItem
              key={tag.id}
              tag={tag}
              spotCount={spotCount}
              onEdit={handleEditTag}
              onDelete={handleDeleteTag}
              onAssignSpots={handleAssignSpots}
            />
          ))
        )}

        {/* ================================================================
            TAG TYPE GROUPING (commented out for future use)
            To enable: uncomment groupedTags useMemo above and use this instead
            ================================================================ */}
        {/*
        {groupedTags.map(([typeName, items]) => (
          <Box key={typeName} sx={{ mb: 2 }}>
            <Typography
              variant="subtitle2"
              color="text.secondary"
              sx={{ px: 1, mb: 0.5, fontWeight: 600 }}
            >
              {typeName}
            </Typography>
            {items.map(({ tag, spotCount }) => (
              <TagItem
                key={tag.id}
                tag={tag}
                spotCount={spotCount}
                onEdit={handleEditTag}
                onDelete={handleDeleteTag}
                onAssignSpots={handleAssignSpots}
              />
            ))}
          </Box>
        ))}
        */}
      </Box>

      {/* Create/Edit Tag Dialog */}
      <CreateTagDialog
        open={showCreateTag}
        onClose={() => {
          setShowCreateTag(false);
          setEditingTag(null);
        }}
        onCreated={handleTagCreated}
        editMode={editingTag !== null}
        editTag={editingTag}
        onTagSaved={handleTagSaved}
      />

      {/* Add Spots to Tag Dialog */}
      {selectedTag && (
        <AddSpotsToTagDialog
          open={showAddSpots}
          onClose={() => {
            setShowAddSpots(false);
            setSelectedTag(null);
          }}
          tag={selectedTag}
        />
      )}
    </Box>
  );
}
