import { common_ProductFull } from "api/proto-http/admin";

export interface ProductIdMediaProps {
    product?: common_ProductFull
    setProduct?: React.Dispatch<React.SetStateAction<common_ProductFull>>
    id?: string
}