// import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
// import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
// import DeleteIcon from '@mui/icons-material/Delete';
// import { IconButton } from '@mui/material';
// import { common_ArchiveItemFull } from 'api/proto-http/frontend';
// import { MRT_ColumnDef, MRT_Row, MaterialReactTable } from 'material-react-table';
// import { FC, useCallback, useEffect, useState } from 'react';

// interface ArchiveTableInterface {
//   data: common_ArchiveItemFull[];
//   handleSaveNewOrderOfRows: (
//     updatedItems: common_ArchiveItemFull[],
//     archiveId: number | undefined,
//   ) => void;
//   deleteItemFromArchive: (archiveId: number | undefined, itemId: number | undefined) => void;
//   onRowClick: (item: common_ArchiveItemFull) => void; // New prop
// }

// export const ArchiveTable: FC<ArchiveTableInterface> = ({
//   data,
//   handleSaveNewOrderOfRows,
//   deleteItemFromArchive,
//   onRowClick,
// }) => {
//   const [tableData, setTableData] = useState(data);

//   useEffect(() => {
//     setTableData(data);
//   }, [data]);

//   const handleRowOrderChange = (updatedItems: common_ArchiveItemFull[]) => {
//     setTableData(updatedItems);
//     handleSaveNewOrderOfRows(updatedItems, updatedItems[0]?.archiveId);
//   };

//   const moveRow = useCallback(
//     (fromIndex: number, toIndex: number) => {
//       if (toIndex >= 0 && toIndex < data.length) {
//         const newData = [...data];
//         const item = newData.splice(fromIndex, 1)[0];
//         newData.splice(toIndex, 0, item);
//         setTableData(newData);
//         handleRowOrderChange(newData);
//       }
//     },
//     [tableData],
//   );

//   const columns: MRT_ColumnDef<common_ArchiveItemFull>[] = [
//     {
//       id: 'actions',
//       header: 'Order',
//       Cell: ({ row }) => (
//         <div>
//           <IconButton
//             onClick={(e) => {
//               e.stopPropagation();
//               moveRow(row.index, row.index - 1);
//             }}
//             disabled={row.index === 0}
//           >
//             <ArrowUpwardIcon />
//           </IconButton>

//           <IconButton
//             onClick={(e) => {
//               e.stopPropagation();
//               moveRow(row.index, row.index + 1);
//             }}
//             disabled={row.index === tableData.length - 1}
//           >
//             <ArrowDownwardIcon />
//           </IconButton>
//         </div>
//       ),
//     },
//     {
//       accessorKey: 'archiveItem.media.media.thumbnail.mediaUrl',
//       header: 'Media',
//       Cell: ({ cell }) => (
//         <img
//           src={cell.getValue() as string}
//           alt='Archive item'
//           style={{ width: '100px', height: 'auto', objectFit: 'scale-down' }}
//         />
//       ),
//     },
//     { accessorKey: 'archiveItem.name', header: 'Description' },
//     {
//       accessorKey: 'archiveItem.url',
//       header: 'URL',
//       Cell: ({ cell }) => {
//         const url = cell.getValue() as string;
//         return url ? (
//           <a href={url} target='_blank' rel='noopener noreferrer'>
//             go to link
//           </a>
//         ) : (
//           'no link'
//         );
//       },
//     },
//     {
//       accessorKey: 'id',
//       header: 'Delete',
//       Cell: ({ row }) => (
//         <IconButton
//           onClick={(e) => {
//             e.stopPropagation();
//             const newData = tableData.filter((_, id) => id !== row.index);
//             setTableData(newData);
//             deleteItemFromArchive(row.original.archiveId, row.original.id);
//           }}
//           aria-label='delete item'
//         >
//           <DeleteIcon color='error' fontSize='medium' />
//         </IconButton>
//       ),
//     },
//   ];

//   return (
//     <MaterialReactTable
//       columns={columns}
//       data={data}
//       enablePagination={false}
//       enableBottomToolbar={true}
//       enableRowOrdering
//       muiTableContainerProps={{ style: { height: '400px' } }}
//       muiTableBodyRowProps={({ row }) => ({
//         onClick: () => onRowClick(row.original),
//         sx: {
//           cursor: 'pointer',
//           height: '60px',
//         },
//       })}
//       muiRowDragHandleProps={({ table }) => ({
//         onDragEnd: () => {
//           const { draggingRow, hoveredRow } = table.getState();
//           if (hoveredRow && draggingRow) {
//             data.splice(
//               (hoveredRow as MRT_Row<common_ArchiveItemFull>).index,
//               0,
//               data.splice(draggingRow.index, 1)[0],
//             );
//             setTableData([...tableData]);
//             handleRowOrderChange(tableData);
//           }
//         },
//       })}
//     />
//   );
// };
