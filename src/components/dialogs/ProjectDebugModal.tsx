/**
 * Project Debug Modal
 *
 * Displays the current project structure in JSON format for debugging
 */

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Table,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import { ContentCopy as CopyIcon } from '@mui/icons-material';
import { useAppStore } from '@/store';

interface ProjectDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProjectDebugModal: React.FC<ProjectDebugModalProps> = ({ isOpen, onClose }) => {
  const project = useAppStore(state => state.project);
  const projectFilePath = useAppStore(state => state.projectFilePath);
  const isDirty = useAppStore(state => state.isDirty);

  const handleCopyToClipboard = () => {
    const jsonString = JSON.stringify(project, null, 2);
    navigator.clipboard.writeText(jsonString);
    alert('Project JSON copied to clipboard!');
  };

  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Project Structure (Debug)</DialogTitle>
      <DialogContent>
        <Table size="small" sx={{ mb: 2 }}>
          <TableBody>
            <TableRow>
              <TableCell component="th" scope="row">File Path:</TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {projectFilePath || '(unsaved)'}
                </Typography>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell component="th" scope="row">Dirty:</TableCell>
              <TableCell>
                <Typography
                  variant="body2"
                  color={isDirty ? 'warning.main' : 'success.main'}
                >
                  {isDirty ? 'Yes (unsaved changes)' : 'No'}
                </Typography>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell component="th" scope="row">Project Loaded:</TableCell>
              <TableCell>
                <Typography
                  variant="body2"
                  color={project ? 'success.main' : 'text.secondary'}
                >
                  {project ? 'Yes' : 'No'}
                </Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {project ? (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle1">Project Structure (JSON)</Typography>
              <Button
                size="small"
                startIcon={<CopyIcon />}
                onClick={handleCopyToClipboard}
              >
                Copy to Clipboard
              </Button>
            </Box>
            <Box
              component="pre"
              sx={{
                bgcolor: 'background.default',
                p: 2,
                borderRadius: 1,
                maxHeight: 400,
                overflow: 'auto',
                fontSize: 12,
                lineHeight: 1.5,
                fontFamily: 'monospace',
              }}
            >
              {JSON.stringify(project, null, 2)}
            </Box>
          </>
        ) : (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">No project currently loaded.</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
