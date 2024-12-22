import EditIcon from '@mui/icons-material/Edit';
import { Button, Grid2 as Grid, IconButton, TextField, Typography } from '@mui/material';
import { common_OrderFull } from 'api/proto-http/frontend';

interface Props {
  isEdit: boolean;
  isPrinting: boolean;
  trackingNumber: string;
  orderStatus: string;
  orderDetails: common_OrderFull | undefined;
  toggleTrackNumber: () => void;
  handleTrackingNumberChange: (event: any) => void;
  saveTrackingNumber: () => void;
}

export function TrackingNumber({
  isEdit,
  isPrinting,
  trackingNumber,
  orderStatus,
  orderDetails,
  toggleTrackNumber,
  handleTrackingNumberChange,
  saveTrackingNumber,
}: Props) {
  return (
    <Grid container>
      {isEdit && !isPrinting ? (
        <Grid size={{ xs: 12 }}>
          <TextField
            id='tracking-number-input'
            label='Tracking number'
            variant='filled'
            value={trackingNumber}
            onChange={handleTrackingNumberChange}
            size='small'
          />
          <Button variant='contained' color='primary' onClick={saveTrackingNumber}>
            save
          </Button>
        </Grid>
      ) : (
        !isPrinting && (
          <Grid size={{ xs: 12 }}>
            <Typography
              style={{ display: 'flex', alignItems: 'center' }}
              variant='overline'
              fontWeight='bold'
              textTransform='uppercase'
            >
              {[
                `tracking number: ${orderDetails?.shipment?.trackingCode} `,
                orderStatus === 'SHIPPED' && (
                  <IconButton onClick={toggleTrackNumber} size='small'>
                    <EditIcon style={{ fontSize: '14px' }} />
                  </IconButton>
                ),
              ]}
            </Typography>
          </Grid>
        )
      )}
    </Grid>
  );
}
