import { common_Media } from "api/proto-http/admin"

export interface MediaSelectorLayoutProps {
    label: string
    saveSelectedMedia: (newSelectedMedia: string[]) => void
    allowMultiple: boolean
}


export interface MediaSelectorProps {
    closeMediaSelector: () => void
    saveSelectedMedia: (newSelectedMedia: string[]) => void
    allowMultiple: boolean
}

export interface MediaSelectorMediaListProps {
    media: common_Media[] | undefined
    setMedia: React.Dispatch<React.SetStateAction<common_Media[]>>
    allowMultiple: boolean
    selectedMedia: { url: string, type: string }[] | undefined;
    select: (imageUrl: string, allowMultiple: boolean) => void
    height?: string | number
}

export interface MediaSelectorUploadMediaByUrByDragDropProps {
    url: string
    setUrl: React.Dispatch<React.SetStateAction<string>>
    updateContentLink: () => void
    reload: () => void
    closeMediaSelector: () => void
}

export interface UploadMediaByUrlProps {
    url: string
    setUrl: React.Dispatch<React.SetStateAction<string>>
    updateContentLink: () => void
    closeMediaSelector: () => void
}