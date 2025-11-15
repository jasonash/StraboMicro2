import React, { useState } from 'react';
import { Tabs, Tab, Box } from '@mui/material';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`sidebar-tabpanel-${index}`}
      aria-labelledby={`sidebar-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
    </div>
  );
}

const Sidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Tabs
        value={activeTab}
        onChange={handleChange}
        variant="fullWidth"
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': {
            color: 'text.primary', // Keep text white
            '&.Mui-selected': {
              color: 'text.primary', // Keep selected tab text white (not red)
            },
          },
          '& .MuiTabs-indicator': {
            backgroundColor: 'primary.main', // Keep the red bottom border indicator
          },
        }}
      >
        <Tab label="Samples" disableRipple />
        <Tab label="Groups" disableRipple />
        <Tab label="Spots" disableRipple />
        <Tab label="Tags" disableRipple />
      </Tabs>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <TabPanel value={activeTab} index={0}>
          {/* Sample tree will go here */}
        </TabPanel>
        <TabPanel value={activeTab} index={1}>
          {/* Groups list will go here */}
        </TabPanel>
        <TabPanel value={activeTab} index={2}>
          {/* Spots list will go here */}
        </TabPanel>
        <TabPanel value={activeTab} index={3}>
          {/* Tags list will go here */}
        </TabPanel>
      </Box>
    </Box>
  );
};

export default Sidebar;
