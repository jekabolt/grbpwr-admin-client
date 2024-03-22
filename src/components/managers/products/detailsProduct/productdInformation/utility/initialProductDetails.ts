import { common_ProductFull } from "api/proto-http/admin";

export const initialProductDetails = (product: common_ProductFull | undefined) => ({
    name: product?.product?.productInsert?.name,
    description: product?.product?.productInsert?.description,
    price: product?.product?.productInsert?.price?.value
})