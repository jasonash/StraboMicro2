/**
 * Point Count Dialog
 *
 * Entry point for the Point Count feature. Handles:
 * 1. First-time entry: Grid configuration for new session
 * 2. Return entry: Continue recent session or start new
 * 3. Session picker: Choose from multiple sessions
 *
 * Point counting is separate from the Spot system - points are stored
 * in their own session files and don't pollute the spot list.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Stack,
  Slider,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Divider,
  Paper,
  LinearProgress,
  IconButton,
  TextField,
  Tooltip,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  FolderOpen as FolderIcon,
} from '@mui/icons-material';
import { useAppStore } from '@/store';
import {
  PointCountSession,
  PointCountSessionSummary,
  PointCountPoint,
  createPointCountSession,
  generateDefaultSessionName,
} from '@/types/point-count-types';
import {
  generatePoints,
  calculateGridDimensions,
  type GridType,
} from '@/services/pointCounting';
import { v4 as uuidv4 } from 'uuid';
import { GridPreviewCanvas } from './GridPreviewCanvas';

// ============================================================================
// TYPES
// ============================================================================

interface PointCountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId: string | null;
}

type DialogView = 'loading' | 'new-session' | 'return-entry' | 'session-picker';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_POINTS = 100;
const MAX_POINTS = 1000;
const DEFAULT_POINTS = 400;

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

interface SessionCardProps {
  session: PointCountSessionSummary;
  onContinue: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
  showActions?: boolean;
}

function SessionCard({ session, onContinue, onRename, onDelete, showActions = false }: SessionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(session.name);
  const progress = session.totalPoints > 0
    ? Math.round((session.classifiedCount / session.totalPoints) * 100)
    : 0;
  const isComplete = session.classifiedCount === session.totalPoints;

  const handleSaveName = () => {
    if (editName.trim() && editName !== session.name) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  };

  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        mb: 1,
        '&:hover': { borderColor: 'primary.main' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
        <Box sx={{ flex: 1 }}>
          {isEditing ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TextField
                size="small"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') setIsEditing(false);
                }}
                autoFocus
                sx={{ flex: 1 }}
              />
              <IconButton size="small" onClick={handleSaveName} color="primary">
                <CheckIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => setIsEditing(false)}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          ) : (
            <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 0.5 }}>
              {session.name}
              {isComplete && ' ✓'}
            </Typography>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {session.classifiedCount}/{session.totalPoints} classified ({progress}%)
            {' • '}
            {formatDate(session.updatedAt)}
          </Typography>

          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ height: 6, borderRadius: 1 }}
            color={isComplete ? 'success' : 'primary'}
          />
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {showActions && !isEditing && (
            <>
              <Tooltip title="Rename">
                <IconButton size="small" onClick={() => setIsEditing(true)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" onClick={onDelete} color="error">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
          <Button
            variant="contained"
            size="small"
            onClick={onContinue}
            sx={{ minWidth: 80 }}
          >
            Continue
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PointCountDialog({
  isOpen,
  onClose,
  micrographId,
}: PointCountDialogProps) {
  // Store
  const project = useAppStore((s) => s.project);
  const micrographIndex = useAppStore((s) => s.micrographIndex);
  const pointCountSessionList = useAppStore((s) => s.pointCountSessionList);
  const loadPointCountSessions = useAppStore((s) => s.loadPointCountSessions);
  const enterPointCountMode = useAppStore((s) => s.enterPointCountMode);

  // Get micrograph data
  const micrograph = micrographId ? micrographIndex.get(micrographId) : null;
  const imageWidth = micrograph?.imageWidth || micrograph?.width || 1000;
  const imageHeight = micrograph?.imageHeight || micrograph?.height || 1000;

  // Dialog state
  const [view, setView] = useState<DialogView>('loading');
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmSession, setDeleteConfirmSession] = useState<PointCountSessionSummary | null>(null);

  // New session configuration
  const [sessionName, setSessionName] = useState(generateDefaultSessionName());
  const [gridType, setGridType] = useState<GridType>('regular');
  const [pointCount, setPointCount] = useState(DEFAULT_POINTS);

  // Computed values
  const gridDimensions = useMemo(() => {
    return calculateGridDimensions(imageWidth, imageHeight, pointCount);
  }, [imageWidth, imageHeight, pointCount]);

  const actualPointCount = gridDimensions.rows * gridDimensions.cols;
  const spacing = Math.round(gridDimensions.spacingX);

  // Most recent session (for return entry view)
  const mostRecentSession = pointCountSessionList.length > 0
    ? pointCountSessionList[0]
    : null;

  // Load sessions when dialog opens
  useEffect(() => {
    if (isOpen && micrographId) {
      setIsLoading(true);
      loadPointCountSessions(micrographId).then(() => {
        setIsLoading(false);
      });
    }
  }, [isOpen, micrographId, loadPointCountSessions]);

  // Determine initial view based on sessions - runs when dialog opens and loading completes
  useEffect(() => {
    if (isOpen && !isLoading) {
      if (pointCountSessionList.length === 0) {
        setView('new-session');
      } else {
        setView('return-entry');
      }
    }
  }, [isOpen, isLoading, pointCountSessionList.length]);

  // Reset form state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSessionName(generateDefaultSessionName());
      setGridType('regular');
      setPointCount(DEFAULT_POINTS);
      setDeleteConfirmSession(null);
    }
  }, [isOpen]);

  // Handlers
  const handleCreateSession = useCallback(async () => {
    if (!micrographId || !project) return;

    // Generate grid points
    const gridPoints = generatePoints(
      gridType,
      imageWidth,
      imageHeight,
      pointCount,
      true // offsetByHalfSpacing
    );

    // Convert to PointCountPoints
    const points: PointCountPoint[] = gridPoints.map((gp) => ({
      id: uuidv4(),
      x: gp.x,
      y: gp.y,
      row: gp.row,
      col: gp.col,
    }));

    // Create session
    const session = createPointCountSession(
      micrographId,
      gridType,
      {
        rows: gridDimensions.rows,
        cols: gridDimensions.cols,
        totalPoints: points.length,
      },
      points,
      sessionName
    );

    // Save session to disk
    if (window.api?.pointCount) {
      const result = await window.api.pointCount.saveSession(project.id, session);
      if (result.success && result.session) {
        // Enter point count mode with the saved session
        enterPointCountMode(result.session as PointCountSession);
        onClose();
      } else {
        console.error('[PointCountDialog] Error saving session:', result.error);
      }
    }
  }, [
    micrographId,
    project,
    gridType,
    imageWidth,
    imageHeight,
    pointCount,
    gridDimensions,
    sessionName,
    enterPointCountMode,
    onClose,
  ]);

  const handleContinueSession = useCallback(async (sessionSummary: PointCountSessionSummary) => {
    if (!project) return;

    // Load full session data
    if (window.api?.pointCount) {
      const result = await window.api.pointCount.loadSession(project.id, sessionSummary.id);
      if (result.success && result.session) {
        enterPointCountMode(result.session as PointCountSession);
        onClose();
      } else {
        console.error('[PointCountDialog] Error loading session:', result.error);
      }
    }
  }, [project, enterPointCountMode, onClose]);

  const handleRenameSession = useCallback(async (sessionId: string, newName: string) => {
    if (!project || !micrographId) return;

    if (window.api?.pointCount) {
      await window.api.pointCount.renameSession(project.id, sessionId, newName);
      // Reload sessions to update the list
      loadPointCountSessions(micrographId);
    }
  }, [project, micrographId, loadPointCountSessions]);

  const handleDeleteSession = useCallback(async (session: PointCountSessionSummary) => {
    if (!project || !micrographId) return;

    if (window.api?.pointCount) {
      await window.api.pointCount.deleteSession(project.id, session.id);
      // Reload sessions to update the list
      await loadPointCountSessions(micrographId);
      setDeleteConfirmSession(null);

      // If no more sessions, switch to new session view
      // Note: pointCountSessionList won't be updated yet, so check after reload
    }
  }, [project, micrographId, loadPointCountSessions]);

  // Check if we should show new session view after delete
  useEffect(() => {
    if (view === 'session-picker' && pointCountSessionList.length === 0) {
      setView('new-session');
    } else if (view === 'return-entry' && pointCountSessionList.length === 0) {
      setView('new-session');
    }
  }, [view, pointCountSessionList.length]);

  // Render loading state
  if (isLoading) {
    return (
      <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Point Count</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography color="text.secondary">Loading sessions...</Typography>
          </Box>
        </DialogContent>
      </Dialog>
    );
  }

  // Render delete confirmation
  if (deleteConfirmSession) {
    return (
      <Dialog open={isOpen} onClose={() => setDeleteConfirmSession(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Point Count Session?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone.
          </Alert>
          <Typography>
            Are you sure you want to delete "{deleteConfirmSession.name}"?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {deleteConfirmSession.totalPoints} points, {deleteConfirmSession.classifiedCount} classified
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmSession(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => handleDeleteSession(deleteConfirmSession)}
          >
            Delete Session
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // Render return entry view (has existing sessions)
  if (view === 'return-entry' && mostRecentSession) {
    return (
      <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Point Count</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Micrograph: {micrograph?.name || 'Unknown'}
          </Typography>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="subtitle2" sx={{ mb: 1, textTransform: 'uppercase', color: 'text.secondary' }}>
            Continue Recent Session
          </Typography>

          <SessionCard
            session={mostRecentSession}
            onContinue={() => handleContinueSession(mostRecentSession)}
            onRename={(name) => handleRenameSession(mostRecentSession.id, name)}
            onDelete={() => setDeleteConfirmSession(mostRecentSession)}
          />

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" sx={{ mb: 1, textTransform: 'uppercase', color: 'text.secondary' }}>
            Other Options
          </Typography>

          <Stack direction="row" spacing={2}>
            <Button
              startIcon={<AddIcon />}
              onClick={() => setView('new-session')}
            >
              Start New Session
            </Button>
            {pointCountSessionList.length > 1 && (
              <Button
                startIcon={<FolderIcon />}
                onClick={() => setView('session-picker')}
              >
                Choose Other Session...
              </Button>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
        </DialogActions>
      </Dialog>
    );
  }

  // Render session picker view
  if (view === 'session-picker') {
    return (
      <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Choose Point Count Session</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Micrograph: {micrograph?.name || 'Unknown'}
          </Typography>

          <Divider sx={{ mb: 2 }} />

          <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
            {pointCountSessionList.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onContinue={() => handleContinueSession(session)}
                onRename={(name) => handleRenameSession(session.id, name)}
                onDelete={() => setDeleteConfirmSession(session)}
                showActions
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            startIcon={<AddIcon />}
            onClick={() => setView('new-session')}
          >
            Start New Session
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // Render new session view (grid configuration)
  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Point Count</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Session Name */}
          <TextField
            label="Session Name"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            fullWidth
            size="small"
          />

          <Divider />

          {/* Grid Type */}
          <FormControl component="fieldset">
            <FormLabel component="legend">Grid Type</FormLabel>
            <RadioGroup
              row
              value={gridType}
              onChange={(e) => setGridType(e.target.value as GridType)}
            >
              <FormControlLabel value="regular" control={<Radio />} label="Regular" />
              <FormControlLabel value="random" control={<Radio />} label="Random" />
              <FormControlLabel value="stratified" control={<Radio />} label="Stratified Random" />
            </RadioGroup>
          </FormControl>

          {/* Point Count Slider */}
          <Box>
            <Typography gutterBottom>
              Point Count: <strong>{actualPointCount}</strong>
            </Typography>
            <Slider
              value={pointCount}
              onChange={(_, value) => setPointCount(value as number)}
              min={MIN_POINTS}
              max={MAX_POINTS}
              step={10}
              marks={[
                { value: 100, label: '100' },
                { value: 300, label: '300' },
                { value: 500, label: '500' },
                { value: 700, label: '700' },
                { value: 1000, label: '1000' },
              ]}
            />
            <Typography variant="body2" color="text.secondary">
              Grid: {gridDimensions.rows}×{gridDimensions.cols} • {spacing}px spacing
            </Typography>
          </Box>

          {/* Grid Preview */}
          {micrographId && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                Preview
              </Typography>
              <Box sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                overflow: 'hidden',
              }}>
                <GridPreviewCanvas
                  micrographId={micrographId}
                  gridType={gridType}
                  pointCount={pointCount}
                  width={500}
                  height={375}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Scroll to zoom • Drag to pan
              </Typography>
            </Box>
          )}

          {/* Back button if coming from return entry */}
          {pointCountSessionList.length > 0 && (
            <Button
              variant="text"
              onClick={() => setView('return-entry')}
              sx={{ alignSelf: 'flex-start' }}
            >
              ← Back to Sessions
            </Button>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleCreateSession}
          disabled={!sessionName.trim()}
        >
          Generate {actualPointCount} Points
        </Button>
      </DialogActions>
    </Dialog>
  );
}
