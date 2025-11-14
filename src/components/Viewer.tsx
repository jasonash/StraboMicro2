import React from 'react';
import './Viewer.css';

const Viewer: React.FC = () => {
  return (
    <div className="viewer">
      <div className="canvas-area">
        {/* Canvas will go here */}
      </div>
      <div className="status-bar">
        <span>Scale: 10μm/px</span>
        <span>|</span>
        <span>Zoom: 100%</span>
      </div>
    </div>
  );
};

export default Viewer;
