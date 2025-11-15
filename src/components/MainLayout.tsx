import React, { useState, useRef } from 'react';
import { Box } from '@mui/material';
import Header from './Header';
import Sidebar from './Sidebar';
import Viewer from './Viewer';
import DetailsPanel from './DetailsPanel';

const MainLayout: React.FC = () => {
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(280);
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
      if (newWidth >= 250 && newWidth <= 500) {
        setLeftWidth(newWidth);
      }
    } else if (isResizingRight.current) {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 250 && newWidth <= 600) {
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
            width: `${rightWidth}px`,
            position: 'relative',
            borderLeft: 1,
            borderColor: 'divider',
            overflow: 'auto',
            bgcolor: 'background.paper',
          }}
        >
          {/* Resize handle */}
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
              },
            }}
          />
          <DetailsPanel />
        </Box>
      </Box>
    </Box>
  );
};

export default MainLayout;
