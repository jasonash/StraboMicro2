import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Straighten as RulerIcon } from '@mui/icons-material';
import { useAppStore } from '@/store';
import { useToolbarDock } from '@/hooks/useToolbarDock';
import './DrawingToolbar.css';

/**
 * DrawingToolbar - Floating toolbar for drawing tools
 *
 * Dockable to any edge of the viewer canvas (right/bottom/left/top).
 * Contains drawing tools: Point, Line, Polygon, Lasso, Sketch, and Measure.
 * Hidden when in point count mode or sketch mode.
 */
const DrawingToolbar: React.FC = () => {
  const activeTool = useAppStore((state) => state.activeTool);
  const setActiveTool = useAppStore((state) => state.setActiveTool);
  const pointCountMode = useAppStore((state) => state.pointCountMode);
  const spotLassoToolActive = useAppStore((state) => state.spotLassoToolActive);
  const setSpotLassoToolActive = useAppStore((state) => state.setSpotLassoToolActive);
  const sketchModeActive = useAppStore((state) => state.sketchModeActive);
  const setSketchModeActive = useAppStore((state) => state.setSketchModeActive);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);

  const { isHorizontal, positionStyle, tooltipPlacement, cycleDock } = useToolbarDock();

  // Hide toolbar when in point count mode or sketch mode
  if (pointCountMode || sketchModeActive) {
    return null;
  }

  const handlePointClick = () => {
    setActiveTool(activeTool === 'point' ? null : 'point');
  };

  const handleLineClick = () => {
    setActiveTool(activeTool === 'line' ? null : 'line');
  };

  const handlePolygonClick = () => {
    setActiveTool(activeTool === 'polygon' ? null : 'polygon');
  };

  const handleLassoClick = () => {
    // Toggle lasso tool - deactivate any drawing tool first
    if (spotLassoToolActive) {
      setSpotLassoToolActive(false);
    } else {
      setActiveTool(null); // Deactivate drawing tools
      setSpotLassoToolActive(true);
    }
  };

  const handleSketchClick = () => {
    // Enter sketch mode
    setSketchModeActive(true);
  };

  const handleMeasureClick = () => {
    setActiveTool(activeTool === 'measure' ? null : 'measure');
  };

  const orientationClass = isHorizontal ? 'dock-horizontal' : 'dock-vertical';

  const dividerSx = isHorizontal
    ? { width: '1px', height: '28px', bgcolor: 'var(--text-muted)', mx: 1 }
    : { height: '2px', bgcolor: 'var(--text-muted)', mx: 1, my: 1 };

  return (
    <Box className={`drawing-toolbar ${orientationClass}`} style={positionStyle}>
      <Tooltip title="Point Spot" placement={tooltipPlacement}>
        <IconButton
          className={`toolbar-button ${activeTool === 'point' ? 'active' : ''}`}
          onClick={handlePointClick}
          aria-label="Point tool"
        >
          {/* Point icon - simple circle */}
          <svg width="20" height="20" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="4" fill="currentColor" />
            <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </IconButton>
      </Tooltip>

      <Tooltip title="Line Spot" placement={tooltipPlacement}>
        <IconButton
          className={`toolbar-button ${activeTool === 'line' ? 'active' : ''}`}
          onClick={handleLineClick}
          aria-label="Line tool"
        >
          {/* Line icon - diagonal line */}
          <svg width="20" height="20" viewBox="0 0 20 20">
            <line x1="4" y1="16" x2="16" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="4" cy="16" r="2" fill="currentColor" />
            <circle cx="16" cy="4" r="2" fill="currentColor" />
          </svg>
        </IconButton>
      </Tooltip>

      <Tooltip title="Polygon Spot" placement={tooltipPlacement}>
        <IconButton
          className={`toolbar-button ${activeTool === 'polygon' ? 'active' : ''}`}
          onClick={handlePolygonClick}
          aria-label="Polygon tool"
        >
          {/* Polygon icon - rectangle/pentagon shape */}
          <svg width="20" height="20" viewBox="0 0 20 20">
            <polygon
              points="10,3 17,7 15,15 5,15 3,7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="10" cy="3" r="1.5" fill="currentColor" />
            <circle cx="17" cy="7" r="1.5" fill="currentColor" />
            <circle cx="15" cy="15" r="1.5" fill="currentColor" />
            <circle cx="5" cy="15" r="1.5" fill="currentColor" />
            <circle cx="3" cy="7" r="1.5" fill="currentColor" />
          </svg>
        </IconButton>
      </Tooltip>

      {/* Divider */}
      <Box sx={dividerSx} />

      <Tooltip title="Lasso Select (Shift+Drag)" placement={tooltipPlacement}>
        <IconButton
          className={`toolbar-button ${spotLassoToolActive ? 'active' : ''}`}
          onClick={handleLassoClick}
          aria-label="Lasso select tool"
        >
          {/* Lasso icon - freeform loop */}
          <svg width="20" height="20" viewBox="0 0 20 20">
            <path
              d="M4 10 C4 5, 10 3, 14 6 C18 9, 17 14, 12 15 C8 16, 5 14, 4 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="3 2"
            />
            <circle cx="4" cy="10" r="2" fill="currentColor" />
          </svg>
        </IconButton>
      </Tooltip>

      {/* Sketch Mode */}
      <Tooltip title={activeMicrographId ? "Sketch Mode (S)" : "Select a micrograph first"} placement={tooltipPlacement}>
        <span>
          <IconButton
            className="toolbar-button"
            onClick={handleSketchClick}
            disabled={!activeMicrographId}
            aria-label="Sketch mode"
          >
            {/* Sketch/brush icon */}
            <svg width="20" height="20" viewBox="0 0 20 20">
              <path
                d="M3 17c2-2 4-3 6-3s3.5 1.5 4.5 2.5c1-1 2-3 2-5 0-4-3-8-7-9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="8" cy="4" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title="Measure Distance" placement={tooltipPlacement}>
        <IconButton
          className={`toolbar-button ${activeTool === 'measure' ? 'active' : ''}`}
          onClick={handleMeasureClick}
          aria-label="Measure tool"
        >
          <RulerIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>

      {/* Divider before dock button */}
      <Box sx={dividerSx} />

      {/* Dock cycle button */}
      <Tooltip title="Move Toolbar" placement={tooltipPlacement}>
        <IconButton
          className="dock-button"
          onClick={cycleDock}
          aria-label="Cycle toolbar position"
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path
              d="M8 1v14M1 8h14M8 1l-2.5 2.5M8 1l2.5 2.5M8 15l-2.5-2.5M8 15l2.5-2.5M1 8l2.5-2.5M1 8l2.5 2.5M15 8l-2.5-2.5M15 8l-2.5 2.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default DrawingToolbar;
