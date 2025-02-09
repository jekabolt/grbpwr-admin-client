
import { common_MediaFull, common_MediaItem } from 'api/proto-http/admin';
import { FormikProps } from 'formik';
import { Dispatch, SetStateAction } from 'react';

export interface MediaSelectorLayoutProps {
    label: string
    allowMultiple: boolean;
    aspectRatio?: string[];
    hideVideos?: boolean;
    isDeleteAccepted?: boolean;
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
    hideNavBar?: boolean
    select: (imageUrl: common_MediaFull, allowMultiple: boolean, formik?: FormikProps<any>) => void

}

export interface MediaSelectorMediaListProps {
    allowMultiple: boolean;
    selectedMedia: common_MediaFull[] | undefined;
    height?: string | number;
    enableModal?: boolean;
    croppedImage: string | null
    aspectRatio?: string[]
    hideVideos?: boolean
    isDeleteAccepted?: boolean;
    setCroppedImage: (img: string | null) => void
    select: (imageUrl: common_MediaFull, allowMultiple: boolean) => void;
    handleUploadMedia: () => Promise<void>
}

export interface UploadMediaByUrlProps {
    url: string;
    setUrl: React.Dispatch<React.SetStateAction<string>>;
}

export interface FullSizeMediaModalInterface {
    open: boolean;
    croppedImage: string | null
    clickedMedia: common_MediaItem | undefined
    setCroppedImage: (img: string | null) => void
    close: () => void;
    handleUploadMedia: () => Promise<void>
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
