import { Button, Grid, TextField } from '@mui/material';
import { addHero, getHero } from 'api/hero';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/hero.scss';
import { common_HeroInsert, common_Product } from '../../../api/proto-http/admin';
import { SingleMediaViewAndSelect } from '../products/detailsProduct/mediaView/components/singleMediaViewAndSelect';
import { HeroProductTable } from './heroProductsTable';

export const Hero: FC = () => {
  const [mainContentLink, setMainContentLink] = useState<string | undefined>('');
  const [mainExploreLink, setMainExploreLink] = useState<string | undefined>('');
  const [mainExploreText, setMainExploreText] = useState<string | undefined>('');
  const [firstAdContentLink, setFirstAdContentLink] = useState<string | undefined>('');
  const [firstAdExploreLink, setFirstAdExploreLink] = useState<string | undefined>('');
  const [firstAdExploreText, setFirstAdExploreText] = useState<string | undefined>('');
  const [secondAdContentLink, setSecondAdContentLink] = useState<string | undefined>('');
  const [secondAdExploreLink, setSecondAdExploreLink] = useState<string | undefined>('');
  const [secondAdExploreText, setSecondAdExploreText] = useState<string | undefined>('');

  const [products, setProducts] = useState<common_Product[]>([]);

  useEffect(() => {
    const fetchHero = async () => {
      const response = await getHero({});
      setMainContentLink(response.hero?.main?.contentLink);
      setMainExploreLink(response.hero?.main?.exploreLink);
      setMainExploreText(response.hero?.main?.exploreText);

      if (response.hero?.ads) {
        if (response.hero.ads[0]) {
          setFirstAdContentLink(response.hero?.ads[0].contentLink);
          setFirstAdExploreLink(response.hero?.ads[0].exploreLink);
          setFirstAdExploreText(response.hero?.ads[0].exploreText);
        }
        if (response.hero.ads[1]) {
          setSecondAdContentLink(response.hero?.ads[1].contentLink);
          setSecondAdExploreLink(response.hero?.ads[1].exploreLink);
          setSecondAdExploreText(response.hero?.ads[1].exploreText);
        }
      }

      setProducts(response.hero?.productsFeatured ? response.hero?.productsFeatured : []);
    };
    fetchHero();
  }, []);

  const saveMainContentLink = (mediaLink: string[]) => {
    if (mediaLink[0]) {
      setMainContentLink(mediaLink[0]);
      return;
    }
    setMainContentLink(undefined);
  };

  const saveFirstAdContentLink = (mediaLink: string[]) => {
    if (mediaLink[0]) {
      setFirstAdContentLink(mediaLink[0]);
      return;
    }
    setFirstAdContentLink(undefined);
  };

  const saveSecondAdContentLink = (mediaLink: string[]) => {
    if (mediaLink[0]) {
      setSecondAdContentLink(mediaLink[0]);
      return;
    }
    setSecondAdContentLink(undefined);
  };

  const handleProductsReorder = (newProductsOrder: common_Product[]) => {
    setProducts(newProductsOrder);
  };

  const removeFirstAd = () => {
    setFirstAdContentLink(undefined);
    setFirstAdExploreLink(undefined);
    setFirstAdExploreText(undefined);
  };

  const removeSecondAd = () => {
    setSecondAdContentLink(undefined);
    setSecondAdExploreLink(undefined);
    setSecondAdExploreText(undefined);
  };

  const updateHero = async () => {
    let ads: common_HeroInsert[] = [];

    if (firstAdContentLink !== undefined) {
      ads.push({
        contentLink: firstAdContentLink,
        contentType: 'image',
        exploreLink: firstAdExploreLink,
        exploreText: firstAdExploreText,
      });
    }

    if (secondAdContentLink !== undefined) {
      ads.push({
        contentLink: secondAdContentLink,
        contentType: 'image',
        exploreLink: secondAdExploreLink,
        exploreText: secondAdExploreText,
      });
    }

    await addHero({
      main: {
        contentLink: mainContentLink,
        contentType: 'image',
        exploreLink: mainExploreLink,
        exploreText: mainExploreText,
      },
      ads: ads.length > 0 ? ads : undefined,
      productIds: products.map((x) => x.id!), //TO-DO add product picker or smth here
    });
  };

  return (
    <Layout>
      <div className={styles.hero}>
        <Grid container spacing={2} direction='column'>
          <Grid item xs={6}>
            <h2>Main</h2>
          </Grid>
          <Grid item xs={6}>
            <SingleMediaViewAndSelect
              link={mainContentLink}
              saveSelectedMedia={saveMainContentLink}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              size='small'
              label='Main explore link'
              value={mainExploreLink || ''}
              onChange={(e) => setMainExploreLink(e.target.value)}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              size='small'
              label='Main explore text'
              value={mainExploreText || ''}
              onChange={(e) => setMainExploreText(e.target.value)}
            />
          </Grid>
          <Grid item xs={6}>
            <h2>First ad</h2>
          </Grid>
          <Grid item xs={6}>
            {firstAdContentLink && (
              <Button variant='contained' onClick={removeSecondAd}>
                Remove
              </Button>
            )}
          </Grid>
          <Grid item xs={6}>
            <SingleMediaViewAndSelect
              link={firstAdContentLink}
              saveSelectedMedia={saveFirstAdContentLink}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              size='small'
              label='First ad explore link'
              value={firstAdExploreLink || ''}
              onChange={(e) => setFirstAdExploreLink(e.target.value)}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              size='small'
              label='First ad explore text'
              value={firstAdExploreText || ''}
              onChange={(e) => setFirstAdExploreText(e.target.value)}
            />
          </Grid>
          <Grid item xs={6}>
            <h2>Second ad</h2>
          </Grid>
          <Grid item xs={6}>
            {secondAdContentLink && (
              <Button variant='contained' onClick={removeSecondAd}>
                Remove
              </Button>
            )}
          </Grid>
          <Grid item xs={6}>
            <SingleMediaViewAndSelect
              link={secondAdContentLink}
              saveSelectedMedia={saveSecondAdContentLink}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              size='small'
              label='Second ad explore link'
              value={secondAdExploreLink || ''}
              onChange={(e) => setSecondAdExploreLink(e.target.value)}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              size='small'
              label='Second ad explore text'
              value={secondAdExploreText || ''}
              onChange={(e) => setSecondAdExploreText(e.target.value)}
            />
          </Grid>
          <Grid item xs={6}>
            <HeroProductTable
              products={products}
              onReorder={handleProductsReorder}
            ></HeroProductTable>
          </Grid>
          <Grid item xs={6}>
            <Button variant='contained' onClick={updateHero}>
              Save
            </Button>
          </Grid>
        </Grid>
      </div>
    </Layout>
  );
};
