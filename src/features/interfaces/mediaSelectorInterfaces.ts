import { common_Media } from "api/proto-http/admin"

export interface MediaSelectorLayoutProps {
    label: string
    url: string
    setUrl: React.Dispatch<React.SetStateAction<string>>
    updateMediaByUrl: () => void
    handleSelectedMedia: () => void
    allowMultiple: boolean
    selectedMedia: string[] | undefined
    select: (imageUrl: string, allowMultiple: boolean) => void
}


export interface MediaSelectorProps {
    url: string
    setUrl: React.Dispatch<React.SetStateAction<string>>
    updateMediaByUrl: () => void
    handleSelectedMedia: () => void
    closeMediaSelecor: () => void
    allowMultiple: boolean
    selectedMedia: string[] | undefined
    select: (imageUrl: string, allowMultiple: boolean) => void
}

export interface MediaSelectorMediaListProps {
    media: common_Media[] | undefined
    setMedia: React.Dispatch<React.SetStateAction<common_Media[]>>
    handleSelectedMedia: () => void
    allowMultiple: boolean
    selectedMedia: string[] | undefined
    select: (imageUrl: string, allowMultiple: boolean) => void
}

export interface MediaSelectorUploadMediaByUrByDragDropProps {
    url: string
    reload: () => void
    updateMediaByUrl: () => void
    setUrl: React.Dispatch<React.SetStateAction<string>>
}

export interface UploadMediaByUrlProps {
    url: string
    updateMediaByUrl: () => void
    setUrl: React.Dispatch<React.SetStateAction<string>>
}