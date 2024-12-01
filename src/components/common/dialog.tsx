import CloseIcon from '@mui/icons-material/Close';
import {
  AppBar,
  Button,
  DialogActions,
  DialogContent,
  DialogProps,
  DialogTitle,
  IconButton,
  Dialog as MuiDialog,
  Theme,
  Toolbar,
  useMediaQuery,
} from '@mui/material';

interface Props extends DialogProps {
  open: boolean;
  children: React.ReactNode;
  isSaveButton?: boolean;
  title?: string;
  onClose: () => void;
  save?: () => void;
}

export function Dialog({ open, children, isSaveButton, title, onClose, save, ...props }: Props) {
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
  return (
    <MuiDialog
      open={open}
      onClose={onClose}
      fullWidth
      fullScreen={isMobile}
      maxWidth='xl'
      scroll='paper'
      sx={{
        '& .MuiDialogContent-root': {
          '&::-webkit-scrollbar': {
            display: 'none',
          },
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        },
      }}
      {...props}
    >
      <DialogActions>
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', top: '0', right: '0', zIndex: 1000 }}
        >
          <CloseIcon />
        </IconButton>
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
            <Button onClick={save} size='medium' variant='contained'>
              save
            </Button>
          </Toolbar>
        </AppBar>
      )}
    </MuiDialog>
  );
}
