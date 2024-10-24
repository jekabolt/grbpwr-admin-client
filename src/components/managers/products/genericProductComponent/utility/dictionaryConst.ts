import { common_Genders, common_OrderFactors, common_SortFactors } from "api/proto-http/admin";

export const genderOptions: common_Genders[] = [
    { id: 'GENDER_ENUM_MALE', name: 'Male' },
    { id: 'GENDER_ENUM_FEMALE', name: 'Female' },
    { id: 'GENDER_ENUM_UNISEX', name: 'Unisex' },
];


export const sortFactors: common_SortFactors[] = [
    { id: 'SORT_FACTOR_CREATED_AT', name: 'Created At' },
    { id: 'SORT_FACTOR_UPDATED_AT', name: 'Updated At' },
    { id: 'SORT_FACTOR_NAME', name: 'Name' },
    { id: 'SORT_FACTOR_PRICE', name: 'Price' },
]

export const orderFactors: common_OrderFactors[] = [
    { id: 'ORDER_FACTOR_ASC', name: 'Ascending' },
    { id: 'ORDER_FACTOR_DESC', name: 'Descending' },
]