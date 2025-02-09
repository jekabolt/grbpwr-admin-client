import { common_MediaFull } from "api/proto-http/admin";
import { isVideo } from "./filterContentType";

export const calculateAspectRatio = (width?: number, height?: number): string | undefined => {
    if (!width || !height) return undefined;

    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(width, height);

    return `${width / divisor}:${height / divisor}`;
};


export const fetchVideoSizes = async (mediaItems: common_MediaFull[]) => {
    const sizes: Record<number, { width: number; height: number }> = {};

    for (const media of mediaItems) {
        const mediaUrl = media.media?.thumbnail?.mediaUrl;
        if (isVideo(mediaUrl)) {
            const video = document.createElement('video');
            video.src = mediaUrl || '';

            await new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    sizes[media.id || 0] = { width: video.videoWidth, height: video.videoHeight };
                    resolve(true);
                };
            });
        }
    }

    return sizes;
};

export const mediaAspectRatio = (
    media: common_MediaFull,
    videoSizes: Record<number, { width: number; height: number }>,
) => {
    const width = media.media?.thumbnail?.width || videoSizes[media.id || 0]?.width;
    const height = media.media?.thumbnail?.height || videoSizes[media.id || 0]?.height;
    return calculateAspectRatio(width, height);
};

export const aspectRatioColor = (aspectRatio?: string) => {
    const colorMap: Record<string, string> = {
        '16:9': '#cc0000',
        '4:3': '#e69138',
        '2:1': '#c0c0c0',
        '1:1': '#f1c232',
        '4:5': '#6aa84f',
        '3:4': '#45818e',
        '5:4': '#3d85c6',
        '9:16': '#674ea7',
    };
    return colorMap[aspectRatio || ''] || '#808080';
};