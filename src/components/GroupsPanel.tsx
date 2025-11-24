/**
 * Groups Panel Component
 *
 * Displays the Groups tab content in the sidebar.
 * Allows users to create groups and add micrographs to them.
 * Matches the legacy JavaFX groups functionality.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Collapse,
  Stack,
  CircularProgress,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  ExpandMore,
  ChevronRight,
  Add,
  MoreVert,
  Visibility,
  VisibilityOff,
  Image as ImageIcon,
} from '@mui/icons-material';
import { useAppStore } from '@/store';
import { CreateGroupDialog } from './dialogs/CreateGroupDialog';
import { AddMicrographsToGroupDialog } from './dialogs/AddMicrographsToGroupDialog';
import type { GroupMetadata, MicrographMetadata } from '@/types/project-types';

/**
 * Micrograph Thumbnail Component
 * Loads and displays composite thumbnail (with overlays) for a micrograph
 */
interface MicrographThumbnailProps {
  micrographId: string;
  projectId: string;
  micrographName: string;
  width?: number;
  height?: number;
}

function MicrographThumbnail({ micrographId, projectId, micrographName, width = 150, height = 100 }: MicrographThumbnailProps) {
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadThumbnail = useCallback(async () => {
    if (!window.api) return;

    setLoading(true);

    try {
      const dataUrl = await window.api.loadCompositeThumbnail(projectId, micrographId);
      setThumbnailDataUrl(dataUrl || null);
    } catch (error) {
      console.error('[GroupsPanel] Error loading thumbnail:', error);
      setThumbnailDataUrl(null);
    } finally {
      setLoading(false);
    }
  }, [micrographId, projectId]);

  useEffect(() => {
    loadThumbnail();
  }, [loadThumbnail]);

  // Listen for thumbnail generation events
  useEffect(() => {
    const handleThumbnailGenerated = (event: Event) => {
      const customEvent = event as CustomEvent<{ micrographId: string }>;
      if (customEvent.detail.micrographId === micrographId) {
        setTimeout(() => loadThumbnail(), 500);
      }
    };

    const handleRebuildAll = () => {
      setTimeout(() => loadThumbnail(), 500);
    };

    window.addEventListener('thumbnail-generated', handleThumbnailGenerated);
    window.addEventListener('rebuild-all-thumbnails', handleRebuildAll);

    return () => {
      window.removeEventListener('thumbnail-generated', handleThumbnailGenerated);
      window.removeEventListener('rebuild-all-thumbnails', handleRebuildAll);
    };
  }, [micrographId, loadThumbnail]);

  if (loading) {
    return (
      <Box
        sx={{
          width,
          height,
          bgcolor: 'action.hover',
          borderRadius: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress size={24} thickness={4} />
      </Box>
    );
  }

  if (!thumbnailDataUrl) {
    return (
      <Box
        sx={{
          width,
          height,
          bgcolor: 'action.hover',
          borderRadius: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ImageIcon fontSize="large" sx={{ color: 'text.secondary' }} />
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={thumbnailDataUrl}
      alt={micrographName}
      sx={{
        width,
        height,
        objectFit: 'cover',
        borderRadius: 1,
        cursor: 'pointer',
      }}
    />
  );
}

/**
 * Group Item Component
 * Renders a single group with its micrographs
 */
interface GroupItemProps {
  group: GroupMetadata;
  projectId: string;
  onAddMicrograph: (groupId: string) => void;
  onEditName: (groupId: string, currentName: string) => void;
  onDelete: (groupId: string) => void;
}

function GroupItem({ group, projectId, onAddMicrograph, onEditName, onDelete }: GroupItemProps) {
  const selectMicrograph = useAppStore((state) => state.selectMicrograph);
  const removeMicrographFromGroup = useAppStore((state) => state.removeMicrographFromGroup);
  const setGroupExpanded = useAppStore((state) => state.setGroupExpanded);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const micrographIndex = useAppStore((state) => state.micrographIndex);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);

  const isExpanded = group.isExpanded ?? true;

  // Menu state for group header
  const [groupMenuAnchor, setGroupMenuAnchor] = useState<null | HTMLElement>(null);

  // Menu state for individual micrographs
  const [micrographMenuAnchor, setMicrographMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedMicrographId, setSelectedMicrographId] = useState<string | null>(null);

  const handleToggleExpand = () => {
    setGroupExpanded(group.id, !isExpanded);
  };

  const handleGroupMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setGroupMenuAnchor(event.currentTarget);
  };

  const handleGroupMenuClose = () => {
    setGroupMenuAnchor(null);
  };

  const handleMicrographMenuOpen = (event: React.MouseEvent<HTMLElement>, micrographId: string) => {
    event.stopPropagation();
    setSelectedMicrographId(micrographId);
    setMicrographMenuAnchor(event.currentTarget);
  };

  const handleMicrographMenuClose = () => {
    setMicrographMenuAnchor(null);
    setSelectedMicrographId(null);
  };

  const handleRemoveMicrograph = () => {
    if (selectedMicrographId) {
      removeMicrographFromGroup(group.id, selectedMicrographId);
    }
    handleMicrographMenuClose();
  };

  const handleToggleVisibility = (micrographId: string, currentVisibility: boolean) => {
    updateMicrographMetadata(micrographId, { visible: !currentVisibility });
  };

  // Get micrograph objects from IDs
  const groupMicrographs = (group.micrographs || [])
    .map(id => micrographIndex.get(id))
    .filter((m): m is MicrographMetadata => m !== undefined);

  return (
    <Box sx={{ mb: 1 }}>
      {/* Group Header */}
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

        <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
          {group.name}
        </Typography>

        <IconButton
          size="small"
          onClick={handleGroupMenuOpen}
          sx={{ p: 0.5 }}
        >
          <MoreVert fontSize="small" />
        </IconButton>

        {/* Group Menu */}
        <Menu
          anchorEl={groupMenuAnchor}
          open={Boolean(groupMenuAnchor)}
          onClose={handleGroupMenuClose}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem onClick={() => { onAddMicrograph(group.id); handleGroupMenuClose(); }}>
            Add Micrograph to This Group
          </MenuItem>
          <MenuItem onClick={() => { onEditName(group.id, group.name); handleGroupMenuClose(); }}>
            Edit Group Name
          </MenuItem>
          <Divider />
          <MenuItem onClick={() => { onDelete(group.id); handleGroupMenuClose(); }} sx={{ color: 'error.main' }}>
            Delete This Group
          </MenuItem>
        </Menu>
      </Box>

      {/* Micrographs List */}
      <Collapse in={isExpanded}>
        <Box sx={{ pl: 2, pt: 1 }}>
          {groupMicrographs.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1, fontStyle: 'italic' }}>
              No micrographs in this group
            </Typography>
          ) : (
            <Stack spacing={1}>
              {groupMicrographs.map((micrograph) => {
                const isActive = activeMicrographId === micrograph.id;
                const isAssociated = micrograph.parentID != null;
                const isVisible = micrograph.visible !== false;

                return (
                  <Box
                    key={micrograph.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      p: 1,
                      borderRadius: 1,
                      bgcolor: isActive ? 'action.selected' : 'transparent',
                      border: isActive ? 2 : 0,
                      borderColor: 'primary.main',
                      '&:hover': { bgcolor: isActive ? 'action.selected' : 'action.hover' },
                    }}
                  >
                    {/* Thumbnail - clickable to open micrograph */}
                    <Box
                      onClick={() => selectMicrograph(micrograph.id)}
                      sx={{ cursor: 'pointer', flexShrink: 0 }}
                    >
                      <MicrographThumbnail
                        micrographId={micrograph.id}
                        projectId={projectId}
                        micrographName={micrograph.name || 'Micrograph'}
                        width={150}
                        height={100}
                      />
                    </Box>

                    {/* Buttons column */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', ml: 1, gap: 0.5 }}>
                      {/* More options menu */}
                      <IconButton
                        size="small"
                        onClick={(e) => handleMicrographMenuOpen(e, micrograph.id)}
                      >
                        <MoreVert fontSize="small" />
                      </IconButton>

                      {/* Visibility toggle - only for associated micrographs */}
                      {isAssociated && (
                        <IconButton
                          size="small"
                          onClick={() => handleToggleVisibility(micrograph.id, isVisible)}
                        >
                          {isVisible ? (
                            <Visibility fontSize="small" />
                          ) : (
                            <VisibilityOff fontSize="small" color="disabled" />
                          )}
                        </IconButton>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          )}

          {/* Micrograph Menu */}
          <Menu
            anchorEl={micrographMenuAnchor}
            open={Boolean(micrographMenuAnchor)}
            onClose={handleMicrographMenuClose}
          >
            <MenuItem onClick={handleRemoveMicrograph} sx={{ color: 'error.main' }}>
              Remove from This Group
            </MenuItem>
          </Menu>

          {/* Micrograph name below thumbnail (matching legacy layout) */}
          {groupMicrographs.map((micrograph) => (
            <Typography
              key={`name-${micrograph.id}`}
              variant="caption"
              sx={{ display: 'none' }} // Hidden - name shown via thumbnail
            >
              {micrograph.name}
            </Typography>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * Main Groups Panel Component
 */
export function GroupsPanel() {
  const project = useAppStore((state) => state.project);
  const deleteGroup = useAppStore((state) => state.deleteGroup);
  const updateGroup = useAppStore((state) => state.updateGroup);

  // Dialog states
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showAddMicrographs, setShowAddMicrographs] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');

  // Header menu state
  const [headerMenuAnchor, setHeaderMenuAnchor] = useState<null | HTMLElement>(null);

  const handleHeaderMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setHeaderMenuAnchor(event.currentTarget);
  };

  const handleHeaderMenuClose = () => {
    setHeaderMenuAnchor(null);
  };

  const handleCreateNewGroup = () => {
    setShowCreateGroup(true);
    handleHeaderMenuClose();
  };

  const handleAddMicrographsToGroup = () => {
    setSelectedGroupId(null); // Will show group selection in dialog
    setShowAddMicrographs(true);
    handleHeaderMenuClose();
  };

  const handleAddMicrographToSpecificGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    setShowAddMicrographs(true);
  };

  const handleEditGroupName = (groupId: string, currentName: string) => {
    setEditingGroupId(groupId);
    setEditingGroupName(currentName);
    setShowCreateGroup(true);
  };

  const handleDeleteGroup = (groupId: string) => {
    if (window.confirm('Are you sure you want to delete this group?')) {
      deleteGroup(groupId);
    }
  };

  const handleGroupCreated = () => {
    setShowCreateGroup(false);
    setEditingGroupId(null);
    setEditingGroupName('');
  };

  const handleGroupNameSaved = (newName: string) => {
    if (editingGroupId) {
      updateGroup(editingGroupId, { name: newName });
    }
    setShowCreateGroup(false);
    setEditingGroupId(null);
    setEditingGroupName('');
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

  const groups = project.groups || [];

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header with menu */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          New Group / Add Micrograph
        </Typography>

        <IconButton size="small" onClick={handleHeaderMenuOpen}>
          <Add fontSize="small" />
        </IconButton>

        <Menu
          anchorEl={headerMenuAnchor}
          open={Boolean(headerMenuAnchor)}
          onClose={handleHeaderMenuClose}
        >
          <MenuItem onClick={handleCreateNewGroup}>
            Create New Group
          </MenuItem>
          <MenuItem onClick={handleAddMicrographsToGroup} disabled={groups.length === 0}>
            Add Micrographs to Group(s)
          </MenuItem>
        </Menu>
      </Box>

      {/* Groups list */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        {groups.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            No groups yet. Click the + button to create one.
          </Typography>
        ) : (
          groups.map((group) => (
            <GroupItem
              key={group.id}
              group={group}
              projectId={project.id}
              onAddMicrograph={handleAddMicrographToSpecificGroup}
              onEditName={handleEditGroupName}
              onDelete={handleDeleteGroup}
            />
          ))
        )}
      </Box>

      {/* Create Group Dialog */}
      <CreateGroupDialog
        open={showCreateGroup}
        onClose={() => {
          setShowCreateGroup(false);
          setEditingGroupId(null);
          setEditingGroupName('');
        }}
        onCreated={handleGroupCreated}
        editMode={editingGroupId !== null}
        editGroupId={editingGroupId}
        initialName={editingGroupName}
        onNameSaved={handleGroupNameSaved}
      />

      {/* Add Micrographs Dialog */}
      <AddMicrographsToGroupDialog
        open={showAddMicrographs}
        onClose={() => {
          setShowAddMicrographs(false);
          setSelectedGroupId(null);
        }}
        preselectedGroupId={selectedGroupId}
      />
    </Box>
  );
}
