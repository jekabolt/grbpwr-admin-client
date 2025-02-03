import { Button, Grid2 as Grid, TextField, Typography } from '@mui/material';
import { useNavigate } from '@tanstack/react-location';
import { common_HeroFullInsert } from 'api/proto-http/admin';
import { defaultProductFilterSettings } from 'constants/initialFilterStates';
import { ROUTES } from 'constants/routes';
import { Field, useFormikContext } from 'formik';
import styles from 'styles/archiveList.scss';
import { FeatureArchiveProps } from '../interface/interface';
import { ArchivePicker } from './archive-picker';

export function FeaturedArchive({
  archive,
  index,
  currentEntityIndex,
  open,
  onClose,
  handleSaveArchiveSelection,
  handleOpenArchiveSelection,
}: FeatureArchiveProps) {
  const navigate = useNavigate();
  const { values } = useFormikContext<common_HeroFullInsert>();

  const handleTagClick = () => {
    const tag = values.entities?.[index]?.featuredArchive?.tag;
    if (tag) {
      const filterSettings = {
        ...defaultProductFilterSettings,
        filterConditions: {
          ...defaultProductFilterSettings.filterConditions,
          byTag: tag,
        },
      };
      navigate({
        to: `${ROUTES.product}`,
        search: (old) => ({
          ...old,
          filter: filterSettings,
        }),
      });
    }
  };
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 6 }}>
        <Typography variant='h4' textTransform='uppercase'>
          featured archive
        </Typography>
      </Grid>
      <Grid
        size={{ xs: 12, md: 6 }}
        sx={{
          display: 'flex',
          justifyContent: {
            xs: 'flex-start',
            md: 'flex-end',
          },
        }}
      >
        <Typography
          variant='h4'
          textTransform='uppercase'
        >{`items[${archive[index]?.[0].media?.length}]`}</Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Button onClick={() => handleOpenArchiveSelection(index)} variant='contained'>
          {archive[index]?.[0].media?.length ? 'select new archive' : 'add archive'}
        </Button>
        <ArchivePicker
          open={open && currentEntityIndex === index}
          onClose={onClose}
          onSave={(selectedArchive) => handleSaveArchiveSelection(selectedArchive, index)}
          selectedArchiveId={archive[index]?.[0].id ?? 0}
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Grid
          container
          spacing={2}
          sx={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'nowrap',
            overflowX: 'auto',
            overflowY: 'hidden',
            pb: 2,
            width: '100%', // ensure full width
            maxWidth: '100%', // remove the 200px restriction
            '&::-webkit-scrollbar': {
              height: '8px',
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: 'rgba(0,0,0,.2)',
              borderRadius: '4px',
            },
          }}
        >
          {archive[index]?.[0].media?.length! > 0 &&
            archive[index]?.[0].media?.map((item) => (
              <Grid
                size={{ xs: 6, md: 3 }}
                key={item.id || index}
                sx={{
                  height: '300px',
                  minWidth: '300px',
                }}
              >
                <Grid size={{ xs: 12 }} className={styles.item}>
                  <img src={item.media?.thumbnail?.mediaUrl} />
                </Grid>
              </Grid>
            ))}
          {archive[index]?.[0].video && (
            <Grid
              size={{ xs: 6, md: 3 }}
              key={`video-${index}`}
              sx={{
                height: '300px',
                minWidth: '300px',
              }}
            >
              <Grid size={{ xs: 12 }} className={styles.item}>
                <video
                  src={archive[index]?.[0].video?.media?.fullSize?.mediaUrl}
                  controls
                  playsInline
                />
              </Grid>
            </Grid>
          )}
        </Grid>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Field
          as={TextField}
          name={`entities.${index}.featuredArchive.headline`}
          label='headline'
          fullWidth
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Field
          as={TextField}
          name={`entities.${index}.featuredArchive.exploreText`}
          label='explore text'
          fullWidth
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Field
          as={TextField}
          name={`entities.${index}.featuredArchive.tag`}
          label='tag'
          fullWidth
          InputProps={{
            endAdornment: (
              <Button onClick={handleTagClick} size='small' sx={{ ml: 1 }}>
                View Products
              </Button>
            ),
          }}
        />
      </Grid>
      {/* <Grid size={{ xs: 12 }}>
        <Field
          component={HeroProductTable}
          products={product[index] || []}
          id={index}
          isFeaturedProducts={false}
        />
      </Grid> */}
    </Grid>
  );
}
