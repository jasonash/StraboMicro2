/**
 * "What's new: sync" (collaboration spec v3 16aq): shown once per computer,
 * at the first launch after the update when logged in, else at the first
 * login after it. Lists the local-only projects StraboSpot does not have
 * yet, unchecked, with one mode for all. [Sync Selected] uploads them one
 * at a time in the background (closed ones through the main-process queue,
 * 16ay; the open one through the normal turn-on path). [Not now] never
 * returns; each project's status chip offers sync afterwards.
 */

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  List,
  ListItem,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { formatBytes } from '@/utils/formatBytes';

export interface SyncIntroProject {
  id: string;
  name: string;
  bytes: number | null;
}

interface SyncIntroDialogProps {
  /** null = closed */
  projects: SyncIntroProject[] | null;
  openProjectId: string | null;
  onSyncSelected: (projectIds: string[], mode: SyncMode) => void;
  onNotNow: () => void;
}

export function SyncIntroDialog({ projects, openProjectId, onSyncSelected, onNotNow }: SyncIntroDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<SyncMode>('automatic');

  useEffect(() => {
    if (projects) {
      setSelected(new Set());
      setMode('automatic');
    }
  }, [projects]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const total = (projects ?? []).filter((p) => selected.has(p.id)).reduce((sum, p) => sum + (p.bytes ?? 0), 0);

  return (
    <Dialog open={projects !== null} onClose={onNotNow} maxWidth="sm" fullWidth>
      <DialogTitle>What's new: sync</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2">
            Projects can now sync with StraboSpot: a backup of each project, the same project on your
            other computers, and sharing with collaborators later. Pick the projects on this computer
            you want to sync.
          </Typography>

          <List dense disablePadding sx={{ maxHeight: 280, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
            {(projects ?? []).map((p) => (
              <ListItem key={p.id} disablePadding sx={{ px: 1 }}>
                <FormControlLabel
                  sx={{ flex: 1, mr: 0 }}
                  control={<Checkbox size="small" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, width: '100%' }}>
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {p.name}
                        {p.id === openProjectId && (
                          <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}> (open now)</Typography>
                        )}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                        {p.bytes !== null ? formatBytes(p.bytes) : ''}
                      </Typography>
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>

          <RadioGroup value={mode} onChange={(e) => setMode(e.target.value === 'manual' ? 'manual' : 'automatic')}>
            <FormControlLabel
              value="automatic"
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography variant="body2">Sync automatically</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Changes go up about a second after you finish an edit.
                  </Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start', '& .MuiRadio-root': { pt: 0.25 } }}
            />
            <FormControlLabel
              value="manual"
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography variant="body2">Sync when I click</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    After the first upload, nothing leaves this computer until you click Sync Now.
                  </Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start', mt: 0.5, '& .MuiRadio-root': { pt: 0.25 } }}
            />
          </RadioGroup>

          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {selected.size > 0
              ? `About ${formatBytes(total)} to upload, one project at a time in the background. You can keep working.`
              : 'Projects you leave unchecked stay on this computer only. You can sync any of them later from the "Local only" status at the top of the window.'}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onNotNow}>Not now</Button>
        <Button
          variant="contained"
          disabled={selected.size === 0}
          onClick={() => onSyncSelected([...selected], mode)}
        >
          Sync Selected
        </Button>
      </DialogActions>
    </Dialog>
  );
}
