import { common_Media, common_ProductFull } from "api/proto-http/admin";


export interface ProductIdMediaProps {
    product?: common_ProductFull | undefined
    setProduct?: React.Dispatch<React.SetStateAction<common_ProductFull | undefined>>
    media?: common_Media[] | undefined
    setMedia?: React.Dispatch<React.SetStateAction<common_Media[]>>
    id?: string
    reload?: () => void
    closeThumbnailPicker?: () => void
}