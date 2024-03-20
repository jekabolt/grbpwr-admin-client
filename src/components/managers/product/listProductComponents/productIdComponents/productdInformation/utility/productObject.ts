import { common_ProductInsert } from "api/proto-http/admin";

export const productIdInformation: common_ProductInsert = {
    preorder: '',
    name: '',
    brand: '',
    sku: '',
    color: '',
    colorHex: '',
    countryOfOrigin: '',
    thumbnail: '',
    price: { value: '0' },
    salePercentage: { value: '0' },
    categoryId: 0,
    description: '',
    hidden: false,
    targetGender: 'GENDER_ENUM_UNKNOWN',

}