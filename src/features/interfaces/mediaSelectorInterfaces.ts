
import { common_MediaFull, common_MediaItem } from 'api/proto-http/admin';

export interface MediaSelectorLayoutProps {
    label: string
    saveSelectedMedia: (newSelectedMedia: common_MediaFull[]) => void;
    allowMultiple: boolean;
}

export interface MediaSelectorModalProps {
    closeMediaSelector: () => void;
    saveSelectedMedia: (newSelectedMedia: common_MediaFull[]) => void;
    allowMultiple: boolean;
}

export interface MediaSelectorInterface {
    allowMultiple: boolean;
    selectedMedia: common_MediaFull[] | undefined;
    select: (imageUrl: common_MediaFull, allowMultiple: boolean) => void
    enableModal?: boolean

}

export interface MediaSelectorMediaListProps {
    media: common_MediaFull[] | undefined;
    setMedia: React.Dispatch<React.SetStateAction<common_MediaFull[]>>;
    allowMultiple: boolean;
    selectedMedia: common_MediaFull[] | undefined;
    select: (imageUrl: common_MediaFull, allowMultiple: boolean) => void;
    height?: string | number;
    sortedAndFilteredMedia: () => common_MediaFull[];
    enableModal?: boolean;
}

export interface UploadMediaByUrlProps {
    url: string;
    setUrl: React.Dispatch<React.SetStateAction<string>>;
    isLoading: boolean;
}

export interface FilterMediasInterface {
    filterByType: string;
    sortByDate: string;
    setFilterByType: React.Dispatch<React.SetStateAction<string>>;
    setSortByDate: React.Dispatch<React.SetStateAction<string>>;
}

export interface FullSizeMediaModalInterface {
    open: boolean;
    close: () => void;
    clickedMedia: common_MediaItem | undefined
}
