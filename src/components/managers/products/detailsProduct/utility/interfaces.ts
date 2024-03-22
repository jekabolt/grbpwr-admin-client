import { common_ProductFull } from "api/proto-http/admin";

export interface ProductIdProps {
    id: string
    product: common_ProductFull | undefined
    fetchProduct: () => void
}

export interface MediaViewComponentsProps {
    link: string | undefined
    saveSelectedMedia: (newSelectedMedia: string[]) => void
}


export interface MediaListProps {
    product: common_ProductFull | undefined
    saveSelectedMedia: (newSelectedMedia: string[]) => void
    fetchProduct: () => void
}

