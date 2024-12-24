import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { Grid2 as Grid, IconButton, TextField } from '@mui/material';
interface Props {
  trackingNumber: string;
  handleTrackingNumberChange: (event: any) => void;
  saveTrackingNumber: () => void;
}

export function NewTrackCode({
  trackingNumber,
  handleTrackingNumberChange,
  saveTrackingNumber,
}: Props) {
  return (
    <Grid container>
      <Grid size={{ xs: 12 }} display='flex' alignItems='center' gap={1}>
        <TextField
          id='tracking-number-input'
          label={trackingNumber ? '' : 'tracking number'}
          variant='outlined'
          value={trackingNumber}
          onChange={handleTrackingNumberChange}
          size='small'
          slotProps={{ inputLabel: { shrink: false, style: { textTransform: 'uppercase' } } }}
        />
        <IconButton onClick={saveTrackingNumber}>
          <CheckCircleIcon fontSize='large' />
        </IconButton>
      </Grid>
    </Grid>
  );
}
