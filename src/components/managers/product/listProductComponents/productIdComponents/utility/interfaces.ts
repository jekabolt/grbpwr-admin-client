import { common_Media, common_ProductFull } from "api/proto-http/admin";



export interface MediaWrapperProps {
    product: common_ProductFull | undefined
    setProduct: React.Dispatch<React.SetStateAction<common_ProductFull | undefined>>
    id: string
    fetchProduct: () => void
}

export interface MediaComponentProps {
    product: common_ProductFull | undefined
    media: common_Media[] | undefined
    setMedia: React.Dispatch<React.SetStateAction<common_Media[]>>
    reload: () => void
    handleImage: () => void
    select: (imageUrl: string | null) => void
    selectedThumbnail: string | null
    url: string
    setUrl: React.Dispatch<React.SetStateAction<string>>
    updateNewMediaByUrl: () => void
}

export interface MediaPickerComponents {
    media: common_Media[] | undefined
    setMedia: React.Dispatch<React.SetStateAction<common_Media[]>>
    reload: () => void
    handleImage: () => void
    select: (imageUrl: string | null) => void
    selectedThumbnail: string | null
    url: string
    setUrl: React.Dispatch<React.SetStateAction<string>>
    updateNewMediaByUrl: () => void
    closeThumbnailPicker: () => void
}

export interface MediaPickerByUrlProps {
    reload?: () => void
    url: string
    setUrl: React.Dispatch<React.SetStateAction<string>>
    updateNewMediaByUrl: () => void
}

export interface MediaPickerSelectProps {
    media: common_Media[] | undefined
    setMedia: React.Dispatch<React.SetStateAction<common_Media[]>>
    select: (imageUrl: string | null) => void
    handleImage: () => void
    selectedThumbnail: string | null
}

export interface MediaListProps {
    product: common_ProductFull | undefined
    setProduct: React.Dispatch<React.SetStateAction<common_ProductFull | undefined>>
    media: common_Media[] | undefined
    setMedia: React.Dispatch<React.SetStateAction<common_Media[]>>
    reload: () => void
    handleImage: () => void
    select: (imageUrl: string | number | undefined) => void
    selectedMedia: string[] | undefined
    url: string
    setUrl: React.Dispatch<React.SetStateAction<string>>
    updateNewMediaByUrl: () => void
    fetchProduct: () => void
}

export interface MediaListPickerComponents {
    media: common_Media[] | undefined
    setMedia: React.Dispatch<React.SetStateAction<common_Media[]>>
    reload: () => void
    handleImage: () => void
    select: (imageUrl: string | number | undefined) => void
    selectedMedia: string[] | undefined
    url: string
    setUrl: React.Dispatch<React.SetStateAction<string>>
    updateNewMediaByUrl: () => void
    closeThumbnailPicker: () => void
}

export interface MediaListPickerSelectComponetns {
    media: common_Media[] | undefined
    setMedia: React.Dispatch<React.SetStateAction<common_Media[]>>
    select: (imageUrl: string | number | undefined) => void
    selectedMedia: string[] | undefined
    handleImage: () => void
}
