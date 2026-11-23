/**
 * A mineral color swatch. With onChange, a click opens a color picker in a
 * popover (Configure Mineral Colors, the Mineralogy/Lithology dialog);
 * without it, the swatch only shows the color (right pane).
 */

import { useCallback, useState } from 'react';
import { Box, Popover, Tooltip } from '@mui/material';
import { HexColorPicker } from 'react-colorful';

interface ColorSwatchProps {
  color: string;
  onChange?: (color: string) => void;
  size?: number;
  /** Hover text */
  title?: string;
  /** Accessible name (e.g. "Quartz color") */
  label?: string;
  testId?: string;
}

export function ColorSwatch({ color, onChange, size = 32, title, label, testId }: ColorSwatchProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const handleClose = useCallback(() => setAnchorEl(null), []);
  const editable = onChange !== undefined;

  const swatch = (
    <Box
      role={editable ? 'button' : 'img'}
      aria-label={label}
      tabIndex={editable ? 0 : undefined}
      data-testid={testId}
      data-color={color}
      onClick={editable ? (e) => setAnchorEl(e.currentTarget) : undefined}
      onKeyDown={
        editable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setAnchorEl(e.currentTarget);
              }
            }
          : undefined
      }
      sx={{
        width: size,
        height: size,
        minWidth: size,
        backgroundColor: color,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: size <= 16 ? 0.5 : 1,
        cursor: editable ? 'pointer' : 'default',
        flexShrink: 0,
      }}
    />
  );

  return (
    <>
      {title ? (
        <Tooltip title={title} placement="top">
          {swatch}
        </Tooltip>
      ) : (
        swatch
      )}
      {editable && (
        <Popover
          open={Boolean(anchorEl)}
          anchorEl={anchorEl}
          onClose={handleClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{ paper: { sx: { p: 1.5 } } }}
        >
          <HexColorPicker color={color} onChange={onChange} />
        </Popover>
      )}
    </>
  );
}
