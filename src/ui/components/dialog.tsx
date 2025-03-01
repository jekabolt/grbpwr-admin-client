import CloseIcon from '@mui/icons-material/Close';
import {
  AppBar,
  DialogActions,
  DialogContent,
  DialogProps,
  DialogTitle,
  Dialog as MuiDialog,
  Theme,
  Toolbar,
  useMediaQuery,
} from '@mui/material';
import { Button } from './button';

interface Props extends DialogProps {
  open: boolean;
  children: React.ReactNode;
  isSaveButton?: boolean;
  title?: string;
  fullWidth?: boolean;
  onClose: () => void;
  save?: () => void;
}

export function Dialog({
  open,
  children,
  isSaveButton,
  title,
  onClose,
  save,
  fullWidth = false,
  ...props
}: Props) {
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
  return (
    <MuiDialog
      open={open}
      onClose={onClose}
      fullWidth={fullWidth}
      fullScreen={props.fullScreen || isMobile}
      maxWidth='xl'
      scroll='paper'
      // sx={{
      //   '& .MuiDialogContent-root': {
      //     padding: { xs: '30px 0 8px', sm: 2, md: 3 },
      //     '&::-webkit-scrollbar': {
      //       display: 'none',
      //     },
      //     scrollbarWidth: 'none',
      //     msOverflowStyle: 'none',
      //     overflowY: props.fullScreen ? 'hidden' : 'auto',
      //   },
      // }}
      {...props}
    >
      <DialogActions>
        <Button onClick={onClose}>
          <CloseIcon />
        </Button>
      </DialogActions>
      {title && <DialogTitle>{title.toUpperCase()}</DialogTitle>}
      <DialogContent>{children}</DialogContent>
      {isSaveButton && (
        <AppBar
          position='sticky'
          sx={{
            bottom: 0,
            right: 0,
            boxShadow: 'none',
            backgroundColor: 'transparent !important',
          }}
        >
          <Toolbar sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button size='lg' onClick={save}>
              save
            </Button>
          </Toolbar>
        </AppBar>
      )}
    </MuiDialog>
  );
}
