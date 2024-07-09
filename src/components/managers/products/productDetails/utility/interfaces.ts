import { common_MediaFull, common_ProductFull } from "api/proto-http/admin";

export interface ProductIdProps {
    id: string
    product: common_ProductFull | undefined
    fetchProduct: () => void
    showMessage: (message: string, severity: 'success' | 'error') => void
}

export interface BasicProductInterface {
    product: common_ProductFull | undefined
    isEdit: boolean;

}

export interface MediaViewComponentsProps {
    link: string | undefined
    saveSelectedMedia: (newSelectedMedia: common_MediaFull[]) => void
}


export interface MediaListProps {
    product: common_ProductFull | undefined
    saveSelectedMedia: (newSelectedMedia: common_MediaFull[]) => void
    fetchProduct: () => void
}

