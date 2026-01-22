import React, { useState } from 'react';
import { Box, IconButton, Tooltip, Slider, Popover, Typography } from '@mui/material';
import { HexColorPicker } from 'react-colorful';
import { useAppStore, DrawingTool } from '@/store';
import './SketchToolbar.css';

/**
 * SketchToolbar - Floating toolbar for sketch drawing tools
 *
 * Positioned absolutely on the right side of the viewer canvas.
 * Contains sketch tools: Pen, Marker, Eraser, plus color picker and width slider.
 * Only visible when sketch mode is active.
 */
const SketchToolbar: React.FC = () => {
  const activeTool = useAppStore((state) => state.activeTool);
  const setActiveTool = useAppStore((state) => state.setActiveTool);
  const sketchModeActive = useAppStore((state) => state.sketchModeActive);
  const setSketchModeActive = useAppStore((state) => state.setSketchModeActive);
  const sketchStrokeColor = useAppStore((state) => state.sketchStrokeColor);
  const setSketchStrokeColor = useAppStore((state) => state.setSketchStrokeColor);
  const sketchStrokeWidth = useAppStore((state) => state.sketchStrokeWidth);
  const setSketchStrokeWidth = useAppStore((state) => state.setSketchStrokeWidth);
  const activeSketchLayerId = useAppStore((state) => state.activeSketchLayerId);

  // Color picker popover state
  const [colorAnchorEl, setColorAnchorEl] = useState<HTMLButtonElement | null>(null);
  const colorOpen = Boolean(colorAnchorEl);

  // Hide toolbar when not in sketch mode
  if (!sketchModeActive) {
    return null;
  }

  const handleExitSketch = () => {
    setSketchModeActive(false);
  };

  const handleToolClick = (tool: DrawingTool) => {
    setActiveTool(activeTool === tool ? 'sketch-pen' : tool);
  };

  const handleColorClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setColorAnchorEl(event.currentTarget);
  };

  const handleColorClose = () => {
    setColorAnchorEl(null);
  };

  const handleWidthChange = (_event: Event, newValue: number | number[]) => {
    setSketchStrokeWidth(newValue as number);
  };

  // Determine if we can draw (need an active layer)
  const canDraw = !!activeSketchLayerId;

  return (
    <Box className="sketch-toolbar">
      {/* Exit Sketch Mode */}
      <Tooltip title="Exit Sketch Mode (Esc)" placement="left">
        <IconButton
          className="toolbar-button exit-button"
          onClick={handleExitSketch}
          aria-label="Exit sketch mode"
        >
          <svg width="20" height="20" viewBox="0 0 20 20">
            <path
              d="M15 5L5 15M5 5l10 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </IconButton>
      </Tooltip>

      <Box className="toolbar-divider" />

      {/* Pen Tool */}
      <Tooltip title={canDraw ? "Pen Tool (1)" : "Create a sketch layer first"} placement="left">
        <span>
          <IconButton
            className={`toolbar-button ${activeTool === 'sketch-pen' ? 'active' : ''}`}
            onClick={() => handleToolClick('sketch-pen')}
            disabled={!canDraw}
            aria-label="Pen tool"
          >
            {/* Pencil icon */}
            <svg width="20" height="20" viewBox="0 0 20 20">
              <path
                d="M14.5 3.5l2 2L6 16l-3 1 1-3L14.5 3.5z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <line x1="12" y1="6" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </IconButton>
        </span>
      </Tooltip>

      {/* Marker Tool */}
      <Tooltip title={canDraw ? "Marker Tool (2)" : "Create a sketch layer first"} placement="left">
        <span>
          <IconButton
            className={`toolbar-button ${activeTool === 'sketch-marker' ? 'active' : ''}`}
            onClick={() => handleToolClick('sketch-marker')}
            disabled={!canDraw}
            aria-label="Marker tool"
          >
            {/* Highlighter icon */}
            <svg width="20" height="20" viewBox="0 0 20 20">
              <rect
                x="5"
                y="3"
                width="6"
                height="12"
                rx="1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                transform="rotate(30 8 9)"
              />
              <path
                d="M6 15l2 3 2-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
                transform="rotate(30 8 16)"
              />
            </svg>
          </IconButton>
        </span>
      </Tooltip>

      {/* Eraser Tool */}
      <Tooltip title={canDraw ? "Eraser Tool (3)" : "Create a sketch layer first"} placement="left">
        <span>
          <IconButton
            className={`toolbar-button ${activeTool === 'sketch-eraser' ? 'active' : ''}`}
            onClick={() => handleToolClick('sketch-eraser')}
            disabled={!canDraw}
            aria-label="Eraser tool"
          >
            {/* Eraser icon */}
            <svg width="20" height="20" viewBox="0 0 20 20">
              <path
                d="M8 16h8M5.5 13.5l7-7 4 4-5 5H7l-1.5-2z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d="M10.5 8.5l4 4"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </IconButton>
        </span>
      </Tooltip>

      <Box className="toolbar-divider" />

      {/* Color Picker */}
      <Tooltip title="Stroke Color" placement="left">
        <IconButton
          className="toolbar-button color-button"
          onClick={handleColorClick}
          aria-label="Stroke color"
          disabled={!canDraw}
        >
          <Box
            className="color-swatch"
            sx={{ backgroundColor: sketchStrokeColor }}
          />
        </IconButton>
      </Tooltip>

      <Popover
        open={colorOpen}
        anchorEl={colorAnchorEl}
        onClose={handleColorClose}
        anchorOrigin={{
          vertical: 'center',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'center',
          horizontal: 'right',
        }}
        sx={{ marginRight: 1 }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="caption" sx={{ mb: 1, display: 'block', color: 'text.secondary' }}>
            Stroke Color
          </Typography>
          <HexColorPicker color={sketchStrokeColor} onChange={setSketchStrokeColor} />
        </Box>
      </Popover>

      {/* Stroke Width Slider */}
      <Box className="width-slider-container">
        <Tooltip title={`Stroke Width: ${sketchStrokeWidth}px`} placement="left">
          <Box sx={{ width: '100%', px: 0.5 }}>
            <Slider
              value={sketchStrokeWidth}
              onChange={handleWidthChange}
              min={1}
              max={50}
              size="small"
              disabled={!canDraw}
              sx={{
                color: 'var(--accent)',
                '& .MuiSlider-thumb': {
                  width: 12,
                  height: 12,
                },
              }}
            />
          </Box>
        </Tooltip>
        {/* Width preview */}
        <Box className="width-preview">
          <Box
            className="width-preview-circle"
            sx={{
              width: Math.min(sketchStrokeWidth, 20),
              height: Math.min(sketchStrokeWidth, 20),
              backgroundColor: sketchStrokeColor,
            }}
          />
        </Box>
      </Box>

      {/* No layer warning */}
      {!canDraw && (
        <Box className="no-layer-warning">
          <Typography variant="caption" sx={{ color: 'warning.main', textAlign: 'center' }}>
            Create a sketch layer to start drawing
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default SketchToolbar;
