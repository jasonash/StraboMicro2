import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * BottomPanel - Collapsible panel for detailed notes
 *
 * Displays project notes, sample notes, and other detailed information.
 * Height and collapse state managed by parent Viewer component.
 */
const BottomPanel: React.FC = () => {
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.paper',
      }}
    >
      {/* Panel content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="subtitle2" color="text.primary" sx={{ fontWeight: 500 }}>
              Detailed Notes:
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'underline' }}
            >
              (details)
            </Typography>
          </Box>
        </Box>

        {/* Project Notes Section */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Project Notes
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'underline' }}
            >
              (edit)
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
            incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
            exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure
            dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
            Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt
            mollit anim id est laborum.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 1, mt: 1 }}>
            Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque
            laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi
            architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas
            sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione
            voluptatem sequi nesciunt.
          </Typography>
        </Box>

        {/* Sample Notes Section */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Sample Notes
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'underline' }}
            >
              (edit)
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
            At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium
            voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint
            occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt
            mollitia animi, id est laborum et dolorum fuga.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 1, mt: 1 }}>
            Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta
            nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere
            possimus, omnis voluptas assumenda est, omnis dolor repellendus. Temporibus autem
            quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et
            voluptates repudiandae sint et molestiae non recusandae.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 1, mt: 1 }}>
            Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus
            maiores alias consequatur aut perferendis doloribus asperiores repellat. Lorem ipsum
            dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore
            et dolore magna aliqua.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default BottomPanel;
