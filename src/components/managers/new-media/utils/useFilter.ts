import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { useState } from 'react';
import { VideoSize } from '..';
import { mediaAspectRatio } from './calculate-aspect';

export type FilterType = 'all' | 'image' | 'video';
export type SortOrder = 'asc' | 'desc';

export const FILTER_TYPES = ['all', 'image', 'video'] as const;
export const SORT_ORDERS = ['asc', 'desc'] as const;

export function useFilter(
  media?: common_MediaFull[],
  aspectRatio?: string[],
  videoSizes: Record<number, VideoSize> = {},
) {
  const [type, setType] = useState<FilterType>('all');
  const [order, setOrder] = useState<SortOrder>('desc');

  function matchesTypeFilter(m: common_MediaFull) {
    const isVideoMedia = isVideo(m.media?.thumbnail?.mediaUrl);
    switch (type) {
      case 'video':
        return isVideoMedia;
      case 'image':
        return !isVideoMedia;
      default:
        return true;
    }
  }

  const matchesAspectRatioFilter = (m: common_MediaFull) => {
    if (!aspectRatio?.length) return true;
    const mediaRatio = mediaAspectRatio(m, videoSizes);

    if (!mediaRatio) {
      const isVideoMedia = isVideo(m.media?.thumbnail?.mediaUrl);
      return isVideoMedia;
    }

    return aspectRatio.includes(mediaRatio);
  };

  const filtered = media?.filter((m) => {
    return matchesTypeFilter(m) && matchesAspectRatioFilter(m);
  });

  const filteredMedia = filtered?.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return order === 'desc' ? bTime - aTime : aTime - bTime;
  });

  return {
    filteredMedia,
    type,
    order,
    setType,
    setOrder,
  };
}
