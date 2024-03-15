import { common_Media, common_ProductFull } from "api/proto-http/admin";

export interface ThumbnailProps {
    product?: common_ProductFull | undefined,
    setProduct?: React.Dispatch<React.SetStateAction<common_ProductFull | undefined>>
    id?: string
    mediaFile?: common_Media[] | undefined
    setMediaFile?: React.Dispatch<React.SetStateAction<common_Media[] | undefined>>;
    isLoading?: boolean
    handleImage?: () => void
    imageUrl?: string;
    setImageUrl?: React.Dispatch<React.SetStateAction<string>>;
    selectedImage?: string[];
    setSelectedImage?: React.Dispatch<React.SetStateAction<string[]>>;
    reloadFile?: () => void
}
