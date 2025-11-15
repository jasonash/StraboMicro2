import React, { useState, useRef } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import Header from './Header';
import Sidebar from './Sidebar';
import Viewer from './Viewer';
import DetailsPanel from './DetailsPanel';

const MainLayout: React.FC = () => {
  const [leftWidth, setLeftWidth] = useState(360);
  const [rightWidth, setRightWidth] = useState(360);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);

  const handleMouseDown = (side: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault();
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
      const newWidth = e.clientX;
      if (newWidth >= 360 && newWidth <= 500) {
        setLeftWidth(newWidth);
      }
    } else if (isResizingRight.current) {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 360 && newWidth <= 600) {
        setRightWidth(newWidth);
      }
    }
  };

  const handleMouseUp = () => {
    isResizingLeft.current = false;
    isResizingRight.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

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
        {/* Left Sidebar */}
        <Box
          sx={{
            width: `${leftWidth}px`,
            position: 'relative',
            borderRight: 1,
            borderColor: 'divider',
            overflow: 'auto',
            bgcolor: 'background.paper',
          }}
        >
          <Sidebar />
          {/* Resize handle */}
          <Box
            onMouseDown={handleMouseDown('left')}
            sx={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: '4px',
              cursor: 'col-resize',
              '&:hover': {
                bgcolor: 'primary.main',
                width: '2px',
              },
            }}
          />
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
            overflow: isRightPanelCollapsed ? 'hidden' : 'auto',
            bgcolor: 'background.paper',
            transition: 'width 0.3s ease-in-out',
          }}
        >
          {/* Resize handle - only show when not collapsed */}
          {!isRightPanelCollapsed && (
            <Box
              onMouseDown={handleMouseDown('right')}
              sx={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: '4px',
                cursor: 'col-resize',
                '&:hover': {
                  bgcolor: 'primary.main',
                  width: '2px',
                },
              }}
            />
          )}

          {/* Collapse/Expand button - on the left edge of panel */}
          {!isRightPanelCollapsed && (
            <Tooltip title="Hide Panel" placement="left">
              <IconButton
                onClick={() => setIsRightPanelCollapsed(true)}
                sx={{
                  position: 'absolute',
                  left: 8,
                  top: 8,
                  zIndex: 10,
                  bgcolor: 'background.default',
                  '&:hover': {
                    bgcolor: 'background.paper',
                  },
                }}
                size="small"
              >
                <ChevronRight fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          <DetailsPanel />
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
