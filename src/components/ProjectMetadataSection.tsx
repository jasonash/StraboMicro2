/**
 * Project Metadata Section Component
 *
 * Displays the project-level metadata in an accordion.
 * Used in the Project tab of the Properties Panel.
 */

import { useState, useEffect } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Box,
  Stack,
  styled,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import { useAppStore } from '@/store';

interface ProjectMetadataSectionProps {
  onEditProject: () => void;
}

// Styled Accordion with left border accent when expanded
const StyledAccordion = styled(Accordion)(({ theme }) => ({
  '&:before': { display: 'none' },
  borderLeft: '3px solid transparent',
  transition: 'border-color 0.2s ease',
  '&.Mui-expanded': {
    borderLeftColor: theme.palette.primary.main,
  },
}));

// Styled AccordionSummary with background tint when expanded - compact height
const StyledAccordionSummary = styled(AccordionSummary)(({ theme }) => ({
  minHeight: 32,
  padding: '0 12px',
  transition: 'background-color 0.2s ease',
  '& .MuiAccordionSummary-content': {
    alignItems: 'center',
    gap: 8,
    margin: '6px 0',
  },
  '&.Mui-expanded': {
    minHeight: 32,
  },
  '& .MuiAccordionSummary-content.Mui-expanded': {
    margin: '6px 0',
  },
  '.Mui-expanded &, &.Mui-expanded': {
    backgroundColor: theme.palette.mode === 'dark'
      ? 'rgba(228, 76, 101, 0.12)'  // Primary color with transparency for dark mode
      : 'rgba(228, 76, 101, 0.08)', // Lighter for light mode
  },
}));

export function ProjectMetadataSection({ onEditProject }: ProjectMetadataSectionProps) {
  const project = useAppStore((state) => state.project);

  // Load expansion state from localStorage
  const [expanded, setExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('projectMetadataExpanded');
    return saved ? JSON.parse(saved) : false;
  });

  // Save expansion state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('projectMetadataExpanded', JSON.stringify(expanded));
  }, [expanded]);

  const handleExpand = (_event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded);
  };

  const handleEdit = (event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent accordion from expanding/collapsing
    onEditProject();
  };

  if (!project) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', p: 2 }}>
        No project open
      </Typography>
    );
  }

  return (
    <Stack spacing={0.5}>
      {/* Project Metadata */}
      <StyledAccordion
        expanded={expanded}
        onChange={handleExpand}
        disableGutters
      >
        <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Project Metadata</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Box
            onClick={handleEdit}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              mr: 1,
              cursor: 'pointer',
              borderRadius: '50%',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <EditIcon fontSize="small" />
          </Box>
        </StyledAccordionSummary>
        <AccordionDetails sx={{ py: 1 }}>
          <Stack spacing={0.5}>
            {project?.name && (
              <Box>
                <Typography variant="caption" color="text.secondary">Name: </Typography>
                <Typography variant="body2" component="span">{project.name}</Typography>
              </Box>
            )}
            {project?.description && (
              <Box>
                <Typography variant="caption" color="text.secondary">Description: </Typography>
                <Typography variant="body2" component="span">{project.description}</Typography>
              </Box>
            )}
            {project?.purposeOfStudy && (
              <Box>
                <Typography variant="caption" color="text.secondary">Purpose of Study: </Typography>
                <Typography variant="body2" component="span">{project.purposeOfStudy}</Typography>
              </Box>
            )}
            {project?.areaOfInterest && (
              <Box>
                <Typography variant="caption" color="text.secondary">Area of Interest: </Typography>
                <Typography variant="body2" component="span">{project.areaOfInterest}</Typography>
              </Box>
            )}
            {(project?.startDate || project?.endDate) && (
              <Box>
                <Typography variant="caption" color="text.secondary">Date Range: </Typography>
                <Typography variant="body2" component="span">
                  {project?.startDate || '?'} - {project?.endDate || '?'}
                </Typography>
              </Box>
            )}
            {project?.owner && (
              <Box>
                <Typography variant="caption" color="text.secondary">Owner: </Typography>
                <Typography variant="body2" component="span">
                  {project.owner}
                  {project.ownerAffiliation && ` (${project.ownerAffiliation})`}
                </Typography>
              </Box>
            )}
            {project?.principalInvestigator && (
              <Box>
                <Typography variant="caption" color="text.secondary">Principal Investigator: </Typography>
                <Typography variant="body2" component="span">
                  {project.principalInvestigator}
                  {project.principalInvestigatorAffiliation && ` (${project.principalInvestigatorAffiliation})`}
                </Typography>
              </Box>
            )}
            {project?.otherTeamMembers && (
              <Box>
                <Typography variant="caption" color="text.secondary">Other Team Members: </Typography>
                <Typography variant="body2" component="span">{project.otherTeamMembers}</Typography>
              </Box>
            )}
            {(project?.grantNumber || project?.fundingSource) && (
              <Box>
                <Typography variant="caption" color="text.secondary">Funding: </Typography>
                <Typography variant="body2" component="span">
                  {[project.fundingSource, project.grantNumber].filter(Boolean).join(' - ')}
                </Typography>
              </Box>
            )}
            {project?.instrumentsUsed && (
              <Box>
                <Typography variant="caption" color="text.secondary">Instruments Used: </Typography>
                <Typography variant="body2" component="span">{project.instrumentsUsed}</Typography>
              </Box>
            )}
            {project?.gpsDatum && (
              <Box>
                <Typography variant="caption" color="text.secondary">GPS Datum: </Typography>
                <Typography variant="body2" component="span">{project.gpsDatum}</Typography>
              </Box>
            )}
            {project?.magneticDeclination && (
              <Box>
                <Typography variant="caption" color="text.secondary">Magnetic Declination: </Typography>
                <Typography variant="body2" component="span">{project.magneticDeclination}</Typography>
              </Box>
            )}
            {project?.notes && (
              <Box>
                <Typography variant="caption" color="text.secondary">Notes: </Typography>
                <Typography variant="body2" component="span">{project.notes}</Typography>
              </Box>
            )}
            {!project?.name && !project?.description && !project?.owner && !project?.principalInvestigator && (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No project metadata set
              </Typography>
            )}
          </Stack>
        </AccordionDetails>
      </StyledAccordion>
    </Stack>
  );
}
