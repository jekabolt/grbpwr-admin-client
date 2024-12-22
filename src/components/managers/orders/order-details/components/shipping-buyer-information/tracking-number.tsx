import EditIcon from '@mui/icons-material/Edit';
import { Grid2 as Grid, IconButton, Typography } from '@mui/material';
import { common_OrderFull } from 'api/proto-http/frontend';
import { NewTrackCode } from './new-track-code';

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
    <>
      {orderDetails?.shipment?.trackingCode && (
        <Grid container spacing={2}>
          {isEdit && !isPrinting ? (
            <Grid size={{ xs: 12 }}>
              <NewTrackCode
                trackingNumber={trackingNumber}
                handleTrackingNumberChange={handleTrackingNumberChange}
                saveTrackingNumber={saveTrackingNumber}
              />
            </Grid>
          ) : (
            !isPrinting && (
              <Grid size={{ xs: 12 }}>
                <Typography
                  variant='overline'
                  fontSize={14}
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
      )}
    </>
  );
}
