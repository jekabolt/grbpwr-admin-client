import z from 'zod';

const ItemSchema = z.object({
  productId: z.number().min(1, 'Product ID is required'),
  quantity: z.number().min(1, 'Quantity is required'),
  sizeId: z.number().min(1, 'Size ID is required'),
  customPrice: z.object({
    value: z.string().min(1, 'Custom price is required'),
  }),
});

const AddressSchema = z.object({
  country: z.string().min(1, 'Country is required'),
  state: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  addressLineOne: z.string().min(1, 'Address line one is required'),
  addressLineTwo: z.string().optional(),
  company: z.string().min(1, 'Company is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
});

const ShippingAddressSchema = AddressSchema;
const billingAddressSchema = AddressSchema;

const BuyerSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(1, 'Phone number is required'),
  receivePromoEmails: z.boolean(),
});

const baseCustomOrderSchema = z.object({
  items: z.array(ItemSchema).min(1, 'At least one item is required'),
  billingSameAsShipping: z.boolean(),
  shippingAddress: ShippingAddressSchema,
  billingAddress: billingAddressSchema,
  buyer: BuyerSchema,
  paymentMethod: z.enum(['PAYMENT_METHOD_NAME_ENUM_BANK_INVOICE', 'PAYMENT_METHOD_NAME_ENUM_CASH']),
  shipmentCarrierId: z.number().min(1, 'Shipment carrier is required'),
  shipmentCost: z.object({
    value: z.string().min(1, 'Shipment cost is required'),
  }),
});

export const customOrderSchema = baseCustomOrderSchema;
export type CustomOrderFormData = z.infer<typeof customOrderSchema>;

const emptyAddress = {
  country: '',
  state: '',
  city: '',
  addressLineOne: '',
  addressLineTwo: '',
  company: '',
  postalCode: '',
};

const emptyBuyer = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  receivePromoEmails: false,
};

export const defaultCustomOrder = {
  items: [] as CustomOrderFormData['items'],
  billingSameAsShipping: true,
  shippingAddress: emptyAddress,
  billingAddress: emptyAddress,
  buyer: emptyBuyer,
  paymentMethod: 'PAYMENT_METHOD_NAME_ENUM_BANK_INVOICE' as const,
  shipmentCarrierId: 0,
  shipmentCost: { value: '' },
};
