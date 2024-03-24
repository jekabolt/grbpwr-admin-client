import { common_ProductFull } from "api/proto-http/admin";

export const initialProductDetails = (product: common_ProductFull | undefined) => ({
    name: product?.product?.productInsert?.name,
    description: product?.product?.productInsert?.description,
    price: product?.product?.productInsert?.price?.value,
    salePercentage: product?.product?.productInsert?.salePercentage?.value,
    preorder: product?.product?.productInsert?.preorder,
    brand: product?.product?.productInsert?.brand,
    sku: product?.product?.productInsert?.sku,
    color: product?.product?.productInsert?.color,
    colorHex: product?.product?.productInsert?.colorHex,
    contryOfOrigin: product?.product?.productInsert?.countryOfOrigin,
    categoryId: product?.product?.productInsert?.categoryId,
    targetGender: product?.product?.productInsert?.targetGender,
    hidden: product?.product?.productInsert?.hidden
})