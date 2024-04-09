import { Box, FormControl, Grid, InputLabel, MenuItem, Select } from '@mui/material';
import { FilterMediasInterface } from 'features/interfaces/mediaSelectorInterfaces';
import { FC } from 'react';
import styles from 'styles/media-selector.scss';

export const FilterMedias: FC<FilterMediasInterface> = ({
  filterByType,
  setFilterByType,
  sortByDate,
  setSortByDate,
}) => {
  return (
    <Grid container>
      <Grid item>
        <Box component='div' className={styles.box_1}>
          <FormControl size='small'>
            <InputLabel shrink>TYPE</InputLabel>
            <Select
              value={filterByType}
              displayEmpty
              onChange={(e) => setFilterByType(e.target.value)}
              label='TYPE'
            >
              <MenuItem value=''>ALL</MenuItem>
              <MenuItem value='image'>IMAGE</MenuItem>
              <MenuItem value='video'>VIDEO</MenuItem>
            </Select>
          </FormControl>
          <FormControl size='small'>
            <InputLabel>ORDER</InputLabel>
            <Select
              value={sortByDate}
              onChange={(e) => setSortByDate(e.target.value)}
              label='ORDER'
            >
              <MenuItem value='desc'>DESCENDING</MenuItem>
              <MenuItem value='asc'>ASCENDING</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Grid>
    </Grid>
  );
};
