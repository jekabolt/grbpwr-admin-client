import { common_GenderEnum, common_OrderFactor, common_OrderStatusEnum, common_SortFactor } from "api/proto-http/admin";

interface Colors {
    name: string;
    hex: string;
}

export const PAGE_SIZE = 16;

export const sortOptions: Array<{ value: common_SortFactor; label: string }> = [
    { value: 'SORT_FACTOR_CREATED_AT', label: 'Created At' },
    { value: 'SORT_FACTOR_PRICE', label: 'Price' },
    { value: 'SORT_FACTOR_UPDATED_AT', label: 'Updated At' },
    { value: 'SORT_FACTOR_NAME', label: 'Name' },
];

export const orderOptions: Array<{ value: common_OrderFactor; label: string }> = [
    { value: 'ORDER_FACTOR_ASC', label: 'Ascending' },
    { value: 'ORDER_FACTOR_DESC', label: 'Descending' },
];


export const genderOptions: Array<{ value: common_GenderEnum; label: string }> = [
    { value: 'GENDER_ENUM_FEMALE', label: 'women' },
    { value: 'GENDER_ENUM_MALE', label: 'men' },
    { value: 'GENDER_ENUM_UNISEX', label: 'unisex' },
];

export const statusOptions: Array<{ value: common_OrderStatusEnum, label: string }> = [
    { value: 'ORDER_STATUS_ENUM_PLACED', label: 'placed' },
    { value: 'ORDER_STATUS_ENUM_CONFIRMED', label: 'confirmed' },
    { value: 'ORDER_STATUS_ENUM_SHIPPED', label: 'shipped' },
    { value: 'ORDER_STATUS_ENUM_DELIVERED', label: 'delivered' },
    { value: 'ORDER_STATUS_ENUM_CANCELLED', label: 'cancelled' },
]

export const colors: Colors[] = [
    { "name": "Black", "hex": "#000000" },
    { "name": "White", "hex": "#FFFFFF" },
    { "name": "Red", "hex": "#FF0000" },
    { "name": "Blue", "hex": "#0000FF" },
    { "name": "Green", "hex": "#008000" },
    { "name": "Navy", "hex": "#000080" },
    { "name": "Gray", "hex": "#808080" },
    { "name": "Yellow", "hex": "#FFFF00" },
    { "name": "Pink", "hex": "#FFC0CB" },
    { "name": "Beige", "hex": "#F5F5DC" },
    { "name": "Crimson", "hex": "#DC143C" },
    { "name": "Orange", "hex": "#FFA500" },
    { "name": "Purple", "hex": "#800080" },
    { "name": "Teal", "hex": "#008080" },
    { "name": "Lime", "hex": "#00FF00" },
    { "name": "Silver", "hex": "#C0C0C0" },
    { "name": "Maroon", "hex": "#800000" },
    { "name": "Olive", "hex": "#808000" },
    { "name": "Brown", "hex": "#A52A2A" },
    { "name": "Gold", "hex": "#FFD700" },
    { "name": "Cyan", "hex": "#00FFFF" },
    { "name": "Magenta", "hex": "#FF00FF" },
    { "name": "Ivory", "hex": "#FFFFF0" },
    { "name": "Coral", "hex": "#FF7F50" },
    { "name": "Chocolate", "hex": "#D2691E" },
    { "name": "Mint Green", "hex": "#98FF98" },
    { "name": "Light Blue", "hex": "#ADD8E6" },
    { "name": "Peach", "hex": "#FFE5B4" },
    { "name": "Lavender", "hex": "#E6E6FA" },
    { "name": "Turquoise", "hex": "#40E0D0" },
    { "name": "Indigo", "hex": "#4B0082" },
    { "name": "Mustard", "hex": "#FFDB58" },
    { "name": "Plum", "hex": "#DDA0DD" },
    { "name": "Violet", "hex": "#EE82EE" },
    { "name": "Sand", "hex": "#C2B280" },
    { "name": "Off White", "hex": "#F8F8FF" },
    { "name": "Hot Pink", "hex": "#FF69B4" }
]


export const STATUS = {
    confirmed: 'bg-green-300',
    denied: 'bg-red-300',
};