import { common_ProductFull } from "api/proto-http/admin";

export interface ProductIdProps {
    id: string
    product: common_ProductFull | undefined
    fetchProduct: () => void
}

export interface MediaViewComponentsProps {
    product: common_ProductFull | undefined
    handleSelectedMedia: () => void
    saveSelectedMedia: (newSelectedMedia: string[]) => void
    fetchProduct?: () => void
}