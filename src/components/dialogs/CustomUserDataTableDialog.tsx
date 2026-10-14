/**
 * Custom User Data table of one micrograph (right pane > Show Custom User
 * Data...): one row per spot with values, the columns that have values here.
 * Clicking a row selects that spot. Download saves this micrograph's table;
 * Remove column and Remove all change the whole project (Owner, Editor,
 * local project), each as one undo step. Design:
 * docs/custom-user-data-design.md (8, 12, 16).
 */

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import { useAppStore, asOwnUndoStep } from '@/store';
import { usePermissions } from '@/hooks/usePermissions';
import { canEditEntity } from '@/utils/permissions';
import {
  columnsWithValues,
  removeAllCustomUserData,
  removeColumn,
  spotsInOrder,
} from '@/utils/customUserData';
import { downloadCustomUserData, type CustomUserDataFormat } from '@/services/customUserDataDownload';

interface CustomUserDataTableDialogProps {
  open: boolean;
  onClose: () => void;
  micrographId: string;
}

type Confirm = { kind: 'column'; column: string } | { kind: 'all' };

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function CustomUserDataTableDialog({ open, onClose, micrographId }: CustomUserDataTableDialogProps) {
  const project = useAppStore((s) => s.project);
  const micrographIndex = useAppStore((s) => s.micrographIndex);
  const changeCustomUserData = useAppStore((s) => s.changeCustomUserData);
  const selectActiveSpot = useAppStore((s) => s.selectActiveSpot);
  const permissions = usePermissions();

  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [downloadAnchor, setDownloadAnchor] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  const micrograph = micrographIndex.get(micrographId);
  const spots = useMemo(() => spotsInOrder(project, micrographId).map((p) => p.spot), [project, micrographId]);
  const columns = useMemo(() => columnsWithValues(project, spots), [project, spots]);
  const rows = useMemo(() => spots.filter((s) => columns.some((c) => (s.customUserData?.[c] ?? '') !== '')), [spots, columns]);
  const canRemove = !!project && canEditEntity(permissions, 'project', project.id);

  const projectCount = (column: string | null) => spotsInOrder(project).filter(({ spot }) => {
    const data = spot.customUserData;
    if (!data) return false;
    return column === null ? Object.keys(data).length > 0 : (data[column] ?? '') !== '';
  }).length;

  const handleClose = () => {
    setConfirm(null);
    setMessage(null);
    onClose();
  };

  const handleRowClick = (spotId: string) => {
    handleClose();
    void selectActiveSpot(spotId);
  };

  const handleDownload = async (format: CustomUserDataFormat) => {
    setDownloadAnchor(null);
    if (!project) return;
    setMessage(null);
    const result = await downloadCustomUserData(project, micrographId, format);
    if (result.status === 'saved') setMessage({ severity: 'success', text: `Saved ${plural(result.rows, 'row')} to ${result.filePath}.` });
    else if (result.status === 'failed') setMessage({ severity: 'error', text: `The file could not be saved: ${result.error}` });
  };

  const handleConfirm = () => {
    if (!confirm) return;
    const c = confirm;
    asOwnUndoStep(() => changeCustomUserData((p) => (c.kind === 'all' ? removeAllCustomUserData(p) : removeColumn(p, c.column))));
    setConfirm(null);
    setMessage({ severity: 'success', text: c.kind === 'all' ? 'Removed all Custom User Data.' : `Removed the column "${c.column}".` });
  };

  if (!project || !micrograph) return null;

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ pr: 6 }}>
          Custom User Data
          <Typography variant="body2" color="text.secondary">
            {micrograph.name}: {plural(rows.length, 'spot')}, {plural(columns.length, 'column')}
          </Typography>
          <IconButton aria-label="Close" onClick={handleClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No spot of this micrograph has Custom User Data. Use Tools &gt; Custom User Data... to import some.
            </Typography>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Click a row to select that spot.
              </Typography>
              <TableContainer sx={{ maxHeight: '60vh' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Spot</TableCell>
                      {columns.map((c) => (
                        <TableCell key={c} sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {c}
                            {canRemove && (
                              <Tooltip title="Remove column...">
                                <IconButton size="small" aria-label={`Remove column ${c}`} onClick={() => setConfirm({ kind: 'column', column: c })}>
                                  <DeleteOutlineIcon fontSize="inherit" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((s) => (
                      <TableRow key={s.id} hover onClick={() => handleRowClick(s.id)} sx={{ cursor: 'pointer' }}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {s.name || '(unnamed)'}
                          {s.archived && <Typography component="span" variant="caption" color="text.secondary"> (archived)</Typography>}
                        </TableCell>
                        {columns.map((c) => (
                          <TableCell key={c} sx={{ whiteSpace: 'pre-wrap', maxWidth: 320 }}>{s.customUserData?.[c] ?? ''}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
          {message && <Alert severity={message.severity} sx={{ mt: 2 }}>{message.text}</Alert>}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          <Box>
            {canRemove && projectCount(null) > 0 && (
              <Button color="error" onClick={() => setConfirm({ kind: 'all' })}>
                Remove All Custom User Data...
              </Button>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" onClick={(e) => setDownloadAnchor(e.currentTarget)}>
              Download...
            </Button>
            <Menu anchorEl={downloadAnchor} open={Boolean(downloadAnchor)} onClose={() => setDownloadAnchor(null)}>
              <MenuItem onClick={() => handleDownload('xlsx')}>Excel (.xlsx)</MenuItem>
              <MenuItem onClick={() => handleDownload('csv')}>CSV (.csv)</MenuItem>
            </Menu>
            <Button onClick={handleClose}>Close</Button>
          </Box>
        </DialogActions>
      </Dialog>

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{confirm?.kind === 'all' ? 'Remove all Custom User Data?' : `Remove the column "${confirm?.kind === 'column' ? confirm.column : ''}"?`}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirm?.kind === 'all'
              ? `Every column is removed from all ${plural(projectCount(null), 'spot')} that have Custom User Data, in the whole project.`
              : confirm?.kind === 'column'
                ? `The column is removed from the whole project: ${(() => { const n = projectCount(confirm.column); return n === 1 ? '1 spot has' : `${n} spots have`; })()} a value in it.`
                : ''}
            {' '}Edit &gt; Undo brings it back.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleConfirm}>Remove</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
