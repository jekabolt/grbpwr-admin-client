import { common_ProductFull } from "api/proto-http/admin";



export const getInitialFormData = (product: common_ProductFull | undefined) => ({
    name: product?.product?.productInsert?.name,
    description: product?.product?.productInsert?.description,
    salePercentage: product?.product?.productInsert?.salePercentage?.value
});