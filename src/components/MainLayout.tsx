import React, { useState, useRef } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import Header from './Header';
import Sidebar from './Sidebar';
import Viewer from './Viewer';
import { PropertiesPanel } from './PropertiesPanel';

const MainLayout: React.FC = () => {
  const [leftWidth, setLeftWidth] = useState(360);
  const [rightWidth, setRightWidth] = useState(360);

  // Load collapse states from localStorage
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(() => {
    const saved = localStorage.getItem('leftPanelCollapsed');
    return saved ? JSON.parse(saved) : false;
  });
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(() => {
    const saved = localStorage.getItem('rightPanelCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);
  const rafIdLeft = useRef<number | null>(null);
  const rafIdRight = useRef<number | null>(null);
  const [isTransitionEnabled, setIsTransitionEnabled] = React.useState(true);

  const handleMouseDown = (side: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault();
    setIsTransitionEnabled(false); // Disable transition during resize
    if (side === 'left') {
      isResizingLeft.current = true;
    } else {
      isResizingRight.current = true;
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isResizingLeft.current) {
      if (rafIdLeft.current !== null) return; // Skip if already scheduled
      rafIdLeft.current = requestAnimationFrame(() => {
        const newWidth = e.clientX;
        if (newWidth >= 360 && newWidth <= 500) {
          setLeftWidth(newWidth);
        }
        rafIdLeft.current = null;
      });
    } else if (isResizingRight.current) {
      if (rafIdRight.current !== null) return; // Skip if already scheduled
      rafIdRight.current = requestAnimationFrame(() => {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth >= 360 && newWidth <= 600) {
          setRightWidth(newWidth);
        }
        rafIdRight.current = null;
      });
    }
  };

  const handleMouseUp = () => {
    isResizingLeft.current = false;
    isResizingRight.current = false;
    setIsTransitionEnabled(true); // Re-enable transition after resize
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // Cancel any pending RAF
    if (rafIdLeft.current !== null) {
      cancelAnimationFrame(rafIdLeft.current);
      rafIdLeft.current = null;
    }
    if (rafIdRight.current !== null) {
      cancelAnimationFrame(rafIdRight.current);
      rafIdRight.current = null;
    }
  };

  // Save collapse states to localStorage whenever they change
  React.useEffect(() => {
    localStorage.setItem('leftPanelCollapsed', JSON.stringify(isLeftPanelCollapsed));
  }, [isLeftPanelCollapsed]);

  React.useEffect(() => {
    localStorage.setItem('rightPanelCollapsed', JSON.stringify(isRightPanelCollapsed));
  }, [isRightPanelCollapsed]);

  React.useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header />
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Floating toggle button when left panel is collapsed */}
        {isLeftPanelCollapsed && (
          <Tooltip title="Show Panel" placement="right">
            <IconButton
              onClick={() => setIsLeftPanelCollapsed(false)}
              sx={{
                position: 'absolute',
                left: 8,
                top: 72, // Below header
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
              <ChevronRight fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Left Sidebar */}
        <Box
          sx={{
            width: isLeftPanelCollapsed ? '0px' : `${leftWidth}px`,
            position: 'relative',
            borderRight: isLeftPanelCollapsed ? 0 : 1,
            borderColor: 'divider',
            overflow: isLeftPanelCollapsed ? 'hidden' : 'hidden',
            overflowY: isLeftPanelCollapsed ? 'hidden' : 'auto',
            bgcolor: 'background.paper',
            transition: isTransitionEnabled ? 'width 0.3s ease-in-out' : 'none',
          }}
        >
          <Sidebar />

          {/* Resize handle with integrated collapse button - only show when not collapsed */}
          {!isLeftPanelCollapsed && (
            <Box
              sx={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: '4px',
              }}
            >
              {/* Resize handle (lower part) */}
              <Box
                onMouseDown={handleMouseDown('left')}
                sx={{
                  position: 'absolute',
                  right: 0,
                  top: 60,
                  bottom: 0,
                  width: '4px',
                  cursor: 'col-resize',
                  '&:hover': {
                    bgcolor: 'primary.main',
                    width: '2px',
                  },
                }}
              />

              {/* Vertical collapse button on divider */}
              <Tooltip title="Hide Panel" placement="right">
                <Box
                  onClick={() => setIsLeftPanelCollapsed(true)}
                  sx={{
                    position: 'absolute',
                    right: '-4px',
                    top: 8,
                    width: '12px',
                    height: '40px',
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
                  <ChevronLeft sx={{ fontSize: 14, color: 'text.secondary' }} />
                </Box>
              </Tooltip>
            </Box>
          )}
        </Box>

        {/* Center Viewer */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Viewer />
        </Box>

        {/* Right Details Panel */}
        <Box
          sx={{
            width: isRightPanelCollapsed ? '0px' : `${rightWidth}px`,
            position: 'relative',
            borderLeft: isRightPanelCollapsed ? 0 : 1,
            borderColor: 'divider',
            overflow: isRightPanelCollapsed ? 'hidden' : 'hidden',
            overflowY: isRightPanelCollapsed ? 'hidden' : 'auto',
            bgcolor: 'background.paper',
            transition: isTransitionEnabled ? 'width 0.3s ease-in-out' : 'none',
          }}
        >
          {/* Resize handle with integrated collapse button - only show when not collapsed */}
          {!isRightPanelCollapsed && (
            <Box
              sx={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: '4px',
              }}
            >
              {/* Resize handle (lower part) */}
              <Box
                onMouseDown={handleMouseDown('right')}
                sx={{
                  position: 'absolute',
                  left: 0,
                  top: 60,
                  bottom: 0,
                  width: '4px',
                  cursor: 'col-resize',
                  '&:hover': {
                    bgcolor: 'primary.main',
                    width: '2px',
                  },
                }}
              />

              {/* Vertical collapse button on divider */}
              <Tooltip title="Hide Panel" placement="left">
                <Box
                  onClick={() => setIsRightPanelCollapsed(true)}
                  sx={{
                    position: 'absolute',
                    left: '-4px',
                    top: 8,
                    width: '12px',
                    height: '40px',
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
                  <ChevronRight sx={{ fontSize: 14, color: 'text.secondary' }} />
                </Box>
              </Tooltip>
            </Box>
          )}

          <PropertiesPanel />
        </Box>

        {/* Floating toggle button when panel is collapsed */}
        {isRightPanelCollapsed && (
          <Tooltip title="Show Panel" placement="left">
            <IconButton
              onClick={() => setIsRightPanelCollapsed(false)}
              sx={{
                position: 'absolute',
                right: 8,
                top: 72, // Below header
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
              <ChevronLeft fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};

export default MainLayout;
