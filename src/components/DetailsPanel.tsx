import React from 'react';
import './DetailsPanel.css';

const DetailsPanel: React.FC = () => {
  return (
    <div className="details-panel">
      <div className="panel-section">
        <h3 className="panel-title">Micrograph Metadata</h3>
        {/* Metadata content will go here */}
      </div>
      <div className="panel-section">
        <h3 className="panel-title">Spot List</h3>
        {/* Spot list will go here */}
      </div>
      <div className="panel-section">
        <h3 className="panel-title">Properties</h3>
        {/* Properties will go here */}
      </div>
    </div>
  );
};

export default DetailsPanel;
