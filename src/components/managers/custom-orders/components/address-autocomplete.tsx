// 'use client';

// import { Autocomplete, useLoadScript } from '@react-google-maps/api';
// import { KEYBOARD_RESTRICTIONS } from 'constants/constants';
// import { useEffect, useRef } from 'react';
// import { useFormContext } from 'react-hook-form';
// import InputField from 'ui/form/fields/input-field';

// type AddressComponents = {
//   streetNumber: string;
//   route: string;
//   postalCode: string;
//   city: string;
// };

// function extractAddressComponents(addressComponents: any[]): AddressComponents {
//   return addressComponents.reduce(
//     (acc, component) => {
//       const types = component.types;
//       if (types.includes('street_number')) acc.streetNumber = component.long_name;
//       else if (types.includes('route')) acc.route = component.long_name;
//       else if (types.includes('postal_code')) acc.postalCode = component.long_name;
//       else if (
//         types.includes('locality') ||
//         types.includes('postal_town') ||
//         (types.includes('administrative_area_level_2') && !acc.city)
//       ) {
//         acc.city = component.long_name;
//       }
//       return acc;
//     },
//     {
//       streetNumber: '',
//       route: '',
//       postalCode: '',
//       city: '',
//     },
//   );
// }

// function updateAddressFields(
//   components: AddressComponents,
//   prefix: string | undefined,
//   setValue: (
//     field: string,
//     value: string,
//     options?: { shouldValidate?: boolean; shouldDirty?: boolean },
//   ) => void,
// ) {
//   const address = [components.route, components.streetNumber].filter(Boolean).join(' ');

//   const addressFieldName = prefix ? `${prefix}.address` : 'address';
//   const postalCodeFieldName = prefix ? `${prefix}.postalCode` : 'postalCode';
//   const cityFieldName = prefix ? `${prefix}.city` : 'city';

//   if (address)
//     setValue(addressFieldName, address, {
//       shouldValidate: true,
//       shouldDirty: true,
//     });
//   if (components.postalCode)
//     setValue(postalCodeFieldName, components.postalCode, {
//       shouldValidate: true,
//       shouldDirty: true,
//     });
//   if (components.city)
//     setValue(cityFieldName, components.city, {
//       shouldValidate: true,
//       shouldDirty: true,
//     });
// }

// type Props = {
//   loading?: boolean;
//   disabled?: boolean;
//   prefix?: string;
//   countryCode?: string | string[];
// };

// export default function AddressAutocomplete({ loading, disabled, prefix, countryCode }: Props) {
//   const { setValue } = useFormContext();
//   const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

//   useEffect(() => {
//     const autocomplete = autocompleteRef.current;
//     if (!autocomplete) return;
//     if (countryCode && typeof autocomplete.setComponentRestrictions === 'function') {
//       autocomplete.setComponentRestrictions({
//         country: countryCode as any,
//       });
//     } else if (typeof autocomplete.setComponentRestrictions === 'function') {
//       // @ts-expect-error: Google types don't expose clearing; passing empty object works
//       // Clear restrictions if country becomes undefined
//       autocomplete.setComponentRestrictions({});
//     }
//   }, [countryCode]);

//   const { isLoaded } = useLoadScript({
//     googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
//     libraries: ['places'],
//     language: 'en',
//   });

//   if (!isLoaded) {
//     return (
//       <div className='relative'>
//         <InputField
//           loading={true}
//           name={prefix ? `${prefix}.address` : 'address'}
//           label='street and house number'
//           placeholder='sjyrniesu 10'
//           disabled={true}
//         />
//       </div>
//     );
//   }

//   return (
//     <div className='relative'>
//       <Autocomplete
//         options={{
//           componentRestrictions: countryCode ? { country: countryCode as any } : undefined,
//           types: ['address'],
//         }}
//         onLoad={(autocomplete) => {
//           autocompleteRef.current = autocomplete;
//           autocomplete.setFields(['address_components']);
//           if (countryCode) {
//             autocomplete.setComponentRestrictions({
//               country: countryCode as any,
//             });
//           }
//         }}
//         onPlaceChanged={() => {
//           const autocomplete = autocompleteRef.current;
//           if (!autocomplete) return;
//           const place = autocomplete.getPlace();
//           if (!place || !place.address_components) return;
//           const components = extractAddressComponents(place.address_components);
//           updateAddressFields(components, prefix, setValue);
//         }}
//       >
//         <InputField
//           loading={loading}
//           name={prefix ? `${prefix}.address` : 'address'}
//           label='street and house number'
//           placeholder=' '
//           disabled={disabled}
//           keyboardRestriction={KEYBOARD_RESTRICTIONS.addressField}
//         />
//       </Autocomplete>
//     </div>
//   );
// }
