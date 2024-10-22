import { Button, Divider, Grid } from '@mui/material';
import { common_HeroFullInsert, common_MediaFull, common_Product } from 'api/proto-http/admin';
import { common_HeroEntity } from 'api/proto-http/frontend';
import { calculateAspectRatio } from 'features/utilitty/calculateAspectRatio';
import { FieldArrayRenderProps, useFormikContext } from 'formik';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/hero.scss';
import { removeEntityIndex } from '../utility/arrayHelpers';
import { getAllowedRatios } from '../utility/getAllowedRatios';
import { DoubleAdd } from './doubleAdd/doubleAdd';
import { FeaturedProduct } from './featuredProducts/featuredProduct';
import { MainAdd } from './mainAdd/mainAdd';
import { SingleAdd } from './singleAdd/singleAdd';

interface EntitiesProps {
  entities: common_HeroEntity[];
  entityRefs: React.MutableRefObject<{ [key: number]: HTMLDivElement | null }>;
  arrayHelpers: FieldArrayRenderProps;
}
export const Entities: FC<EntitiesProps> = ({ entityRefs, entities, arrayHelpers }) => {
  const { values, setFieldValue } = useFormikContext<common_HeroFullInsert>();
  const [main, setMain] = useState<string>('');
  const [single, setSingle] = useState<{ [key: number]: string }>({});
  const [doubleAdd, setDoubleAdd] = useState<{
    [key: number]: { left: string | undefined; right: string | undefined };
  }>({});
  const [product, setProduct] = useState<{ [key: number]: common_Product[] }>({});
  const [currentEntityIndex, setCurrentEntityIndex] = useState<number | null>(null);
  const [allowedRatios, setAllowedRatios] = useState<{ [key: number]: string[] }>({});
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenProductSelection = (index: number) => {
    setCurrentEntityIndex(index);
    setIsModalOpen(true);
  };
  const handleCloseModal = () => setIsModalOpen(false);

  const fetchEntities = () => {
    const mainAdd =
      entities.find((e) => e.mainAdd)?.mainAdd?.singleAdd?.media?.media?.thumbnail?.mediaUrl || '';
    const singleEntities = entities.reduce(
      (acc, e, i) => ({ ...acc, [i]: e.singleAdd?.media?.media?.thumbnail?.mediaUrl || '' }),
      {},
    );
    const doubleAddEntities = entities.reduce<{
      [key: number]: { left: string; right: string };
    }>(
      (acc, e, i) => ({
        ...acc,
        [i]: e.doubleAdd
          ? {
              left: e.doubleAdd.left?.media?.media?.thumbnail?.mediaUrl || '',
              right: e.doubleAdd.right?.media?.media?.thumbnail?.mediaUrl || '',
            }
          : { left: '', right: '' },
      }),
      {},
    );
    const productsForEntities = entities.reduce(
      (acc, e, i) => ({ ...acc, [i]: e.featuredProducts?.products || [] }),
      {},
    );

    const calculatedAllowedRatios = entities.reduce<{ [key: number]: string[] }>((acc, e, i) => {
      const allowedRatios = getAllowedRatios(e);
      if (allowedRatios.length > 0) {
        acc[i] = allowedRatios;
      }
      return acc;
    }, {});

    setMain(mainAdd);
    setSingle(singleEntities);
    setDoubleAdd(doubleAddEntities);
    setProduct(productsForEntities);
    setAllowedRatios(calculatedAllowedRatios);
  };

  useEffect(() => {
    fetchEntities();
  }, [entities]);

  const handleProductsReorder = (newProductsOrder: common_Product[], index: number) => {
    setProduct((prevState) => ({
      ...prevState,
      [index]: newProductsOrder,
    }));
  };

  const handleSaveNewSelection = (newSelectedProducts: common_Product[], index: number) => {
    const productIds = newSelectedProducts.map((product) => product.id);
    setFieldValue(`entities.${index}.featuredProducts.productIds`, productIds);
    setProduct((prevState) => ({
      ...prevState,
      [index]: newSelectedProducts,
    }));

    handleCloseModal();
  };

  const saveMainMedia = (selectedMedia: common_MediaFull[], index: number) => {
    const newMainMedia = selectedMedia[0];
    setFieldValue(`entities.${index}.mainAdd.singleAdd.mediaId`, newMainMedia.id);
    setMain(newMainMedia.media?.thumbnail?.mediaUrl || '');
  };

  const saveSingleMedia = (selectedMedia: common_MediaFull[], index: number) => {
    const newSingleMedia = selectedMedia[0];
    setFieldValue(`entities.${index}.singleAdd.mediaId`, newSingleMedia.id);
    setSingle((prev) => ({
      ...prev,
      [index]: newSingleMedia.media?.thumbnail?.mediaUrl || '',
    }));
  };

  const saveDoubleMedia = (
    selectedMedia: common_MediaFull[],
    side: 'left' | 'right',
    index: number,
  ) => {
    if (!selectedMedia.length) return;

    const newDoubleMediaUrl = selectedMedia[0].media?.thumbnail?.mediaUrl;
    const doubleAddMediaId = selectedMedia[0].id;
    const ratio = calculateAspectRatio(
      selectedMedia[0].media?.thumbnail?.width,
      selectedMedia[0].media?.thumbnail?.height,
    );

    let newAllowedRatios = ['4:5', '1:1'];
    if (ratio === '4:5') {
      newAllowedRatios = ['4:5'];
    } else if (ratio === '1:1') {
      newAllowedRatios = ['1:1'];
    }

    setDoubleAdd((prevDoubleAdd) => ({
      ...prevDoubleAdd,
      [index]: {
        ...prevDoubleAdd[index],
        [side]: newDoubleMediaUrl,
      },
    }));

    setAllowedRatios((prevRatios) => ({
      ...prevRatios,
      [index]: newAllowedRatios,
    }));

    setFieldValue(`entities.${index}.doubleAdd.${side}.mediaId`, doubleAddMediaId);
  };

  const handleRemoveEntity = (index: number, arrayHelpers: any, values: any) => {
    if (values.entities[index].type === 'HERO_TYPE_MAIN_ADD') {
      setMain('');
    }
    setSingle((prevSingle) => removeEntityIndex(prevSingle, index));
    setDoubleAdd((prevDoubleAdd) => removeEntityIndex(prevDoubleAdd, index));
    setProduct((prevProduct) => removeEntityIndex(prevProduct, index));

    arrayHelpers.remove(index);
  };

  return (
    <Grid container spacing={2} marginTop={5}>
      {values.entities &&
        values.entities.map((entity, index) => (
          <Grid item xs={12} ref={(el) => (entityRefs.current[index] = el)}>
            <Grid container spacing={2} className={styles.entity_container}>
              {entity.type === 'HERO_TYPE_MAIN_ADD' && (
                <MainAdd index={index} entity={entity} link={main} saveMedia={saveMainMedia} />
              )}
              {entity.type === 'HERO_TYPE_SINGLE_ADD' && (
                <SingleAdd
                  index={index}
                  entity={entity}
                  singleLink={single}
                  saveMedia={saveSingleMedia}
                />
              )}
              {entity.type === 'HERO_TYPE_DOUBLE_ADD' && (
                <DoubleAdd
                  index={index}
                  entity={entity}
                  doubleLinks={doubleAdd}
                  allowedRatios={allowedRatios}
                  saveDoubleMedia={saveDoubleMedia}
                />
              )}
              {entity.type === 'HERO_TYPE_FEATURED_PRODUCTS' && (
                <FeaturedProduct
                  index={index}
                  entity={entity}
                  product={product}
                  isModalOpen={isModalOpen}
                  currentEntityIndex={currentEntityIndex}
                  handleCloseModal={handleCloseModal}
                  handleSaveNewSelection={handleSaveNewSelection}
                  handleProductsReorder={handleProductsReorder}
                  handleOpenProductSelection={handleOpenProductSelection}
                />
              )}
              <Grid item xs={12} md={10}>
                <Button
                  variant='contained'
                  color='error'
                  onClick={() => {
                    handleRemoveEntity(index, arrayHelpers, values);
                  }}
                >
                  Remove Entity
                </Button>
              </Grid>
              <Grid item xs={12} md={10} className={styles.divider_container}>
                <Divider className={styles.divider} />
              </Grid>
            </Grid>
          </Grid>
        ))}
    </Grid>
  );
};