import { Button, Grid2 as Grid, TextField, Typography } from '@mui/material';
import { common_HeroFullInsert, common_MediaFull } from 'api/proto-http/admin';
import { common_ArchiveFull } from 'api/proto-http/frontend';
import { SingleMediaViewAndSelect } from 'components/common/media-selector-layout/media-selector-components/singleMediaViewAndSelect';
import { Field, useFormikContext } from 'formik';
import { useHeroStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { ArchivePicker } from './entities/featured-archive/archive-picker';

export function NavbarHero() {
  const { hero } = useHeroStore();
  const { values, setFieldValue } = useFormikContext<common_HeroFullInsert>();
  const [menMedia, setMenMedia] = useState<string>('');
  const [womenMedia, setWomenMedia] = useState<string>('');
  const [openArchivePicker, setOpenArchivePicker] = useState<'men' | 'women' | null>(null);

  useEffect(() => {
    if (hero?.navFeatured) {
      if (hero.navFeatured.men?.media?.media?.thumbnail?.mediaUrl) {
        setMenMedia(hero.navFeatured.men.media.media.thumbnail.mediaUrl);
      }
      if (hero.navFeatured.women?.media?.media?.thumbnail?.mediaUrl) {
        setWomenMedia(hero.navFeatured.women.media.media.thumbnail.mediaUrl);
      }
    }
  }, [hero?.navFeatured]);

  function saveNavbarMedia(selectedMedia: common_MediaFull[], type: 'men' | 'women') {
    if (!selectedMedia.length) return;

    const media = selectedMedia[0];

    if (type === 'men') {
      setMenMedia(media.media?.thumbnail?.mediaUrl || '');
      setFieldValue(`navFeatured.${type}.mediaId`, media.id);
    } else {
      setWomenMedia(media.media?.thumbnail?.mediaUrl || '');
      setFieldValue(`navFeatured.${type}.mediaId`, media.id);
    }
  }

  const handleSaveArchiveSelection = (
    selectedArchive: common_ArchiveFull[],
    type: 'men' | 'women',
  ) => {
    if (selectedArchive.length > 0) {
      setFieldValue(`navFeatured.${type}.featuredArchiveId`, selectedArchive[0].id);
    }
  };

  return (
    <Grid container>
      <Grid size={{ xs: 12 }}>
        <Typography variant='h4' textTransform='uppercase'>
          hero navbar
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'grid', gap: 2 }}>
            <Typography textTransform='uppercase'>men</Typography>
            <SingleMediaViewAndSelect
              link={menMedia}
              aspectRatio={['4:5']}
              isDeleteAccepted={false}
              saveSelectedMedia={(media) => saveNavbarMedia(media, 'men')}
              isEditMode
            />
            <Field
              as={TextField}
              name={`navFeatured.men.exploreText`}
              label='explore text'
              fullWidth
              InputLabelProps={{ shrink: true, style: { textTransform: 'uppercase' } }}
            />
            <Field
              as={TextField}
              name={`navFeatured.men.featuredTag`}
              label='featured tag'
              fullWidth
              InputLabelProps={{ shrink: true, style: { textTransform: 'uppercase' } }}
            />
            <Field
              as={TextField}
              name={`navFeatured.men.featuredArchiveId`}
              label='featured archive'
              fullWidth
              InputProps={{
                endAdornment: (
                  <Button onClick={() => setOpenArchivePicker('men')} size='small' sx={{ ml: 1 }}>
                    Select Archive
                  </Button>
                ),
              }}
              InputLabelProps={{ shrink: true, style: { textTransform: 'uppercase' } }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'grid', gap: 2 }}>
            <Typography textTransform='uppercase'>women</Typography>
            <SingleMediaViewAndSelect
              link={womenMedia}
              aspectRatio={['4:5']}
              isDeleteAccepted={false}
              saveSelectedMedia={(media) => saveNavbarMedia(media, 'women')}
              isEditMode
            />
            <Field
              as={TextField}
              name={`navFeatured.women.exploreText`}
              label='explore text'
              fullWidth
              InputLabelProps={{ shrink: true, style: { textTransform: 'uppercase' } }}
            />
            <Field
              as={TextField}
              name={`navFeatured.women.featuredTag`}
              label='featured tag'
              fullWidth
              InputLabelProps={{ shrink: true, style: { textTransform: 'uppercase' } }}
            />
            <Field
              as={TextField}
              name={`navFeatured.women.featuredArchiveId`}
              label='featured archive'
              fullWidth
              InputProps={{
                endAdornment: (
                  <Button onClick={() => setOpenArchivePicker('women')} size='small' sx={{ ml: 1 }}>
                    Select Archive
                  </Button>
                ),
              }}
              InputLabelProps={{ shrink: true, style: { textTransform: 'uppercase' } }}
            />
          </Grid>
        </Grid>
      </Grid>
      <ArchivePicker
        open={!!openArchivePicker}
        onClose={() => setOpenArchivePicker(null)}
        onSave={(selectedArchive) => {
          if (openArchivePicker) {
            handleSaveArchiveSelection(selectedArchive, openArchivePicker);
          }
          setOpenArchivePicker(null);
        }}
        selectedArchiveId={
          openArchivePicker === 'men'
            ? values.navFeatured?.men?.featuredArchiveId || 0
            : values.navFeatured?.women?.featuredArchiveId || 0
        }
      />
    </Grid>
  );
}
