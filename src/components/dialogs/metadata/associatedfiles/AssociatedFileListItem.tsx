/**
 * Associated File List Item Component
 *
 * Displays a single associated file in the list
 */

import { Box, Typography } from '@mui/material';
import { AssociatedFileData } from './AssociatedFileAddForm';

interface AssociatedFileListItemProps {
  file: AssociatedFileData;
}

export function AssociatedFileListItem({ file }: AssociatedFileListItemProps) {
  const displayType = file.fileType === 'Other' && file.otherType
    ? file.otherType
    : file.fileType;

  return (
    <Box>
      <Typography variant="body1" sx={{ fontWeight: 500 }}>
        {file.fileName}
      </Typography>
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
