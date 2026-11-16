/**
 * What importing a project file does to this computer's copy, shared by the
 * import flows (File > Open .smz, Open Shared Project, deep links):
 *   my synced copy here     never replaced (spec v3 11.4): open it, or import
 *                           the file as a separate copy under a new id
 *   a local-only copy here  replaced after a warning
 *   neither                 a plain import
 * A file without images for some micrographs says so first; a replace keeps
 * this computer's images of those micrographs (electron/smzImport.js).
 */

import { Alert, Button, Typography } from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';

/** True when the import needs the user's answer before it starts. */
export function importNeedsAnswer(inspect: SmzInspectResult | null): boolean {
  return Boolean(inspect?.syncedCopy || inspect?.projectExists || (inspect?.missingImages ?? 0) > 0);
}

const micrographs = (n: number) => `${n} micrograph${n === 1 ? '' : 's'}`;

/** What the file lacks, or null when it has an image for every micrograph */
export function missingImagesText(inspect: SmzInspectResult | null): {
  missing: string;
  kept: string | null;
  without: string | null;
} | null {
  const missing = inspect?.missingImages ?? 0;
  if (!inspect || missing <= 0) return null;
  const count = Math.max(inspect.micrographCount ?? missing, missing);
  const replacing = Boolean(inspect.projectExists && !inspect.syncedCopy);
  const kept = replacing ? Math.min(inspect.keptImages ?? 0, missing) : 0;
  const without = missing - kept;
  return {
    missing: missing === count
      ? `The file has no images (none of its ${micrographs(count)} has one).`
      : `The file has no image for ${missing} of its ${micrographs(count)}.`,
    kept: kept > 0
      ? `This computer's images of ${kept === missing ? 'these' : kept} ${kept === 1 ? 'micrograph' : 'micrographs'} will be kept.`
      : null,
    without: without > 0
      ? `${micrographs(without).replace(/^./, (c) => c.toUpperCase())} will open without an image${replacing ? ' (this computer has none for them either)' : ''}.`
      : null,
  };
}

function MissingImagesLines({ text }: { text: NonNullable<ReturnType<typeof missingImagesText>> }) {
  return (
    <>
      <Typography variant="body2">{text.missing}</Typography>
      {text.kept && <Typography variant="body2">{text.kept}</Typography>}
      {text.without && <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{text.without}</Typography>}
    </>
  );
}

interface ImportTargetNoticeProps {
  inspect: SmzInspectResult | null;
  /** Where the replacement comes from, e.g. "the .smz file" */
  source: string;
}

export function ImportTargetNotice({ inspect, source }: ImportTargetNoticeProps) {
  const imagesText = missingImagesText(inspect);
  if (inspect?.syncedCopy) {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
          You already have a synced copy of this project
        </Typography>
        <Typography variant="body2">
          Your synced copy stays as it is. Open it, or import {source} as a separate copy
          named "{inspect.projectName || 'Untitled Project'} (copy)".
        </Typography>
        {imagesText && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            {imagesText.missing} A separate copy opens without {inspect.missingImages === 1 ? 'that image' : 'those images'}.
          </Typography>
        )}
      </Alert>
    );
  }
  if (inspect?.projectExists) {
    return (
      <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
          This will replace your local project!
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          A project with this ID already exists on your computer. Continuing will:
        </Typography>
        <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
          <li><Typography variant="body2">
            <strong>Delete all local data</strong> for this project{imagesText?.kept ? ' (except the images below)' : ''}
          </Typography></li>
          <li><Typography variant="body2">
            <strong>Clear version history</strong> (all previous versions will be lost)
          </Typography></li>
          <li><Typography variant="body2">
            Replace it with {source}
          </Typography></li>
        </ul>
        {imagesText && <MissingImagesLines text={imagesText} />}
        <Typography variant="body2" sx={{ mt: 1 }}>
          To keep your local project, export it first (File → Export as .smz).
        </Typography>
      </Alert>
    );
  }
  if (imagesText) {
    return (
      <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
          This file is missing images
        </Typography>
        <MissingImagesLines text={imagesText} />
        <Typography variant="body2" sx={{ mt: 1 }}>
          Whoever made the file may not have had the images on their computer. Ask them for a
          copy exported with its images, or import this one anyway.
        </Typography>
      </Alert>
    );
  }
  return null;
}

interface ImportTargetActionsProps {
  inspect: SmzInspectResult | null;
  onCancel: () => void;
  /** asCopy: import under a new id, next to my synced copy */
  onImport: (asCopy: boolean) => void;
  /** Open my synced copy instead */
  onOpenMine: () => void;
  /** Label of the plain import button when nothing is replaced */
  importLabel?: string;
}

export function ImportTargetActions({ inspect, onCancel, onImport, onOpenMine, importLabel = 'Import' }: ImportTargetActionsProps) {
  if (inspect?.syncedCopy) {
    return (
      <>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="outlined" onClick={() => onImport(true)}>Import as a Separate Copy</Button>
        <Button variant="contained" onClick={onOpenMine}>Open My Copy</Button>
      </>
    );
  }
  return (
    <>
      <Button onClick={onCancel}>Cancel</Button>
      <Button
        variant="contained"
        color={inspect?.projectExists ? 'warning' : 'primary'}
        onClick={() => onImport(false)}
      >
        {inspect?.projectExists ? 'Replace & Import' : importLabel}
      </Button>
    </>
  );
}
