import React from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import Viewer from './Viewer';
import DetailsPanel from './DetailsPanel';
import './MainLayout.css';

const MainLayout: React.FC = () => {
  return (
    <div className="main-layout">
      <Header />
      <div className="content">
        <Sidebar />
        <Viewer />
        <DetailsPanel />
      </div>
    </div>
  );
};

export default MainLayout;
