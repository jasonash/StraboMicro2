import React from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Box,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const DetailsPanel: React.FC = () => {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Add Data Section */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 500 }}>
          Add Data:
        </Typography>
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <Select defaultValue="" displayEmpty>
            <MenuItem value="" disabled>
              Select Data Type...
            </MenuItem>
            <MenuItem value="sem">SEM Data</MenuItem>
            <MenuItem value="ebsd">EBSD Data</MenuItem>
            <MenuItem value="optical">Optical Data</MenuItem>
          </Select>
        </FormControl>

        <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
          Existing Data:
        </Typography>
      </Box>

      {/* Scrollable Accordions */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {/* Project/Dataset Metadata */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Project/Dataset Metadata
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                <strong>Experiment/Dataset Metadata</strong>
              </Typography>
            </Box>
          </AccordionDetails>
        </Accordion>

        {/* Sample Metadata */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Sample Metadata
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                <strong>Label:</strong> Sample01/ChannelTwo
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Sample ID:</strong> Sample01/ChannelTwo
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Longitude:</strong> -67.2536271
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Latitude:</strong> 44.9980031
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Exists on Server:</strong> No
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Main Sampling Purpose:</strong> field___micro
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Sample Name:</strong> SampleChannelTwo/SamplesOne
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Rock Type:</strong> UltraMaficRock
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Instrument of Sample:</strong> 3
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Oriented Sample:</strong> yes
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Sample Description:</strong> I am Sample Start Here
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Degree of Weathering:</strong> 3
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Sample Notes:</strong> Sample Notes here
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Sample Collection Date:</strong> 7/31/2019
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Color:</strong> SampleColorWhite
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Lithology:</strong> SamplesLithologyhere
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Sample Surface Feature:</strong> SamplesLithologyhere
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Sample Orientation Notes:</strong> Sample Orientation Notes
              </Typography>
            </Box>
          </AccordionDetails>
        </Accordion>

        {/* Spot Metadata */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Spot Metadata
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="caption" color="text.secondary">
              No spot selected
            </Typography>
          </AccordionDetails>
        </Accordion>

        {/* Notes */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Notes
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="caption" color="text.secondary">
              No notes available
            </Typography>
          </AccordionDetails>
        </Accordion>

        {/* Associated Files */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Associated Files
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="caption" color="text.secondary">
              No associated files
            </Typography>
          </AccordionDetails>
        </Accordion>

        {/* Links */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Links
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="caption" color="text.secondary">
              No links
            </Typography>
          </AccordionDetails>
        </Accordion>

        {/* Tags */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Tags
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="caption" color="text.secondary">
              No tags
            </Typography>
          </AccordionDetails>
        </Accordion>
      </Box>
    </Box>
  );
};

export default DetailsPanel;
