import { Grid2 as Grid, Typography } from '@mui/material';
import { useArchiveStore } from 'lib/stores/store';
import { useEffect, useRef, useState } from 'react';

export function ListArchive() {
  const { archives, fetchArchives } = useArchiveStore();
  const [mediaId, setMediaId] = useState<number>(0);
  const mediaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchArchives(50, 0);
  }, [fetchArchives]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const handleScroll = () => {
      const mediaHeight = media.clientHeight;
      const scrollPosition = media.scrollTop;
      const itemHeight = mediaHeight * 0.7;
      const curId = Math.round(scrollPosition / itemHeight);
      setMediaId(curId);
    };

    media.addEventListener('scroll', handleScroll);
    return () => media.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <Grid
      container
      ref={mediaRef}
      display='grid'
      height='100vh'
      spacing={2}
      sx={{
        border: '1px solid yellow',
        overflowY: 'auto',
        scrollSnapType: 'y mandatory',
        '&::-webkit-scrollbar': { display: 'none' },
        msOverflowStyle: 'none',
        scrollbarWidth: 'none',
      }}
    >
      {archives.map((a, id) => (
        <Grid
          key={id}
          display='flex'
          alignItems='center'
          justifyContent='space-between'
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
          <Grid size={{ xs: 2 }}>
            <Typography>this is the title {a.title}</Typography>
          </Grid>
          <Grid size={{ xs: 8 }} sx={{ height: '100%' }}>
            <img
              src={a.media?.[0].media?.fullSize?.mediaUrl}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: mediaId === id ? 'scale(1)' : 'scale(0.8)',
                transition: 'transform 0.3s ease',
              }}
              alt=''
            />
          </Grid>
          <Grid size={{ xs: 2 }}>
            <Typography>this is the description {a.description}</Typography>
          </Grid>
        </Grid>
      ))}
    </Grid>
  );
}
