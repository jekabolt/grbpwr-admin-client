import { common_ProductFull } from "api/proto-http/admin";

export interface ProductIdProps {
    id: string
    product: common_ProductFull | undefined
    setProduct: React.Dispatch<React.SetStateAction<common_ProductFull | undefined>>
    fetchProduct: () => void
}

export interface MediaViewComponentsProps {
    product: common_ProductFull | undefined
    url: string
    setUrl: React.Dispatch<React.SetStateAction<string>>
    updateMediaByUrl: () => void
    handleSelectedMedia: () => void
    selectedMedia: string[]
    select: (imageUrl: string, allowMultiple: boolean) => void
    fetchProduct?: () => void
}