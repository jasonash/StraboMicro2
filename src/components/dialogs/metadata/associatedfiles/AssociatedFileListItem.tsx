/**
 * Associated File List Item Component
 *
 * Displays a single associated file in the list
 * File name is clickable and opens with system default application
 */

import { useState } from 'react';
import { Box, Typography, Link, Tooltip } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { AssociatedFileData } from './AssociatedFileAddForm';

interface AssociatedFileListItemProps {
  file: AssociatedFileData;
  projectId?: string;
}

export function AssociatedFileListItem({ file, projectId }: AssociatedFileListItemProps) {
  const [isOpening, setIsOpening] = useState(false);

  const displayType = file.fileType === 'Other' && file.otherType
    ? file.otherType
    : file.fileType;

  const handleOpenFile = async () => {
    if (!projectId || !window.api?.openFilePath || !window.api?.getProjectFolderPaths) {
      console.error('Cannot open file: missing projectId or API');
      return;
    }

    setIsOpening(true);
    try {
      // Get the project folder paths to construct full file path
      const paths = await window.api.getProjectFolderPaths(projectId);
      const filePath = `${paths.associatedFiles}/${file.fileName}`;

      const result = await window.api.openFilePath(filePath);
      if (!result.success) {
        console.error('Failed to open file:', result.error);
        alert(`Could not open file: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error opening file:', error);
      alert('Failed to open file. It may have been moved or deleted.');
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <Box>
      {projectId ? (
        <Tooltip title="Open with default application" placement="top">
          <Link
            component="button"
            variant="body1"
            onClick={handleOpenFile}
            disabled={isOpening}
            sx={{
              fontWeight: 500,
              textAlign: 'left',
              cursor: isOpening ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              '&:hover': {
                textDecoration: 'underline',
              },
            }}
          >
            {file.fileName}
            <OpenInNewIcon sx={{ fontSize: 14, opacity: 0.7 }} />
          </Link>
        </Tooltip>
      ) : (
        <Typography variant="body1" sx={{ fontWeight: 500 }}>
          {file.fileName}
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary">
        Type: {displayType}
      </Typography>
      {file.notes && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {file.notes}
        </Typography>
      )}
    </Box>
  );
}
