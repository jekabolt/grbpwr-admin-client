import { common_Media, common_ProductFull } from "api/proto-http/admin";

export interface ThumbnailProps {
    product?: common_ProductFull | undefined,
    setProduct?: React.Dispatch<React.SetStateAction<common_ProductFull | undefined>>
    id?: string
    mediaFile?: common_Media[] | undefined
    isLoading?: boolean
}
