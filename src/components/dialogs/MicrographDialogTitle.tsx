/**
 * Dialog title that shows which micrograph the dialog is working on: name and
 * thumbnail on the right, as in New Micrograph, and "(2 of 4)" while a by-hand
 * run goes through several (Jason, 2026-10-30).
 */

import { useEffect, useState } from 'react';
import { Box, DialogTitle, Typography } from '@mui/material';
import { useAppStore } from '@/store';
import { findMicrographById } from '@/store/helpers';

export interface ByHandProgress {
  position: number;
  total: number;
}

interface MicrographDialogTitleProps {
  title: string;
  micrographId: string;
  progress?: ByHandProgress;
}

export function MicrographDialogTitle({ title, micrographId, progress }: MicrographDialogTitleProps) {
  const project = useAppStore((state) => state.project);
  const projectId = project?.id;
  const name = findMicrographById(project, micrographId)?.name;
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let stale = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const dataUrl = await window.api?.loadCompositeThumbnail(projectId, micrographId);
        if (!stale && dataUrl) setThumbnailUrl(dataUrl);
      } catch (error) {
        console.error('[MicrographDialogTitle] Error loading thumbnail:', error);
      }
    };
    // A just imported micrograph's thumbnail may still be being made; same delay as the tree
    const handleGenerated = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.micrographId === micrographId) {
        clearTimeout(retry);
        retry = setTimeout(load, 500);
      }
    };
    load();
    window.addEventListener('thumbnail-generated', handleGenerated);
    return () => {
      stale = true;
      clearTimeout(retry);
      window.removeEventListener('thumbnail-generated', handleGenerated);
    };
  }, [projectId, micrographId]);

  return (
    <DialogTitle>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{progress && progress.total > 1 ? `${title} (${progress.position} of ${progress.total})` : title}</span>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 2 }}>
          {name && (
            <Typography
              component="span"
              variant="body2"
              data-testid="dialog-micrograph-name"
              sx={{
                color: 'text.secondary',
                maxWidth: 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </Typography>
          )}
          {thumbnailUrl && (
            <Box
              component="img"
              src={thumbnailUrl}
              alt=""
              data-testid="dialog-micrograph-thumbnail"
              sx={{
                width: 48,
                height: 48,
                objectFit: 'cover',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
              }}
            />
          )}
        </Box>
      </Box>
    </DialogTitle>
  );
}
