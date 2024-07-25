
import { common_MediaFull, common_MediaItem } from 'api/proto-http/admin';
import { Dispatch, SetStateAction } from 'react';

export interface MediaSelectorLayoutProps {
    label: string
    isEditMode?: boolean;
    allowMultiple: boolean;
    aspectRatio?: string[];
    hideVideos?: boolean;
    saveSelectedMedia: (newSelectedMedia: common_MediaFull[]) => void;
}

export interface MediaSelectorModalProps {
    allowMultiple: boolean;
    aspectRatio?: string[];
    hideVideos?: boolean;
    closeMediaSelector: () => void;
    saveSelectedMedia: (newSelectedMedia: common_MediaFull[]) => void;
}

export interface MediaSelectorInterface {
    allowMultiple: boolean;
    selectedMedia: common_MediaFull[] | undefined;
    enableModal?: boolean
    aspectRatio?: string[]
    hideVideos?: boolean
    select: (imageUrl: common_MediaFull, allowMultiple: boolean) => void

}

export interface MediaSelectorMediaListProps {
    media: common_MediaFull[] | undefined;
    allowMultiple: boolean;
    selectedMedia: common_MediaFull[] | undefined;
    height?: string | number;
    enableModal?: boolean;
    croppedImage: string | null
    aspectRatio?: string[]
    hideVideos?: boolean
    setCroppedImage: (img: string | null) => void
    select: (imageUrl: common_MediaFull, allowMultiple: boolean) => void;
    setMedia: React.Dispatch<React.SetStateAction<common_MediaFull[]>>;
    sortedAndFilteredMedia: () => common_MediaFull[];
    handleUploadMedia: () => Promise<void>
}

export interface UploadMediaByUrlProps {
    url: string;
    isLoading: boolean;
    setUrl: React.Dispatch<React.SetStateAction<string>>;
}

export interface FilterMediasInterface {
    filterByType: string;
    sortByDate: string;
    setFilterByType: React.Dispatch<React.SetStateAction<string>>;
    setSortByDate: React.Dispatch<React.SetStateAction<string>>;
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
    handleUploadMedia: () => Promise<void>;
    setCroppedImage: (img: string | null) => void;
    setIsCropperOpen: Dispatch<SetStateAction<boolean>>;
    clear: () => void;
}
