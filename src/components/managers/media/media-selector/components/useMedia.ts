import { common_MediaFull } from "api/proto-http/admin";
import { mediaAspectRatio } from "lib/features/aspect-ratio";
import { isVideo } from "lib/features/filterContentType";
import { useState } from "react";

type MediaTypeFilter = 'all' | 'image' | 'video';
type SortOrder = 'asc' | 'desc';
type VideoSizes = Record<number, { width: number; height: number }>;

interface UseMediaProps {
    media: common_MediaFull[];
    hideVideos?: boolean;
    aspectRatio?: string[];
}

export function useMedia({ media, hideVideos, aspectRatio }: UseMediaProps) {
    const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>('all');
    const [orderFilter, setOrderFilter] = useState<SortOrder>('desc');
    const [videoSizes, setVideoSizes] = useState<VideoSizes>({});

    const handleVideoLoad = (mediaId: number, event: React.SyntheticEvent<HTMLVideoElement>) => {
        const video = event.target as HTMLVideoElement;
        setVideoSizes(prev => ({
            ...prev,
            [mediaId]: {
                width: video.videoWidth,
                height: video.videoHeight,
            },
        }));
    };

    const getMediaUrl = (m: common_MediaFull) => m.media?.thumbnail?.mediaUrl;
    const isMediaVideo = (m: common_MediaFull) => isVideo(getMediaUrl(m));

    const matchesTypeFilter = (m: common_MediaFull) => {
        const isVideoMedia = isMediaVideo(m);
        switch (mediaTypeFilter) {
            case 'video': return isVideoMedia;
            case 'image': return !isVideoMedia;
            default: return true;
        }
    };

    const matchesAspectRatio = (m: common_MediaFull) => {
        if (!aspectRatio?.length) return true;

        const mediaRatio = mediaAspectRatio(m, videoSizes);
        return mediaRatio && aspectRatio.includes(mediaRatio);
    };

    const filtered = media.filter(m => {
        // Apply hideVideos filter first (most restrictive)
        if (hideVideos && isMediaVideo(m)) return false;

        // Apply type filter
        if (!matchesTypeFilter(m)) return false;

        // Apply aspect ratio filter
        return matchesAspectRatio(m);
    });

    // Sort by creation date
    const filteredMedia = filtered.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return orderFilter === 'desc' ? bTime - aTime : aTime - bTime;
    });

    return {
        mediaTypeFilter,
        orderFilter,
        videoSizes,
        filteredMedia,
        handleVideoLoad,
        setMediaTypeFilter,
        setOrderFilter,
    };
}