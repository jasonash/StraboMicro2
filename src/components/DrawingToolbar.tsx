import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import './DrawingToolbar.css';

/**
 * DrawingToolbar - Floating vertical toolbar for drawing tools
 *
 * Positioned absolutely on the right side of the viewer canvas.
 * Contains three drawing tools: Point, Line, and Polygon.
 */
const DrawingToolbar: React.FC = () => {
  const handlePointClick = () => {
    console.log('Point tool selected');
  };

  const handleLineClick = () => {
    console.log('Line tool selected');
  };

  const handlePolygonClick = () => {
    console.log('Polygon tool selected');
  };

  return (
    <Box className="drawing-toolbar">
      <Tooltip title="Point Tool" placement="left">
        <IconButton
          className="toolbar-button"
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

      <Tooltip title="Line Tool" placement="left">
        <IconButton
          className="toolbar-button"
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

      <Tooltip title="Polygon Tool" placement="left">
        <IconButton
          className="toolbar-button"
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
    </Box>
  );
};

export default DrawingToolbar;
