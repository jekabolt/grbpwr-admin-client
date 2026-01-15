import { useEffect, useState } from 'react';
import { HeroSchema } from './schema';

interface MediaUrls {
  main: { landscape: string; portrait: string };
  single: Record<number, { landscape: string; portrait: string }>;
  double: Record<number, { left: string; right: string }>;
}

export function useEntityMedia(entities: HeroSchema['entities']) {
  const [mediaUrls, setMediaUrls] = useState<MediaUrls>({
    main: { landscape: '', portrait: '' },
    single: {},
    double: {},
  });

  useEffect(() => {
    const urls = entities.reduce<MediaUrls>(
      (acc, entity, index) => {
        switch (entity.type) {
          case 'HERO_TYPE_MAIN':
            acc.main = {
              landscape: entity.main?.mediaLandscapeUrl || '',
              portrait: entity.main?.mediaPortraitUrl || '',
            };
            break;

          case 'HERO_TYPE_SINGLE':
            acc.single[index] = {
              landscape: entity.single?.mediaLandscapeUrl || '',
              portrait: entity.single?.mediaPortraitUrl || '',
            };
            break;

          case 'HERO_TYPE_DOUBLE':
            acc.double[index] = {
              left: entity.double?.left?.mediaLandscapeUrl || '',
              right: entity.double?.right?.mediaLandscapeUrl || '',
            };
            break;
        }
        return acc;
      },
      {
        main: { landscape: '', portrait: '' },
        single: {},
        double: {},
      },
    );

    setMediaUrls(urls);
  }, [entities]);

  return mediaUrls;
}
