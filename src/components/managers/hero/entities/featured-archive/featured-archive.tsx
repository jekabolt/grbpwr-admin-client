import { Button, Grid2 as Grid, TextField, Typography } from '@mui/material';
import { CopyToClipboard } from 'components/common/copyToClipboard';
import { TruncateText } from 'components/common/truncateText';
import { Field } from 'formik';
import styles from 'styles/archiveList.scss';
import { HeroProductTable } from '../featured-products-(tags)/heroProductsTable';
import { FeatureArchiveProps } from '../interface/interface';
import { ArchivePicker } from './archive-picker';

export function FeaturedArchive({
  archive,
  product,
  index,
  currentEntityIndex,
  open,
  onClose,
  handleSaveArchiveSelection,
  handleOpenArchiveSelection,
}: FeatureArchiveProps) {
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
        >{`items[${archive[index]?.[0].items?.length}]`}</Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Button onClick={() => handleOpenArchiveSelection(index)} variant='contained'>
          {archive[index]?.[0].items?.length ? 'select new archive' : 'add archive'}
        </Button>
        <ArchivePicker
          open={open && currentEntityIndex === index}
          onClose={onClose}
          onSave={(selectedArchive) => handleSaveArchiveSelection(selectedArchive, index)}
          selectedArchiveId={archive[index]?.[0].archive?.id ?? 0}
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Grid
          container
          spacing={2}
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'nowrap',
            overflowX: 'scroll',
            overflowY: 'hidden',
            maxWidth: '1300px',
            minWidth: '0',
            '& .MuiGrid2-root': {
              flexShrink: 0,
              width: 'auto',
            },
          }}
        >
          {archive[index]?.[0].items?.map((item) => (
            <Grid size={{ xs: 6, md: 3 }} key={index}>
              <Grid size={{ xs: 12 }} className={styles.item}>
                <img src={item.archiveItem?.media?.media?.thumbnail?.mediaUrl} />
              </Grid>
              <Grid
                size={{ xs: 12 }}
                sx={{
                  minHeight: '60px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <TruncateText text={item.archiveItem?.name} length={60} />
                {item.archiveItem?.url && (
                  <CopyToClipboard text={item.archiveItem?.url} cutText={true} />
                )}
              </Grid>
            </Grid>
          ))}
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
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Field
          component={HeroProductTable}
          products={product[index] || []}
          id={index}
          isFeaturedProducts={false}
        />
      </Grid>
    </Grid>
  );
}
