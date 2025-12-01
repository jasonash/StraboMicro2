import React, { useState, useMemo } from 'react';
import { Tabs, Tab, Box, Typography } from '@mui/material';
import { ProjectTree } from './ProjectTree';
import { GroupsPanel } from './GroupsPanel';
import { SpotsPanel } from './SpotsPanel';
import { TagsPanel } from './TagsPanel';
import { useAppStore } from '@/store';

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
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

const Sidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const project = useAppStore((state) => state.project);

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Calculate project totals
  const projectStats = useMemo(() => {
    if (!project?.datasets) return null;

    let totalSamples = 0;
    let totalMicrographs = 0;

    for (const dataset of project.datasets) {
      const samples = dataset.samples || [];
      totalSamples += samples.length;
      for (const sample of samples) {
        const micrographs = sample.micrographs || [];
        // Build a set of all micrograph IDs in this sample
        const micrographIds = new Set(micrographs.map(m => m.id));
        // Count only micrographs that are either root (no parentID) or have a valid parent
        const validMicrographs = micrographs.filter(m =>
          !m.parentID || micrographIds.has(m.parentID)
        );
        totalMicrographs += validMicrographs.length;
      }
    }

    return { totalSamples, totalMicrographs };
  }, [project]);

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
          <ProjectTree />
        </TabPanel>
        <TabPanel value={activeTab} index={1}>
          <GroupsPanel />
        </TabPanel>
        <TabPanel value={activeTab} index={2}>
          <SpotsPanel />
        </TabPanel>
        <TabPanel value={activeTab} index={3}>
          <TagsPanel />
        </TabPanel>
      </Box>

      {/* Project Stats Footer - only shown when project is open */}
      {projectStats && (
        <Box
          sx={{
            borderTop: 1,
            borderColor: 'divider',
            px: 2,
            py: 1,
            bgcolor: 'background.paper',
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Total Samples: {projectStats.totalSamples} &nbsp;•&nbsp; Total Micrographs: {projectStats.totalMicrographs}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default Sidebar;
