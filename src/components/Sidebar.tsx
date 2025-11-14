import React, { useState } from 'react';
import './Sidebar.css';

const Sidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('samples');

  const tabs = [
    { id: 'samples', label: 'Samples' },
    { id: 'groups', label: 'Groups' },
    { id: 'spots', label: 'Spots' },
    { id: 'tags', label: 'Tags' },
  ];

  return (
    <div className="sidebar">
      <div className="tab-bar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tab-content">
        {activeTab === 'samples' && (
          <div className="tab-panel">
            {/* Sample tree will go here */}
          </div>
        )}
        {activeTab === 'groups' && (
          <div className="tab-panel">
            {/* Groups list will go here */}
          </div>
        )}
        {activeTab === 'spots' && (
          <div className="tab-panel">
            {/* Spots list will go here */}
          </div>
        )}
        {activeTab === 'tags' && (
          <div className="tab-panel">
            {/* Tags list will go here */}
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
