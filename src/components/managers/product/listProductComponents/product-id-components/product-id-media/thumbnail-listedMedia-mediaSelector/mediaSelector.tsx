import { Grid } from '@mui/material';
import { getAllUploadedFiles } from 'api/admin';
import { common_Media } from 'api/proto-http/admin';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/product-id-media.scss';
import { ThumbnailProps } from '../../interfaces-type/thumbnailInterface';
import { MediaPicker } from './media-selector-components/media-picker';

export const MediaSelector: FC<ThumbnailProps> = ({ mediaFile }) => {
  const [media, setMedia] = useState<common_Media[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    fetchMedia();
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY + 300 >= document.documentElement.offsetHeight &&
        !isLoading &&
        hasMore
      ) {
        fetchMedia();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoading, hasMore]);

  const fetchMedia = async () => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    const limit = 5;
    const response = await getAllUploadedFiles({
      limit: limit,
      offset: offset,
      orderFactor: 'ORDER_FACTOR_ASC',
    });
    const newFiles = response.list || [];
    const uniqueNewFiles = newFiles.filter((newFile) =>
      media?.every((m) => m.media?.fullSize !== newFile.media?.fullSize),
    );
    setMedia((prevFiles) => [...prevFiles, ...uniqueNewFiles]);
    setOffset((prevOffset) => prevOffset + uniqueNewFiles.length);
    setHasMore(uniqueNewFiles.length === limit);
    setIsLoading(false);
  };
  return (
    <div className={styles.product_id_media_selector_overlay}>
      <Grid container className={styles.product_id_media_selector_container}>
        <Grid item xs={6}>
          <h3>hui</h3>
        </Grid>
        <Grid item xs={6}>
          <MediaPicker mediaFile={media} isLoading={isLoading} />
        </Grid>
      </Grid>
    </div>
  );
};
