/**
 * Custom User Data Dialog (Tools > Custom User Data...)
 *
 * Download the template (which also carries the current values) for the
 * whole project or the selected micrograph, as .xlsx or .csv, and import a
 * filled one: the file is checked first (src/utils/customUserData.ts) and
 * the user reviews what changes before it is applied as one undo step.
 * Design: docs/custom-user-data-design.md.
 */

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  Link,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { useAppStore, asOwnUndoStep } from '@/store';
import { usePermissions } from '@/hooks/usePermissions';
import { canEditEntity } from '@/utils/permissions';
import {
  applyImport,
  checkImport,
  hasCustomUserData,
  importChangesSomething,
  INSTRUCTION_SECTIONS,
  orderedColumns,
  spotsInOrder,
  type ImportPlan,
} from '@/utils/customUserData';
import { downloadCustomUserData, type CustomUserDataFormat } from '@/services/customUserDataDownload';

interface CustomUserDataDialogProps {
  open: boolean;
  onClose: () => void;
}

type Scope = 'project' | 'micrograph';
type Format = CustomUserDataFormat;

/** At most this many rows are listed per warning */
const LIST_LIMIT = 10;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function RowList({ items }: { items: string[] }) {
  return (
    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
      {items.slice(0, LIST_LIMIT).map((t) => (
        <li key={t}><Typography variant="body2">{t}</Typography></li>
      ))}
      {items.length > LIST_LIMIT && (
        <li><Typography variant="body2">... and {items.length - LIST_LIMIT} more</Typography></li>
      )}
    </Box>
  );
}

export function CustomUserDataDialog({ open, onClose }: CustomUserDataDialogProps) {
  const project = useAppStore((s) => s.project);
  const activeMicrographId = useAppStore((s) => s.activeMicrographId);
  const changeCustomUserData = useAppStore((s) => s.changeCustomUserData);
  const permissions = usePermissions();

  const [scope, setScope] = useState<Scope>('project');
  const [format, setFormat] = useState<Format>('xlsx');
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [problems, setProblems] = useState<{ fileName: string; lines: string[] } | null>(null);
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
  const [preview, setPreview] = useState<{ fileName: string; plan: ImportPlan } | null>(null);

  const micrograph = useMemo(() => {
    if (!project || !activeMicrographId) return null;
    for (const d of project.datasets ?? []) {
      for (const s of d.samples ?? []) {
        const m = s.micrographs?.find((x) => x.id === activeMicrographId);
        if (m) return m;
      }
    }
    return null;
  }, [project, activeMicrographId]);

  const allSpots = useMemo(() => spotsInOrder(project), [project]);
  const micrographSpots = useMemo(() => (micrograph ? spotsInOrder(project, micrograph.id) : []), [project, micrograph]);
  const columns = useMemo(() => orderedColumns(project), [project]);
  const spotsWithData = allSpots.filter(({ spot }) => spot.customUserData && Object.keys(spot.customUserData).length > 0).length;
  const effectiveScope: Scope = scope === 'micrograph' && micrographSpots.length > 0 ? 'micrograph' : 'project';
  const viewer = permissions.role === 'viewer';
  const contributor = permissions.role === 'contributor';

  const reset = () => {
    setProblems(null);
    setMessage(null);
    setPreview(null);
  };

  const handleClose = () => {
    reset();
    setShowHelp(false);
    onClose();
  };

  const handleDownload = async () => {
    if (!project) return;
    reset();
    setBusy(true);
    try {
      const result = await downloadCustomUserData(project, effectiveScope === 'micrograph' ? micrograph?.id ?? null : null, format);
      if (result.status === 'saved') setMessage({ severity: 'success', text: `Saved ${plural(result.rows, 'row')} to ${result.filePath}.` });
      else if (result.status === 'failed') setMessage({ severity: 'error', text: `The file could not be saved: ${result.error}` });
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!project) return;
    reset();
    setBusy(true);
    try {
      const result = await window.api?.customUserData.open();
      if (!result || result.canceled) return;
      const fileName = result.fileName ?? 'the file';
      if (!result.success) {
        setProblems({ fileName, lines: [result.error ?? 'The file could not be read.'] });
        return;
      }
      const check = checkImport(project, { headers: result.headers ?? [], rows: result.rows ?? [] }, {
        canChangeColumns: canEditEntity(permissions, 'project', project.id),
        canEditSpot: (id) => canEditEntity(permissions, 'spot', id),
      });
      if (!check.ok) setProblems({ fileName, lines: check.problems });
      else setPreview({ fileName, plan: check.plan });
    } finally {
      setBusy(false);
    }
  };

  const handleApply = () => {
    if (!preview) return;
    const { plan } = preview;
    asOwnUndoStep(() => changeCustomUserData((p) => applyImport(p, plan)));
    setPreview(null);
    setMessage({
      severity: 'success',
      text: plan.changedValues > 0
        ? `Imported ${plural(plan.changedValues, 'value')} on ${plural(plan.changedSpots, 'spot')}.`
        : 'Imported the column order.',
    });
  };

  if (!project) {
    return (
      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle>Custom User Data</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Open a project first: Custom User Data belongs to the spots of a project.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  // ------------------------------------------------------------ preview
  if (preview) {
    const { plan, fileName } = preview;
    const changes = importChangesSomething(project, plan);
    return (
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Import {fileName}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {plural(plan.matched, 'row')} matched to spots.{' '}
            {plan.changedValues > 0
              ? `${plural(plan.changedValues, 'value')} on ${plural(plan.changedSpots, 'spot')} will be added, changed or removed.`
              : 'No values change.'}
          </Typography>
          {plan.columns.length > 0 ? (
            <Typography variant="body2" sx={{ mb: 1 }}>
              Columns in the file: {plan.columns.join(', ')}
              {plan.newColumns.length > 0 && <><br />New columns: {plan.newColumns.join(', ')}</>}
            </Typography>
          ) : (
            <Typography variant="body2" sx={{ mb: 1 }}>The file has no columns of its own yet: add headers to the right of the grey columns.</Typography>
          )}
          {!plan.updatesColumnList && plan.newColumns.length > 0 && (
            <Alert severity="info" sx={{ mb: 1 }}>
              As a Contributor you can't change the column order, so new columns are shown in alphabetical order after the others.
            </Alert>
          )}
          {plan.unmatched.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              <AlertTitle>{plural(plan.unmatched.length, 'row')} not matched (skipped)</AlertTitle>
              <Typography variant="body2" sx={{ mb: 0.5 }}>Their Spot ID is not in this project (the spot was deleted, the id was edited, or the file is from another project).</Typography>
              <RowList items={plan.unmatched.map((r) => `Row ${r.row}${r.spotName ? ` (${r.spotName})` : ''}: ${r.spotId}`)} />
            </Alert>
          )}
          {plan.roundedId.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              <AlertTitle>{plural(plan.roundedId.length, 'row')} with a damaged Spot ID (skipped)</AlertTitle>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                A spreadsheet program rounded their Spot ID (Excel does this in .csv files), and their Sample, Micrograph and Spot Name don&apos;t identify a single spot. Download a new template and fill it in again, or use .xlsx.
              </Typography>
              <RowList items={plan.roundedId.map((r) => `Row ${r.row}${r.spotName ? ` (${r.spotName})` : ''}: ${r.spotId}`)} />
            </Alert>
          )}
          {plan.matchedByName.length > 0 && (
            <Alert severity="info" sx={{ mb: 1 }}>
              <AlertTitle>{plural(plan.matchedByName.length, 'row')} matched by name</AlertTitle>
              <Typography variant="body2">
                A spreadsheet program rounded their Spot ID (Excel does this in .csv files), so they were matched by Sample, Micrograph and Spot Name instead. To avoid this, use .xlsx with Excel.
              </Typography>
            </Alert>
          )}
          {plan.missingId.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              <AlertTitle>{plural(plan.missingId.length, 'row')} with values but no Spot ID (skipped)</AlertTitle>
              <RowList items={plan.missingId.map((r) => `Row ${r}`)} />
            </Alert>
          )}
          {plan.notYours.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              <AlertTitle>{plural(plan.notYours.length, 'spot')} added by someone else (skipped)</AlertTitle>
              <Typography variant="body2" sx={{ mb: 0.5 }}>As a Contributor you can only change spots you added.</Typography>
              <RowList items={plan.notYours.map((r) => `Row ${r.row}: ${r.spotName || r.spotId}`)} />
            </Alert>
          )}
          {plan.nameChanges.length > 0 && (
            <Alert severity="info" sx={{ mb: 1 }}>
              <AlertTitle>{plural(plan.nameChanges.length, 'name')} in the file differ from the project</AlertTitle>
              <Typography variant="body2" sx={{ mb: 0.5 }}>Rows are matched by Spot ID, so the project's names are kept. To rename, rename in StraboMicro.</Typography>
              <RowList items={plan.nameChanges.map((n) => `Row ${n.row}, ${n.column}: "${n.inFile}" in the file, "${n.inProject}" in the project`)} />
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)}>Back</Button>
          <Button variant="contained" onClick={handleApply} disabled={!changes}>
            Apply Import
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // ------------------------------------------------------------ start
  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Custom User Data</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Add your own data to spots with a spreadsheet: download a template with one row per spot, add your own columns,
          fill them in, and import the file. Each row is matched to its spot by Spot ID.{' '}
          <Link component="button" variant="body2" onClick={() => setShowHelp((v) => !v)} sx={{ verticalAlign: 'baseline' }}>
            {showHelp ? 'Less' : 'More about the template'}
          </Link>
        </Typography>
        <Collapse in={showHelp}>
          <Box sx={{ mb: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
            {INSTRUCTION_SECTIONS.map((section, i) => (
              <Box key={section.title} sx={{ mt: i > 0 ? 1 : 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{section.title}</Typography>
                {section.lines.map((line) => <Typography key={line} variant="body2">{line}</Typography>)}
              </Box>
            ))}
          </Box>
        </Collapse>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {columns.length > 0
            ? `This project has ${plural(columns.length, 'column')} of Custom User Data (${columns.join(', ')}) on ${plural(spotsWithData, 'spot')}.`
            : 'This project has no Custom User Data yet.'}
        </Typography>

        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', mb: 2 }}>
          <FormControl>
            <FormLabel sx={{ fontSize: '0.85rem' }}>Template for</FormLabel>
            <RadioGroup value={effectiveScope} onChange={(e) => setScope(e.target.value === 'micrograph' ? 'micrograph' : 'project')}>
              <FormControlLabel value="project" control={<Radio size="small" />} label={`Whole project (${plural(allSpots.length, 'spot')})`} />
              <FormControlLabel
                value="micrograph"
                control={<Radio size="small" />}
                disabled={micrographSpots.length === 0}
                label={micrograph
                  ? `Selected micrograph: ${micrograph.name} (${plural(micrographSpots.length, 'spot')})`
                  : 'Selected micrograph (none selected)'}
              />
            </RadioGroup>
          </FormControl>
          <FormControl>
            <FormLabel sx={{ fontSize: '0.85rem' }}>File type</FormLabel>
            <RadioGroup value={format} onChange={(e) => setFormat(e.target.value === 'csv' ? 'csv' : 'xlsx')}>
              <FormControlLabel value="xlsx" control={<Radio size="small" />} label="Excel (.xlsx), spot columns locked" />
              <FormControlLabel value="csv" control={<Radio size="small" />} label="CSV (.csv)" />
            </RadioGroup>
          </FormControl>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={handleDownload} disabled={busy || allSpots.length === 0}>
            Download Template...
          </Button>
          <Button variant="outlined" onClick={handleImport} disabled={busy || viewer || allSpots.length === 0}>
            Import Filled Template...
          </Button>
        </Box>
        {allSpots.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This project has no spots yet. Add spots first: each row of the template is one spot.
          </Typography>
        )}
        {viewer && (
          <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
            View only. You're a Viewer on this project, so you can download but not import.
          </Typography>
        )}
        {contributor && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            As a Contributor, an import changes only the spots you added.
          </Typography>
        )}

        {problems && (
          <Alert severity="error" sx={{ mt: 2 }}>
            <AlertTitle>{problems.fileName} can't be imported</AlertTitle>
            <RowList items={problems.lines} />
            <Typography variant="body2" sx={{ mt: 0.5 }}>Nothing was changed. Fix the file and import it again.</Typography>
          </Alert>
        )}
        {message && <Alert severity={message.severity} sx={{ mt: 2 }}>{message.text}</Alert>}
        {hasCustomUserData(project) && !message && !problems && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            The downloaded file includes the current values, so it can be edited and imported again.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
