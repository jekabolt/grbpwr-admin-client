import { common_MediaFull, common_ProductFull } from 'api/proto-http/admin';


export interface EditProductTagsAndMeasurements {
    isEditMode: boolean
}

export interface BasicProductInterface {
    product: common_ProductFull | undefined;
    isEditMode: boolean;
}

export interface MediaViewInterface {
    product: common_ProductFull | undefined;
    isEditMode: boolean
}

export interface SingleMediaView {
    link: string | undefined;
    isEditMode?: boolean
    saveSelectedMedia: (newSelectedMedia: common_MediaFull[]) => void;
}

export interface MediaListProps {
    product: common_ProductFull | undefined;
    isEditMode: boolean;
    mediaPreview: common_MediaFull[];
    deleteMediaFromProduct: (id: number | undefined) => void;
    saveSelectedMedia: (newSelectedMedia: common_MediaFull[]) => void;
}
