import React, { useState, useRef, useEffect } from 'react';
import { Box, Typography, Divider, IconButton, Tooltip } from '@mui/material';
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

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingBottom.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isResizingBottom.current) {
      const viewerElement = document.querySelector('.viewer-container');
      if (viewerElement) {
        const viewerRect = viewerElement.getBoundingClientRect();
        const newHeight = viewerRect.bottom - e.clientY; // Status bar is now above, not subtracted
        if (newHeight >= 150 && newHeight <= 500) {
          setBottomHeight(newHeight);
        }
      }
    }
  };

  const handleMouseUp = () => {
    isResizingBottom.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
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
          transition: 'height 0.3s ease-in-out',
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
