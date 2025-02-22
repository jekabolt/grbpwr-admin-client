import { common_MediaFull, common_MediaItem } from 'api/proto-http/admin';
import { FormikProps } from 'formik';
import { Dispatch, SetStateAction } from 'react';

export interface MediaSelectorLayoutProps {
    label: string
    allowMultiple: boolean;
    aspectRatio?: string[];
    hideVideos?: boolean;
    isDeleteAccepted?: boolean;
    className?: string;
    saveSelectedMedia: (newSelectedMedia: common_MediaFull[]) => void;
}

export interface MediaSelectorModalProps {
    allowMultiple: boolean;
    aspectRatio?: string[];
    hideVideos?: boolean;
    isDeleteAccepted?: boolean;
    closeMediaSelector: () => void;
    saveSelectedMedia: (newSelectedMedia: common_MediaFull[]) => void;
}

export interface MediaSelectorInterface {
    allowMultiple: boolean;
    selectedMedia: common_MediaFull[] | undefined;
    enableModal?: boolean
    aspectRatio?: string[]
    hideVideos?: boolean
    isDeleteAccepted?: boolean;
    select: (imageUrl: common_MediaFull, allowMultiple: boolean, formik?: FormikProps<any>) => void

}

export interface MediaSelectorMediaListProps {
    allowMultiple: boolean;
    selectedMedia: common_MediaFull[] | undefined;
    height?: string | number;
    enableModal?: boolean;
    aspectRatio?: string[]
    hideVideos?: boolean
    isDeleteAccepted?: boolean;
    select: (imageUrl: common_MediaFull, allowMultiple: boolean) => void;
    onModalStateChange?: (isOpen: boolean) => void;
}

export interface FullSizeMediaModalInterface {
    open: boolean;
    clickedMedia: common_MediaItem | undefined
    close: () => void;
}

export interface PreviewMediaForUploadInterface {
    b64Media: string;
    croppedImage: string | null;
    isCropperOpen: boolean;
    isMediaSelector: boolean
    handleUploadMedia: () => Promise<void>;
    setCroppedImage: (img: string | null) => void;
    setIsCropperOpen: Dispatch<SetStateAction<boolean>>;
    clear: () => void;
}
