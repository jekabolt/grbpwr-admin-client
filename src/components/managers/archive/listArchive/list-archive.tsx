import { Button, Grid2 as Grid, Typography } from '@mui/material';
import { useArchiveStore, useSnackBarStore } from 'lib/stores/store';
import { useEffect, useRef, useState } from 'react';
import { ArchiveItem } from './archive-item';

export function ListArchive() {
  const { archives, fetchArchives, deleteArchive } = useArchiveStore();
  const { showMessage } = useSnackBarStore();
  const [mediaId, setMediaId] = useState<number>(0);
  const mediaRef = useRef<HTMLDivElement>(null);
  const [selectedArchive, setSelectedArchive] = useState<number>();
  const archiveData = archives.find((a) => a.id === selectedArchive);

  useEffect(() => {
    fetchArchives(50, 0);
  }, [fetchArchives]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const handleScroll = () => {
      const itemHeight = media.clientHeight * 0.7;
      setMediaId(Math.round(media.scrollTop / itemHeight));
    };
    media.addEventListener('scroll', handleScroll);
    return () => media.removeEventListener('scroll', handleScroll);
  }, []);

  async function handleDeleteArchive(e: React.MouseEvent, id: number) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await deleteArchive(id);
      setSelectedArchive(undefined);
      showMessage('archive deleted', 'success');
    } catch (error) {
      showMessage('failed to delete archive', 'error');
    }
  }

  return (
    <>
      <Grid
        container
        ref={mediaRef}
        display='grid'
        height='100vh'
        spacing={2}
        sx={{
          overflowY: 'auto',
          scrollSnapType: 'y mandatory',
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
        }}
      >
        {archives.map((archive, id) => (
          <Grid
            size={{ xs: 12 }}
            key={archive.id}
            onClick={() => setSelectedArchive(archive.id)}
            display={{ xs: 'grid', lg: 'flex' }}
            alignItems='center'
            justifyContent={{ xs: 'center', lg: 'space-between' }}
            height='70vh'
            sx={{
              scrollSnapAlign: 'center',
              opacity: mediaId === id ? 1 : 0.3,
              transition: 'opacity 0.3s ease',
              position: 'relative',
              zIndex: mediaId === id ? 2 : 1,
              pointerEvents: mediaId === id ? 'auto' : 'none',
            }}
          >
            <Button
              onClick={(e: React.MouseEvent) => handleDeleteArchive(e, archive.id || 0)}
              color='error'
              size='large'
              sx={{ position: 'absolute', top: 0, right: 0 }}
            >
              remove
            </Button>
            <Grid size={{ xs: 12, lg: 2 }}>
              <Typography
                textAlign='center'
                variant='overline'
                fontWeight='bold'
                fontSize='1.2rem'
                textTransform='uppercase'
                border='1px solid red'
              >
                {archive.heading}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, lg: 8 }} sx={{ height: '100%' }}>
              <img
                src={archive.media?.[0].media?.fullSize?.mediaUrl}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: mediaId === id ? 'scale(1)' : 'scale(0.6)',
                  transition: 'transform 0.3s ease',
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, lg: 2 }}>
              <Typography
                textAlign='center'
                variant='overline'
                fontWeight='bold'
                fontSize='1.2rem'
                textTransform='uppercase'
                border='1px solid red'
              >
                {archive.tag}
              </Typography>
            </Grid>
          </Grid>
        ))}
      </Grid>
      <ArchiveItem archiveData={archiveData} close={() => setSelectedArchive(undefined)} />
    </>
  );
}
