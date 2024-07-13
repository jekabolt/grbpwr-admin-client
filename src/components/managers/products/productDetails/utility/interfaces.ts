import { common_MediaFull, common_ProductFull } from 'api/proto-http/admin';

export interface ProductIdProps {
    product: common_ProductFull | undefined;
}

export interface BasicProductInterface {
    product: common_ProductFull | undefined;
}

export interface MediaViewComponentsProps {
    link: string | undefined;
    saveSelectedMedia: (newSelectedMedia: common_MediaFull[]) => void;
}

export interface MediaListProps {
    product: common_ProductFull | undefined;
    mediaPreview: common_MediaFull[];
    deleteMediaFromProduct: (id: number | undefined) => void;
    saveSelectedMedia: (newSelectedMedia: common_MediaFull[]) => void;
}
