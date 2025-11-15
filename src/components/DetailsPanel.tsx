import React from 'react';
import { Accordion, AccordionSummary, AccordionDetails, Typography, Box } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const DetailsPanel: React.FC = () => {
  return (
    <Box sx={{ p: 2 }}>
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Micrograph Metadata</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {/* Metadata content will go here */}
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Spot List</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {/* Spot list will go here */}
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Properties</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {/* Properties will go here */}
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export default DetailsPanel;
