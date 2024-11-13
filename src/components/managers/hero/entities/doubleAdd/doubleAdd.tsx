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
  const errorEntities = (errors?.entities || []) as any[];
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
              Boolean(errorEntities?.[index]?.doubleAdd?.left?.exploreLink) ||
              (entity?.doubleAdd.left.exploreLink &&
                !isValidUrlForHero(entity.doubleAdd.left.exploreLink))
            }
            helperText={
              errorEntities?.[index]?.doubleAdd?.left?.exploreLink
                ? errorEntities[index].doubleAdd.left.exploreLink
                : entity?.doubleAdd?.left?.exploreLink &&
                    !isValidUrlForHero(entity.doubleAdd.left.exploreLink)
                  ? 'URL is not from the allowed domain but will be saved with a warning'
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
              Boolean(errorEntities?.[index]?.doubleAdd?.right?.exploreLink) ||
              (entity?.doubleAdd.right.exploreLink &&
                !isValidUrlForHero(entity.doubleAdd.right.exploreLink))
            }
            helperText={
              errorEntities?.[index]?.doubleAdd?.right?.exploreLink
                ? errorEntities[index].doubleAdd.right.exploreLink
                : entity?.doubleAdd?.right?.exploreLink &&
                    !isValidUrlForHero(entity.doubleAdd.right.exploreLink)
                  ? 'URL is not from the allowed domain but will be saved with a warning'
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