import React, { useState, useRef } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import Viewer from './Viewer';
import DetailsPanel from './DetailsPanel';
import './MainLayout.css';

const MainLayout: React.FC = () => {
  const [leftWidth, setLeftWidth] = useState(250);
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
      if (newWidth >= 200 && newWidth <= 500) {
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
    <div className="main-layout">
      <Header />
      <div className="content">
        <div className="sidebar-container" style={{ width: `${leftWidth}px` }}>
          <Sidebar />
          <div
            className="resize-handle resize-handle-right"
            onMouseDown={handleMouseDown('left')}
          />
        </div>
        <Viewer />
        <div className="details-container" style={{ width: `${rightWidth}px` }}>
          <div
            className="resize-handle resize-handle-left"
            onMouseDown={handleMouseDown('right')}
          />
          <DetailsPanel />
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
