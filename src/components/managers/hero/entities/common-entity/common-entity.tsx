import { Box, Grid2 as Grid, TextField, Typography } from '@mui/material';
import { common_HeroFullInsert, common_MediaFull } from 'api/proto-http/admin';
import { SingleMediaViewAndSelect } from 'components/common/media-selector-layout/media-selector-components/singleMediaViewAndSelect';
import { isValidURL, isValidUrlForHero } from 'features/utilitty/isValidUrl';
import { ErrorMessage, Field, useFormikContext } from 'formik';
import styles from 'styles/hero.scss';

interface Props {
  title: string;
  prefix: string;
  link: string;
  exploreLink: string | undefined;
  size: { xs: number; md?: number };
  aspectRatio: string[];
  onSaveMedia: (selectedMedia: common_MediaFull[]) => void;
}

export function CommonEntity({
  title,
  prefix,
  link,
  exploreLink,
  size,
  aspectRatio,
  onSaveMedia,
}: Props) {
  const { errors } = useFormikContext<common_HeroFullInsert>();
  return (
    <Grid container>
      <Grid size={{ xs: 12 }}>
        <Typography variant='h4' textTransform='uppercase'>
          {title}
        </Typography>
      </Grid>
      <Grid size={size}>
        <SingleMediaViewAndSelect
          link={link}
          aspectRatio={aspectRatio}
          isDeleteAccepted={false}
          saveSelectedMedia={(selectedMedia) => onSaveMedia(selectedMedia)}
        />
        {`${errors}.${prefix}.mediaId` && (
          <ErrorMessage name={`${prefix}.mediaId`} component='div' />
        )}
        <Box component='div' className={styles.fields}>
          <Field
            as={TextField}
            name={`${prefix}.exploreLink`}
            label='EXPLORE LINK'
            error={
              (exploreLink && !isValidUrlForHero(exploreLink)) ||
              (exploreLink && !isValidURL(exploreLink))
            }
            helperText={
              exploreLink && !isValidURL(exploreLink)
                ? 'Invalid URL format'
                : exploreLink && !isValidUrlForHero(exploreLink)
                  ? 'URL is not from the allowed domain but will be saved with a warning'
                  : ''
            }
            fullWidth
          />
          <Field as={TextField} name={`${prefix}.exploreText`} label='explore text' fullWidth />
        </Box>
      </Grid>
    </Grid>
  );
}
