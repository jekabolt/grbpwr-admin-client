import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Grid, IconButton, Typography } from '@mui/material';
import { FC, useState } from 'react';

interface TruncateText {
  text: string | undefined;
  length: number;
}

export const TruncateText: FC<TruncateText> = ({ text, length }) => {
  const [isExpandedText, setIsExpandedText] = useState(false);

  const truncateText = (text: string, length: number) => {
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
  };

  const toggleTextExpansion = () => {
    setIsExpandedText(!isExpandedText);
  };

  return (
    <Grid container>
      <Grid item xs={12}>
        <Typography variant='overline' fontSize='x-small' sx={{ wordBreak: 'break-all' }}>
          {isExpandedText ? text : truncateText(text || 'no title', length)}
          {(text?.length ?? 0) > length && (
            <IconButton onClick={toggleTextExpansion}>
              {isExpandedText ? (
                <ExpandLessIcon fontSize='small' />
              ) : (
                <ExpandMoreIcon fontSize='small' />
              )}
            </IconButton>
          )}
        </Typography>
      </Grid>
    </Grid>
  );
};
