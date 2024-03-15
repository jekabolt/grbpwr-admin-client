import { Grid } from '@mui/material';
import { getAllUploadedFiles } from 'api/admin';
import { common_Media } from 'api/proto-http/admin';
import { FC, useEffect, useState } from 'react';
import { ThumbnailProps } from '../interfaces-type/thumbnailInterface';
import { Thumbnail } from './media-selector-for-thumbnail/thumbnail';
import { ListedMedia } from './media-slector-for-listedMedia/listedMedia';

export const MediaWrapper: FC<ThumbnailProps> = ({ product, setProduct, id }) => {
  const [media, setMedia] = useState<common_Media[] | undefined>([]);
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
    setMedia((prevFiles) => [...(prevFiles || []), ...uniqueNewFiles]);
    setOffset((prevOffset) => prevOffset + uniqueNewFiles.length);
    setHasMore(uniqueNewFiles.length === limit);
    setIsLoading(false);
  };

  const reloadFiles = async () => {
    setIsLoading(true);
    setOffset(0);
    setHasMore(true);
    const response = await getAllUploadedFiles({
      limit: 10,
      offset: 0,
      orderFactor: 'ORDER_FACTOR_ASC',
    });
    const newFiles = response.list || [];
    setMedia(newFiles);
    setOffset(newFiles.length);
    setHasMore(newFiles.length > 0);
    setIsLoading(false);
  };
  return (
    <Grid container style={{ border: '1px solide black' }} direction='column' spacing={6}>
      <Grid item xs={4}>
        <Thumbnail product={product} setProduct={setProduct} id={id} />
      </Grid>
      <Grid item xs={8}>
        <ListedMedia product={product} setProduct={setProduct} id={id} />
      </Grid>
    </Grid>
  );
};
