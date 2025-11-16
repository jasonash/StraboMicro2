import React, { useState, useRef, useEffect } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import DrawingToolbar from './DrawingToolbar';
import BottomPanel from './BottomPanel';

const Viewer: React.FC = () => {
  const [bottomHeight, setBottomHeight] = useState(200);

  // Load collapse state from localStorage
  const [isBottomPanelCollapsed, setIsBottomPanelCollapsed] = useState(() => {
    const saved = localStorage.getItem('bottomPanelCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  const isResizingBottom = useRef(false);
  const viewerBottomRef = useRef<number>(0);
  const rafIdBottom = useRef<number | null>(null);
  const [isTransitionEnabled, setIsTransitionEnabled] = useState(true);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsTransitionEnabled(false); // Disable transition during resize
    isResizingBottom.current = true;

    // Cache the viewer bottom position once at start of resize
    const viewerElement = document.querySelector('.viewer-container');
    if (viewerElement) {
      const viewerRect = viewerElement.getBoundingClientRect();
      viewerBottomRef.current = viewerRect.bottom;
    }

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isResizingBottom.current) {
      if (rafIdBottom.current !== null) return; // Skip if already scheduled
      rafIdBottom.current = requestAnimationFrame(() => {
        const newHeight = viewerBottomRef.current - e.clientY;
        // Allow bottom panel to be up to 75% of viewer height
        // viewerBottomRef.current is the bottom of the viewer, so 75% would be 0.75 * viewer height
        const viewerElement = document.querySelector('.viewer-container');
        const maxHeight = viewerElement
          ? viewerElement.getBoundingClientRect().height * 0.75
          : 500;

        if (newHeight >= 150 && newHeight <= maxHeight) {
          setBottomHeight(newHeight);
        }
        rafIdBottom.current = null;
      });
    }
  };

  const handleMouseUp = () => {
    isResizingBottom.current = false;
    setIsTransitionEnabled(true); // Re-enable transition after resize
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // Cancel any pending RAF
    if (rafIdBottom.current !== null) {
      cancelAnimationFrame(rafIdBottom.current);
      rafIdBottom.current = null;
    }
  };

  // Save collapse state to localStorage
  useEffect(() => {
    localStorage.setItem('bottomPanelCollapsed', JSON.stringify(isBottomPanelCollapsed));
  }, [isBottomPanelCollapsed]);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <Box
      className="viewer-container"
      sx={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {/* Canvas area */}
      <Box sx={{ flex: 1, bgcolor: 'background.default', position: 'relative' }}>
        {/* Canvas will go here */}
        <DrawingToolbar />

        {/* Floating toggle button when bottom panel is collapsed */}
        {isBottomPanelCollapsed && (
          <Tooltip title="Show Panel" placement="top">
            <IconButton
              onClick={() => setIsBottomPanelCollapsed(false)}
              sx={{
                position: 'absolute',
                left: 8,
                bottom: 8, // 8px from bottom of canvas
                zIndex: 10,
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
                '&:hover': {
                  bgcolor: 'background.default',
                },
              }}
              size="small"
            >
              <KeyboardArrowUp fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Status bar */}
      <Box
        sx={{
          height: 32,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 2,
          flexShrink: 0,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          X: 0.000 cm Y: 0.000 cm
        </Typography>
      </Box>

      {/* Bottom Panel */}
      <Box
        sx={{
          height: isBottomPanelCollapsed ? '0px' : `${bottomHeight}px`,
          position: 'relative',
          borderTop: isBottomPanelCollapsed ? 0 : 1,
          borderColor: 'divider',
          overflow: isBottomPanelCollapsed ? 'hidden' : 'visible',
          bgcolor: 'background.paper',
          transition: isTransitionEnabled ? 'height 0.3s ease-in-out' : 'none',
        }}
      >
        {/* Resize handle with integrated collapse button - only show when not collapsed */}
        {!isBottomPanelCollapsed && (
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: '4px',
            }}
          >
            {/* Resize handle */}
            <Box
              onMouseDown={handleMouseDown}
              sx={{
                position: 'absolute',
                left: 60,
                right: 0,
                top: 0,
                height: '4px',
                cursor: 'row-resize',
                '&:hover': {
                  bgcolor: 'primary.main',
                  height: '2px',
                },
              }}
            />

            {/* Horizontal collapse button on divider */}
            <Tooltip title="Hide Panel" placement="top">
              <Box
                onClick={() => setIsBottomPanelCollapsed(true)}
                sx={{
                  position: 'absolute',
                  left: 8,
                  top: '-4px',
                  width: '40px',
                  height: '12px',
                  bgcolor: 'background.paper',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.2s, border-color 0.2s',
                  '&:hover': {
                    bgcolor: 'background.default',
                    borderColor: 'primary.main',
                  },
                }}
              >
                <KeyboardArrowDown sx={{ fontSize: 14, color: 'text.secondary' }} />
              </Box>
            </Tooltip>
          </Box>
        )}

        <BottomPanel />
      </Box>
    </Box>
  );
};

export default Viewer;
