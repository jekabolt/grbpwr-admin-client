import { Box, Grid, TextField, Typography } from '@mui/material';
import { common_HeroFullInsert } from 'api/proto-http/admin';
import { SingleMediaViewAndSelect } from 'components/common/singleMediaViewAndSelect';
import { isValidUrlForHero } from 'features/utilitty/isValidUrl';
import { ErrorMessage, Field, useFormikContext } from 'formik';
import { FC } from 'react';
import styles from 'styles/hero.scss';
import { HeroMediaEntityInterface } from '../interface/interface';

export const DoubleAdd: FC<HeroMediaEntityInterface> = ({
  index,
  entity,
  doubleLinks,
  allowedRatios,
  saveDoubleMedia,
}) => {
  const { errors } = useFormikContext<common_HeroFullInsert>();
  return (
    <>
      <Grid item xs={12} md={10}>
        <Typography variant='h4' textTransform='uppercase'>
          double add
        </Typography>
      </Grid>
      <Grid item xs={12} md={5}>
        <SingleMediaViewAndSelect
          link={doubleLinks?.[index]?.left || ''}
          aspectRatio={allowedRatios?.[index] || ['4:5', '1:1']}
          isDeleteAccepted={false}
          saveSelectedMedia={(selectedMedia) =>
            saveDoubleMedia && saveDoubleMedia(selectedMedia, 'left', index)
          }
        />
        {`${errors}.entities.${index}.doubleAdd.left.mediaId` && (
          <ErrorMessage
            className={styles.error}
            name={`entities.${index}.doubleAdd.left.mediaId`}
            component='div'
          />
        )}
        <Box component='div' className={styles.fields}>
          <Field
            as={TextField}
            name={`entities.${index}.doubleAdd.left.exploreLink`}
            label='EXPLORE LINK'
            error={
              (entity.doubleAdd.left.exploreLink &&
                `${errors}.entities.${index}.doubleAdd.left.exploreLink`) ||
              (entity.doubleAdd.left.exploreLink &&
                !isValidUrlForHero(entity.doubleAdd.left.exploreLink))
            }
            helperText={
              entity.doubleAdd.left.exploreLink &&
              !isValidUrlForHero(entity.doubleAdd.left.exploreLink)
                ? "The URL field will display an error message until a valid URL is provided. However, users are still able to save the link, even if it's not valid."
                : ''
            }
            fullwidth
          />
          <Field
            as={TextField}
            name={`entities.${index}.doubleAdd.left.exploreText`}
            label='EXPLORE TEXT'
            fullwidth
          />
        </Box>
      </Grid>
      <Grid item xs={12} md={5}>
        <SingleMediaViewAndSelect
          link={doubleLinks?.[index]?.right || ''}
          aspectRatio={allowedRatios?.[index] || ['4:5', '1:1']}
          isDeleteAccepted={false}
          saveSelectedMedia={(selectedMedia) =>
            saveDoubleMedia && saveDoubleMedia(selectedMedia, 'right', index)
          }
        />
        {`${errors}.entities.${index}.doubleAdd.right.mediaId` && (
          <ErrorMessage
            className={styles.error}
            name={`entities.${index}.doubleAdd.right.mediaId`}
            component='div'
          />
        )}
        <Box component='div' className={styles.fields}>
          <Field
            as={TextField}
            name={`entities.${index}.doubleAdd.right.exploreLink`}
            label='EXPLORE LINK'
            error={
              (entity.doubleAdd.right.exploreLink && errors.entities) ||
              (entity.doubleAdd.right.exploreLink &&
                !isValidUrlForHero(entity.doubleAdd.right.exploreLink))
            }
            helperText={
              entity.doubleAdd.right.exploreLink &&
              !isValidUrlForHero(entity.doubleAdd.right.exploreLink)
                ? "The URL field will display an error message until a valid URL is provided. However, users are still able to save the link, even if it's not valid."
                : ''
            }
            fullwidth
          />
          <Field
            as={TextField}
            name={`entities.${index}.doubleAdd.right.exploreText`}
            label='EXPLORE TEXT'
            fullwidth
          />
        </Box>
      </Grid>
    </>
  );
};
