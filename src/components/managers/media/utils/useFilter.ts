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
  initialType?: FilterType,
) {
  const [type, setType] = useState<FilterType>(initialType || 'all');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [search, setSearch] = useState('');

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

  // common_MediaFull carries no filename metadata (uploads go through the backend as raw
  // bytes, never a file name — see useUploadMedia) — the closest text every item actually has
  // is its own storage id/url, so matching against those is the only search the client can do
  // without a backend change. Still useful: pasting a copied url/id, or a remembered fragment
  // of it, finds the item instead of scrolling an unindexed grid.
  function matchesSearch(m: common_MediaFull) {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    if (m.id != null && String(m.id).includes(q)) return true;
    const urls = [
      m.media?.fullSize?.mediaUrl,
      m.media?.thumbnail?.mediaUrl,
      m.media?.compressed?.mediaUrl,
    ];
    return urls.some((u) => u?.toLowerCase().includes(q));
  }

  const matchesAspectRatioFilter = (m: common_MediaFull) => {
    if (!aspectRatio?.length) return true;

    const mediaRatio = mediaAspectRatio(m, videoSizes);

    if (!mediaRatio) {
      const isVideoMedia = isVideo(m.media?.thumbnail?.mediaUrl);
      return isVideoMedia;
    }

    const hasCustom = aspectRatio.includes('Custom');

    if (hasCustom) {
      const predefinedAspectRatios = ['16:9', '4:3', '2:1', '1:1', '4:5', '3:4', '5:4', '9:16'];

      if (!predefinedAspectRatios.includes(mediaRatio)) {
        return true;
      }
    }

    return aspectRatio.includes(mediaRatio);
  };

  const filtered = media?.filter((m) => {
    return matchesTypeFilter(m) && matchesAspectRatioFilter(m) && matchesSearch(m);
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
    search,
    setType,
    setOrder,
    setSearch,
  };
}
