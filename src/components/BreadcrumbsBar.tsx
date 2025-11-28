/**
 * Breadcrumbs Bar Component
 *
 * Displays navigational breadcrumbs showing the micrograph hierarchy chain
 * and the currently selected spot (if any).
 *
 * Format: C -> flip -> top -> test_spot
 *
 * Each ancestor micrograph is clickable to navigate to that level.
 * The current item (last micrograph or spot) is displayed but not clickable.
 *
 * Also includes action buttons on the right:
 * - Download menu (micrograph only) - JPEG or SVG export
 * - Delete button (micrograph or spot)
 */

import { useState } from 'react';
import { Box, Typography, IconButton, Tooltip, CircularProgress, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import ImageIcon from '@mui/icons-material/Image';
import DrawIcon from '@mui/icons-material/Draw';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { useAppStore } from '@/store';
import { getMicrographAncestorChain, findSpotById } from '@/store/helpers';

interface BreadcrumbsBarProps {
  onDownloadJpeg?: () => void;
  onDownloadSvg?: () => void;
  onDeleteMicrograph?: () => void;
  onDeleteSpot?: () => void;
  isDownloading?: boolean;
}

export function BreadcrumbsBar({
  onDownloadJpeg,
  onDownloadSvg,
  onDeleteMicrograph,
  onDeleteSpot,
  isDownloading = false,
}: BreadcrumbsBarProps) {
  const project = useAppStore((state) => state.project);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const activeSpotId = useAppStore((state) => state.activeSpotId);
  const selectMicrograph = useAppStore((state) => state.selectMicrograph);
  const selectActiveSpot = useAppStore((state) => state.selectActiveSpot);

  // Download menu state
  const [downloadMenuAnchor, setDownloadMenuAnchor] = useState<null | HTMLElement>(null);
  const downloadMenuOpen = Boolean(downloadMenuAnchor);

  const handleDownloadMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setDownloadMenuAnchor(event.currentTarget);
  };

  const handleDownloadMenuClose = () => {
    setDownloadMenuAnchor(null);
  };

  const handleDownloadJpeg = () => {
    handleDownloadMenuClose();
    onDownloadJpeg?.();
  };

  const handleDownloadSvg = () => {
    handleDownloadMenuClose();
    onDownloadSvg?.();
  };

  // Get the micrograph ancestor chain
  const ancestorChain = activeMicrographId
    ? getMicrographAncestorChain(project, activeMicrographId)
    : [];

  // Get the active spot (if any)
  const activeSpot = activeSpotId ? findSpotById(project, activeSpotId) : null;

  // Handle clicking on a micrograph in the breadcrumb chain
  const handleMicrographClick = (micrographId: string) => {
    // Clear spot selection when navigating to a different micrograph
    selectActiveSpot(null);
    selectMicrograph(micrographId);
  };

  // If no micrograph is selected, don't show breadcrumbs
  if (ancestorChain.length === 0) {
    return null;
  }

  // Determine if we're viewing a spot or micrograph
  const isSpotView = !!activeSpotId && !!activeSpot;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        py: 1,
        px: 1.5,
        bgcolor: 'action.hover',
        borderRadius: 1,
        mb: 2,
        minHeight: 40,
      }}
    >
      {/* Breadcrumb navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
        {ancestorChain.map((micrograph, index) => {
          const isLast = index === ancestorChain.length - 1;
          const isClickable = !isLast || isSpotView; // Last micrograph is clickable if viewing a spot

          return (
            <Box key={micrograph.id} sx={{ display: 'flex', alignItems: 'center' }}>
              {index > 0 && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mx: 0.5 }}
                >
                  {' -> '}
                </Typography>
              )}
              <Typography
                variant="body2"
                component="span"
                onClick={isClickable ? () => handleMicrographClick(micrograph.id) : undefined}
                sx={{
                  color: isClickable ? 'primary.main' : 'text.primary',
                  cursor: isClickable ? 'pointer' : 'default',
                  fontWeight: isLast && !isSpotView ? 600 : 400,
                  '&:hover': isClickable
                    ? {
                        textDecoration: 'underline',
                      }
                    : {},
                }}
              >
                {micrograph.name || 'Unnamed'}
              </Typography>
            </Box>
          );
        })}

        {/* Show spot name at the end if viewing a spot */}
        {isSpotView && activeSpot && (
          <>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mx: 0.5 }}
            >
              {' -> '}
            </Typography>
            <Typography
              variant="body2"
              component="span"
              sx={{
                color: 'text.primary',
                fontWeight: 600,
              }}
            >
              {activeSpot.name || 'Unnamed Spot'}
            </Typography>
          </>
        )}
      </Box>

      {/* Action buttons */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
        {/* Download menu - only shown when viewing a micrograph (not a spot) */}
        {!isSpotView && (onDownloadJpeg || onDownloadSvg) && (
          <>
            <Tooltip title={isDownloading ? 'Exporting...' : 'Download Micrograph'}>
              <span>
                <IconButton
                  size="small"
                  onClick={handleDownloadMenuOpen}
                  disabled={isDownloading}
                  sx={{ color: 'text.secondary' }}
                >
                  {isDownloading ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <DownloadIcon fontSize="small" />
                      <ArrowDropDownIcon fontSize="small" sx={{ ml: -0.5 }} />
                    </Box>
                  )}
                </IconButton>
              </span>
            </Tooltip>
            <Menu
              anchorEl={downloadMenuAnchor}
              open={downloadMenuOpen}
              onClose={handleDownloadMenuClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem onClick={handleDownloadJpeg} disabled={!onDownloadJpeg}>
                <ListItemIcon>
                  <ImageIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Download as JPEG</ListItemText>
              </MenuItem>
              <MenuItem onClick={handleDownloadSvg} disabled={!onDownloadSvg}>
                <ListItemIcon>
                  <DrawIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Download as SVG (Vector)</ListItemText>
              </MenuItem>
            </Menu>
          </>
        )}

        {/* Delete button */}
        {isSpotView ? (
          onDeleteSpot && (
            <Tooltip title="Delete Spot">
              <IconButton
                size="small"
                onClick={onDeleteSpot}
                sx={{ color: 'error.main' }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )
        ) : (
          onDeleteMicrograph && (
            <Tooltip title="Delete Micrograph">
              <IconButton
                size="small"
                onClick={onDeleteMicrograph}
                sx={{ color: 'error.main' }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )
        )}
      </Box>
    </Box>
  );
}
