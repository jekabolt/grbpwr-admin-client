// import { GridColDef } from '@mui/x-data-grid';
// import { common_Dictionary } from 'api/proto-http/admin';
// import { common_OrderItem } from 'api/proto-http/frontend';
// import { BASE_PATH } from 'constants/routes';

// export const OrderDetailsData = (
//   dictionary: common_Dictionary | undefined,
//   isPrinting: boolean,
// ): GridColDef<common_OrderItem>[] => [
//   {
//     field: 'thumbnail',
//     headerName: '',
//     align: 'center',
//     width: 200,
//     renderCell: (params: any) => (
//       <a
//         href={`${BASE_PATH}/products/${params.row.orderItem.productId}`}
//         target='_blank'
//         style={{
//           cursor: 'pointer',
//         }}
//       >
//         <img src={params.value} alt='product' style={{ height: '100px', width: 'auto' }} />
//       </a>
//     ),
//   },
//   {
//     field: 'sku',
//     headerName: 'SKU',
//     align: 'center',
//     width: isPrinting ? 150 : 300,
//     renderCell: (params: any) => (
//       <div
//         style={{
//           whiteSpace: isPrinting ? 'normal' : 'nowrap',
//           wordWrap: isPrinting ? 'break-word' : 'normal',
//           overflow: isPrinting ? 'visible' : 'auto',
//           display: isPrinting ? 'block' : 'flex',
//           alignItems: 'center',
//           lineHeight: isPrinting ? '1.5' : 'normal',
//           height: '100%',
//           width: '100%',
//           margin: isPrinting ? '30% auto' : '0',
//         }}
//       >
//         {params.value}
//       </div>
//     ),
//   },
//   {
//     field: 'productName',
//     align: 'center',
//     headerAlign: 'center',
//     headerName: 'PRODUCT NAME',
//     width: 150,
//   },
//   {
//     field: 'quantity',
//     headerName: 'QUANTITY',
//     headerAlign: 'center',
//     align: 'center',
//     width: isPrinting ? 100 : 200,
//     valueGetter: (_params: any, row: any) => {
//       return row.orderItem.quantity;
//     },
//   },
//   {
//     field: 'size',
//     headerName: 'SIZE',
//     align: 'center',
//     headerAlign: 'center',
//     width: 200,
//     cellClassName: 'print:hidden',
//     valueGetter: (_params: any, row: any) => {
//       return dictionary?.sizes
//         ?.find((x) => x.id === row.orderItem.sizeId)
//         ?.name?.replace('SIZE_ENUM_', '');
//     },
//   },
//   {
//     field: 'productPrice',
//     headerName: 'PRICE',
//     align: 'center',
//     headerAlign: 'center',
//     width: isPrinting ? 90 : 200,
//     valueGetter: (params: any, row: any) =>
//       `${params * row.orderItem.quantity} ${dictionary?.baseCurrency}`,
//   },
//   {
//     field: 'productSalePercentage',
//     headerName: 'SALE',
//     align: 'center',
//     headerAlign: 'center',
//     width: isPrinting ? 90 : 200,
//   },
//   {
//     field: 'productPriceWithSale',
//     align: 'center',
//     headerAlign: 'center',
//     headerName: isPrinting ? 'PWS' : 'PRICE WITH SALE',
//     width: isPrinting ? 100 : 200,
//   },
// ];
