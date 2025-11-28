import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
  CircularProgress,
  Alert,
  Chip,
  Paper,
  TextField,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HistoryIcon from '@mui/icons-material/History';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import EditIcon from '@mui/icons-material/Edit';
import RestoreIcon from '@mui/icons-material/Restore';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAppStore } from '@/store';
import { ConfirmDialog } from './ConfirmDialog';

interface VersionHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

// Format file size in human-readable format
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format relative time
function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

// Format full timestamp
function formatFullTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Get change summary string
function getChangeSummary(stats: VersionEntry['changeStats']): string {
  const parts: string[] = [];

  const added =
    stats.datasetsAdded +
    stats.samplesAdded +
    stats.micrographsAdded +
    stats.spotsAdded;
  const removed =
    stats.datasetsRemoved +
    stats.samplesRemoved +
    stats.micrographsRemoved +
    stats.spotsRemoved;

  if (added > 0) parts.push(`+${added}`);
  if (removed > 0) parts.push(`-${removed}`);

  return parts.join(', ') || 'No changes';
}

export function VersionHistoryDialog({
  open,
  onClose,
  projectId,
}: VersionHistoryDialogProps) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [comparisonVersion, setComparisonVersion] = useState<number | null>(null);
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showNamedVersionDialog, setShowNamedVersionDialog] = useState(false);
  const [namedVersionName, setNamedVersionName] = useState('');
  const [namedVersionDescription, setNamedVersionDescription] = useState('');

  const project = useAppStore((state) => state.project);
  const loadProject = useAppStore((state) => state.loadProject);

  // Load versions when dialog opens
  const loadVersions = useCallback(async () => {
    if (!projectId || !open) return;

    setIsLoading(true);
    setError(null);

    try {
      const versionList = await window.api?.versionHistory?.list(projectId);
      setVersions(versionList || []);

      // Auto-select the most recent version
      if (versionList && versionList.length > 0) {
        setSelectedVersion(versionList[0].version);
        // Set comparison to previous version if exists
        if (versionList.length > 1) {
          setComparisonVersion(versionList[1].version);
        }
      }
    } catch (err) {
      console.error('Failed to load versions:', err);
      setError('Failed to load version history');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, open]);

  useEffect(() => {
    if (open) {
      loadVersions();
    } else {
      // Reset state when dialog closes
      setVersions([]);
      setSelectedVersion(null);
      setComparisonVersion(null);
      setDiff(null);
      setError(null);
    }
  }, [open, loadVersions]);

  // Compute diff when versions change
  useEffect(() => {
    const computeDiff = async () => {
      if (!projectId || selectedVersion === null || comparisonVersion === null) {
        setDiff(null);
        return;
      }

      // Determine which is older/newer
      const versionA = Math.min(selectedVersion, comparisonVersion);
      const versionB = Math.max(selectedVersion, comparisonVersion);

      if (versionA === versionB) {
        setDiff(null);
        return;
      }

      setIsDiffLoading(true);
      try {
        const result = await window.api?.versionHistory?.diff(
          projectId,
          versionA,
          versionB
        );
        if (result?.success && result.diff) {
          setDiff(result.diff);
        } else {
          setDiff(null);
        }
      } catch (err) {
        console.error('Failed to compute diff:', err);
        setDiff(null);
      } finally {
        setIsDiffLoading(false);
      }
    };

    computeDiff();
  }, [projectId, selectedVersion, comparisonVersion]);

  // Handle restore
  const handleRestore = async () => {
    if (!projectId || selectedVersion === null) return;

    setShowRestoreConfirm(false);
    setIsRestoring(true);
    setError(null);

    // Store the version to restore before any operations
    const versionToRestore = selectedVersion;
    console.log('[VersionHistory] Starting restore to version:', versionToRestore);

    try {
      // First create a backup of current state
      if (project) {
        console.log('[VersionHistory] Creating backup...');
        const backupResult = await window.api?.versionHistory?.create(
          projectId,
          project,
          'Before restore',
          `Backup before restoring to version ${versionToRestore}`
        );
        console.log('[VersionHistory] Backup result:', backupResult);
      }

      // Now restore the originally selected version
      console.log('[VersionHistory] Restoring version:', versionToRestore);
      const result = await window.api?.versionHistory?.restore(
        projectId,
        versionToRestore
      );
      console.log('[VersionHistory] Restore result:', result);

      if (result?.success && result.project) {
        // Load the restored project into the app
        console.log('[VersionHistory] Loading restored project into store');
        loadProject(result.project, null);
        onClose();
      } else {
        const errorMsg = result?.error || 'Failed to restore version';
        console.error('[VersionHistory] Restore failed:', errorMsg);
        setError(errorMsg);
      }
    } catch (err) {
      console.error('[VersionHistory] Exception during restore:', err);
      setError('Failed to restore version: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsRestoring(false);
    }
  };

  // Handle delete version
  const handleDeleteVersion = async () => {
    if (!projectId || selectedVersion === null) return;

    setShowDeleteConfirm(false);

    try {
      const result = await window.api?.versionHistory?.delete(
        projectId,
        selectedVersion
      );

      if (result?.success) {
        // Reload versions
        await loadVersions();
      } else {
        setError(result?.error || 'Failed to delete version');
      }
    } catch (err) {
      console.error('Failed to delete version:', err);
      setError('Failed to delete version');
    }
  };

  // Handle create named version
  const handleCreateNamedVersion = async () => {
    if (!projectId || !project || !namedVersionName.trim()) return;

    setShowNamedVersionDialog(false);

    try {
      const result = await window.api?.versionHistory?.createNamed(
        projectId,
        project,
        namedVersionName.trim(),
        namedVersionDescription.trim() || null
      );

      if (result?.success) {
        setNamedVersionName('');
        setNamedVersionDescription('');
        await loadVersions();
      } else {
        setError(result?.error || 'Failed to create named version');
      }
    } catch (err) {
      console.error('Failed to create named version:', err);
      setError('Failed to create named version');
    }
  };

  // Get selected version info
  const selectedVersionInfo = versions.find((v) => v.version === selectedVersion);

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { height: '80vh', maxHeight: 700 },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pb: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon />
            <Typography variant="h6">Version History</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<BookmarkIcon />}
              onClick={() => setShowNamedVersionDialog(true)}
              disabled={!project}
            >
              Create Named Version
            </Button>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <Divider />

        <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden' }}>
          {/* Left Panel - Timeline */}
          <Box
            sx={{
              width: 300,
              borderRight: 1,
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2" color="text.secondary">
                {versions.length} version{versions.length !== 1 ? 's' : ''}
              </Typography>
            </Box>

            {isLoading ? (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  flex: 1,
                }}
              >
                <CircularProgress size={32} />
              </Box>
            ) : versions.length === 0 ? (
              <Box sx={{ p: 2, textAlign: 'center' }}>
                <Typography color="text.secondary">
                  No versions saved yet.
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Save your project (Cmd+S) to create a version.
                </Typography>
              </Box>
            ) : (
              <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
                {versions.map((version, index) => (
                  <ListItem key={`${version.version}-${version.timestamp}`} disablePadding>
                    <ListItemButton
                      selected={selectedVersion === version.version}
                      onClick={() => {
                        // When selecting a version, set comparison to the previous one
                        setSelectedVersion(version.version);
                        const nextVersion = versions[index + 1];
                        if (nextVersion) {
                          setComparisonVersion(nextVersion.version);
                        } else {
                          setComparisonVersion(null);
                        }
                      }}
                      sx={{ py: 1.5, px: 2 }}
                    >
                      <ListItemText
                        primary={
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            {version.name ? (
                              <Chip
                                icon={<BookmarkIcon />}
                                label={version.name}
                                size="small"
                                color="primary"
                                variant="outlined"
                              />
                            ) : (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                Auto-save
                              </Typography>
                            )}
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Tooltip title={formatFullTime(version.timestamp)}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                component="span"
                              >
                                {formatRelativeTime(version.timestamp)}
                              </Typography>
                            </Tooltip>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ ml: 1 }}
                            >
                              {getChangeSummary(version.changeStats)}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>

          {/* Center Panel - Diff Preview */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2" color="text.secondary">
                Changes
                {comparisonVersion !== null &&
                  selectedVersion !== null &&
                  ` (v${Math.min(comparisonVersion, selectedVersion)} → v${Math.max(comparisonVersion, selectedVersion)})`}
              </Typography>
            </Box>

            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              {isDiffLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : diff === null ? (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  {selectedVersion !== null && comparisonVersion === null
                    ? 'This is the oldest version'
                    : 'Select a version to see changes'}
                </Typography>
              ) : diff.changes.length === 0 ? (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No changes between these versions
                </Typography>
              ) : (
                <Box>
                  {/* Summary */}
                  <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
                    {diff.summary.added > 0 && (
                      <Chip
                        icon={<AddIcon />}
                        label={`${diff.summary.added} added`}
                        size="small"
                        color="success"
                        variant="outlined"
                      />
                    )}
                    {diff.summary.removed > 0 && (
                      <Chip
                        icon={<RemoveIcon />}
                        label={`${diff.summary.removed} removed`}
                        size="small"
                        color="error"
                        variant="outlined"
                      />
                    )}
                    {diff.summary.modified > 0 && (
                      <Chip
                        icon={<EditIcon />}
                        label={`${diff.summary.modified} modified`}
                        size="small"
                        color="warning"
                        variant="outlined"
                      />
                    )}
                  </Box>

                  {/* Changes list */}
                  <List dense>
                    {/* Added items */}
                    {diff.changes
                      .filter((c) => c.type === 'added')
                      .map((change, i) => (
                        <ListItem key={`added-${i}`} sx={{ py: 0.5 }}>
                          <AddIcon
                            sx={{ color: 'success.main', mr: 1, fontSize: 18 }}
                          />
                          <ListItemText
                            primary={
                              <Typography variant="body2">
                                <strong>{change.entityType}</strong>:{' '}
                                {change.entityName}
                              </Typography>
                            }
                            secondary={change.parentPath}
                          />
                        </ListItem>
                      ))}

                    {/* Removed items */}
                    {diff.changes
                      .filter((c) => c.type === 'removed')
                      .map((change, i) => (
                        <ListItem key={`removed-${i}`} sx={{ py: 0.5 }}>
                          <RemoveIcon
                            sx={{ color: 'error.main', mr: 1, fontSize: 18 }}
                          />
                          <ListItemText
                            primary={
                              <Typography variant="body2">
                                <strong>{change.entityType}</strong>:{' '}
                                {change.entityName}
                              </Typography>
                            }
                            secondary={change.parentPath}
                          />
                        </ListItem>
                      ))}

                    {/* Modified items */}
                    {diff.changes
                      .filter((c) => c.type === 'modified')
                      .map((change, i) => (
                        <ListItem key={`modified-${i}`} sx={{ py: 0.5 }}>
                          <EditIcon
                            sx={{ color: 'warning.main', mr: 1, fontSize: 18 }}
                          />
                          <ListItemText
                            primary={
                              <Typography variant="body2">
                                <strong>{change.entityType}</strong>:{' '}
                                {change.entityName}
                              </Typography>
                            }
                            secondary={change.parentPath}
                          />
                        </ListItem>
                      ))}
                  </List>
                </Box>
              )}
            </Box>
          </Box>

          {/* Right Panel - Details */}
          <Box
            sx={{
              width: 280,
              borderLeft: 1,
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2" color="text.secondary">
                Version Details
              </Typography>
            </Box>

            {selectedVersionInfo ? (
              <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                {/* Version info */}
                <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                  {selectedVersionInfo.name && (
                    <Typography variant="h6" gutterBottom>
                      {selectedVersionInfo.name}
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    {formatFullTime(selectedVersionInfo.timestamp)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Version #{selectedVersionInfo.version}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Size: {formatBytes(selectedVersionInfo.sizeBytes)}
                  </Typography>
                  {selectedVersionInfo.description && (
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      {selectedVersionInfo.description}
                    </Typography>
                  )}
                </Paper>

                {/* Change stats */}
                <Typography variant="subtitle2" gutterBottom>
                  Changes in this version
                </Typography>
                <Box sx={{ mb: 2 }}>
                  {selectedVersionInfo.changeStats.datasetsAdded > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      +{selectedVersionInfo.changeStats.datasetsAdded} datasets
                    </Typography>
                  )}
                  {selectedVersionInfo.changeStats.datasetsRemoved > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      -{selectedVersionInfo.changeStats.datasetsRemoved} datasets
                    </Typography>
                  )}
                  {selectedVersionInfo.changeStats.samplesAdded > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      +{selectedVersionInfo.changeStats.samplesAdded} samples
                    </Typography>
                  )}
                  {selectedVersionInfo.changeStats.samplesRemoved > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      -{selectedVersionInfo.changeStats.samplesRemoved} samples
                    </Typography>
                  )}
                  {selectedVersionInfo.changeStats.micrographsAdded > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      +{selectedVersionInfo.changeStats.micrographsAdded}{' '}
                      micrographs
                    </Typography>
                  )}
                  {selectedVersionInfo.changeStats.micrographsRemoved > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      -{selectedVersionInfo.changeStats.micrographsRemoved}{' '}
                      micrographs
                    </Typography>
                  )}
                  {selectedVersionInfo.changeStats.spotsAdded > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      +{selectedVersionInfo.changeStats.spotsAdded} spots
                    </Typography>
                  )}
                  {selectedVersionInfo.changeStats.spotsRemoved > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      -{selectedVersionInfo.changeStats.spotsRemoved} spots
                    </Typography>
                  )}
                  {getChangeSummary(selectedVersionInfo.changeStats) ===
                    'No changes' && (
                    <Typography variant="body2" color="text.secondary">
                      No structural changes
                    </Typography>
                  )}
                </Box>

                {/* Actions */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Button
                    variant="contained"
                    startIcon={<RestoreIcon />}
                    onClick={() => setShowRestoreConfirm(true)}
                    disabled={isRestoring || versions[0]?.version === selectedVersion}
                    fullWidth
                  >
                    {isRestoring ? 'Restoring...' : 'Restore This Version'}
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={versions.length <= 1}
                    fullWidth
                    size="small"
                  >
                    Delete Version
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box sx={{ p: 2, textAlign: 'center' }}>
                <Typography color="text.secondary">
                  Select a version to see details
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>

        {error && (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        )}
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <ConfirmDialog
        open={showRestoreConfirm}
        title="Restore to Previous Version?"
        message={`You are about to restore to ${selectedVersionInfo?.name || formatRelativeTime(selectedVersionInfo?.timestamp || '')}. This will replace your current project state. A backup of your current state will be created first.`}
        confirmLabel="Restore"
        confirmColor="warning"
        onConfirm={handleRestore}
        onCancel={() => setShowRestoreConfirm(false)}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Version?"
        message={`Are you sure you want to delete version ${selectedVersionInfo?.name || '#' + selectedVersion}? This cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDeleteVersion}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Create Named Version Dialog */}
      <Dialog
        open={showNamedVersionDialog}
        onClose={() => setShowNamedVersionDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create Named Version</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Named versions are permanent checkpoints that won&apos;t be automatically
            pruned.
          </Typography>
          <TextField
            label="Version Name"
            value={namedVersionName}
            onChange={(e) => setNamedVersionName(e.target.value)}
            fullWidth
            required
            placeholder="e.g., Before cleanup, Final review"
            sx={{ mb: 2 }}
          />
          <TextField
            label="Description (optional)"
            value={namedVersionDescription}
            onChange={(e) => setNamedVersionDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="Optional notes about this version"
          />
        </DialogContent>
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button onClick={() => setShowNamedVersionDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateNamedVersion}
            disabled={!namedVersionName.trim()}
          >
            Create
          </Button>
        </Box>
      </Dialog>
    </>
  );
}
