
import { common_Media, common_MediaInsert } from 'api/proto-http/admin';

export interface MediaSelectorLayoutProps {
    label: string
    saveSelectedMedia: (newSelectedMedia: string[]) => void;
    allowMultiple: boolean;
}

export interface MediaSelectorProps {
    closeMediaSelector: () => void;
    saveSelectedMedia: (newSelectedMedia: string[]) => void;
    allowMultiple: boolean;
}

export interface MediaSelectorMediaListProps {
    media: common_Media[] | undefined;
    setMedia: React.Dispatch<React.SetStateAction<common_Media[]>>;
    allowMultiple: boolean;
    selectedMedia: { url: string; type: string }[] | undefined;
    select: (imageUrl: string, allowMultiple: boolean) => void;
    height?: string | number;
    sortedAndFilteredMedia: () => common_Media[];
    enableModal?: boolean;
}

export interface UploadMediaByUrlProps {
    url: string;
    setUrl: React.Dispatch<React.SetStateAction<string>>;
    updateContentLink: () => void;
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
    clickedMedia: common_MediaInsert | undefined;
}
