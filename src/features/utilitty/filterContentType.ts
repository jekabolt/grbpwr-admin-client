
import { fileExtensionToContentType } from "./filterExtentions";

export const isVideo = (mediaUrl: string | undefined) => {
    if (mediaUrl) {
        const extension = mediaUrl.split('.').pop()?.toLowerCase();

        if (extension) {
            const contentType = fileExtensionToContentType[extension];
            return contentType?.startsWith('video/');
        }
    }
    return false;
};