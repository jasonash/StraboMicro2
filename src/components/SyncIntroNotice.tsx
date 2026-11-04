/**
 * Background first uploads picked in the intro dialog (collaboration spec
 * v3 16ay): a bottom-left notice, "Uploading to StraboSpot: Basalt (2 of 5),
 * 34%", that lists the queue when clicked. It says so when the queue waits
 * for a connection, the server, or an open project to close; waiting for a
 * login shows nothing (the logout prompt said it continues at the next login).
 * The queue itself runs in main (electron/sync/introQueue.js).
 */

import { useEffect, useState } from 'react';
import { Box, List, ListItem, Popover, Snackbar, SnackbarContent, Typography } from '@mui/material';
import { useSyncStore, decisionsNoticeVisible } from '@/store/useSyncStore';
import { uploadPercent } from '@/utils/syncChipState';

function noticeText(s: SyncIntroStatus, percent: number | null): string | null {
  if (s.queued === 0) return null;
  const left = `${s.queued} ${s.queued === 1 ? 'project' : 'projects'} left`;
  if (s.current) {
    const position = s.total > 1 ? ` (${s.done + 1} of ${s.total})` : '';
    return `Uploading to StraboSpot: ${s.current.name}${position}${percent !== null ? `, ${percent}%` : ''}`;
  }
  switch (s.waiting) {
    case 'offline': return `Uploads to StraboSpot wait for a connection (${left})`;
    case 'server': return `Uploads to StraboSpot wait for the server (${left})`;
    case 'open': return s.items.length === 1
      ? `${s.items[0].name} uploads to StraboSpot when you close it`
      : `Uploads to StraboSpot continue when you close the open project (${left})`;
    default: return null;
  }
}

export function SyncIntroNotice() {
  const [status, setStatus] = useState<SyncIntroStatus | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const raised = useSyncStore(decisionsNoticeVisible);

  useEffect(() => {
    const api = window.api;
    if (!api) return;
    void api.sync.introStatus().then(setStatus).catch(() => null);
    return api.sync.onIntroStatus((s) => {
      setStatus(s);
      if (!s.current) setPercent(null);
    });
  }, []);

  const currentId = status?.current?.projectId ?? null;
  useEffect(() => {
    setPercent(null);
    if (!currentId || !window.api) return;
    return window.api.sync.onProgress((p) => {
      if (p.projectId === currentId) setPercent(uploadPercent(p));
    });
  }, [currentId]);

  const text = status ? noticeText(status, percent) : null;
  if (!status || !text) return null;

  return (
    <>
      <Snackbar
        open
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        // Above the decisions notice when it shows (same corner)
        sx={raised ? { bottom: { xs: 96, sm: 96 } } : undefined}
      >
        <SnackbarContent
          message={text}
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ cursor: 'pointer' }}
        />
      </Snackbar>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, minWidth: 260, maxWidth: 360 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Uploading to StraboSpot</Typography>
          <List dense disablePadding>
            {status.items.map((item) => (
              <ListItem key={item.projectId} disablePadding>
                <Typography variant="body2" sx={{ fontWeight: item.projectId === currentId ? 500 : 400 }}>
                  {item.name}
                  {item.projectId === currentId ? (percent !== null ? ` (${percent}%)` : ' (uploading)') : ''}
                </Typography>
              </ListItem>
            ))}
          </List>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
            {status.done > 0 ? `${status.done} of ${status.total} done. ` : ''}
            One project at a time; you can keep working. Opening one hands its upload to that project.
          </Typography>
        </Box>
      </Popover>
    </>
  );
}
