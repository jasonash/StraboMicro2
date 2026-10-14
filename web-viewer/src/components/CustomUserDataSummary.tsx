/**
 * CustomUserDataSummary: the user's own spreadsheet columns (desktop: Tools >
 * Custom User Data...), view only. A spot shows "header: value" rows; a
 * micrograph shows a count and Show Custom User Data..., a table of its
 * spots (a row click selects the spot) with a CSV download. Same display
 * rules as the desktop (src/utils/customUserData.ts, shared).
 */

import { useMemo, useState } from 'react';
import {
  AccordionDetails,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloseIcon from '@mui/icons-material/Close';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import { columnsWithValues, spotEntries, spotsInOrder, tableToCsv, templateTable } from '../../../src/utils/customUserData';
import { StyledAccordion, StyledAccordionSummary } from './MetadataSummary';
import type { MicrographMetadata, ProjectMetadata, Spot } from '../types/project-types';

interface CustomUserDataSummaryProps {
  project: ProjectMetadata;
  micrograph: MicrographMetadata | null;
  spot: Spot | null;
  onSelectSpot: (spot: Spot) => void;
}

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? '' : 's'}`;
}

function downloadCsv(project: ProjectMetadata, micrograph: MicrographMetadata) {
  const csv = tableToCsv(templateTable(project, micrograph.id));
  const name = `${(project.name || '').trim()} - ${(micrograph.name || '').trim()} - Custom User Data`.replace(/[\\/:*?"<>|]+/g, '-');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CustomUserDataSummary({ project, micrograph, spot, onSelectSpot }: CustomUserDataSummaryProps) {
  const [tableOpen, setTableOpen] = useState(false);

  const entries = useMemo(() => (spot ? spotEntries(project, spot) : []), [project, spot]);
  const table = useMemo(() => {
    if (spot || !micrograph) return null;
    const spots = spotsInOrder(project, micrograph.id).map((p) => p.spot);
    const columns = columnsWithValues(project, spots);
    const rows = spots.filter((s) => columns.some((c) => (s.customUserData?.[c] ?? '') !== ''));
    return { columns, rows };
  }, [project, micrograph, spot]);

  if (spot) {
    if (entries.length === 0) return null;
    return (
      <StyledAccordion key={`spot-${spot.id}`} disableGutters defaultExpanded>
        <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Custom User Data</Typography>
          <Chip label={entries.length} size="small" />
        </StyledAccordionSummary>
        <AccordionDetails sx={{ py: 1 }}>
          <Stack spacing={0.5}>
            {entries.map(([header, value]) => (
              <Box key={header} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0, maxWidth: '50%', overflowWrap: 'anywhere' }}>
                  {header}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500, textAlign: 'right', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {value}
                </Typography>
              </Box>
            ))}
          </Stack>
        </AccordionDetails>
      </StyledAccordion>
    );
  }

  if (!micrograph || !table || table.rows.length === 0) return null;
  return (
    <>
      <StyledAccordion key={`micrograph-${micrograph.id}`} disableGutters>
        <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Custom User Data</Typography>
          <Chip label={plural(table.rows.length, 'spot')} size="small" />
        </StyledAccordionSummary>
        <AccordionDetails sx={{ py: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
            {plural(table.columns.length, 'column')} on {plural(table.rows.length, 'spot')} of this micrograph.
          </Typography>
          <Button
            size="small"
            variant="text"
            startIcon={<TableChartOutlinedIcon sx={{ fontSize: 16 }} />}
            onClick={() => setTableOpen(true)}
            sx={{ textTransform: 'none' }}
          >
            Show Custom User Data...
          </Button>
        </AccordionDetails>
      </StyledAccordion>

      <Dialog open={tableOpen} onClose={() => setTableOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ pr: 6 }}>
          Custom User Data
          <Typography variant="body2" color="text.secondary">
            {micrograph.name}: {plural(table.rows.length, 'spot')}, {plural(table.columns.length, 'column')}
          </Typography>
          <IconButton aria-label="Close" onClick={() => setTableOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Click a row to select that spot.
          </Typography>
          <TableContainer sx={{ maxHeight: '60vh' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Spot</TableCell>
                  {table.columns.map((c) => (
                    <TableCell key={c} sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{c}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {table.rows.map((s) => (
                  <TableRow key={s.id} hover onClick={() => { setTableOpen(false); onSelectSpot(s); }} sx={{ cursor: 'pointer' }}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {s.name || '(unnamed)'}
                      {s.archived && <Typography component="span" variant="caption" color="text.secondary"> (archived)</Typography>}
                    </TableCell>
                    {table.columns.map((c) => (
                      <TableCell key={c} sx={{ whiteSpace: 'pre-wrap', maxWidth: 320 }}>{s.customUserData?.[c] ?? ''}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => downloadCsv(project, micrograph)}>Download CSV</Button>
          <Button onClick={() => setTableOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
