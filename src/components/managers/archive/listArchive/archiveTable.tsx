import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteIcon from '@mui/icons-material/Delete';
import { IconButton } from '@mui/material';
import { common_ArchiveItemFull } from 'api/proto-http/frontend';
import { MRT_ColumnDef, MRT_Row, MaterialReactTable } from 'material-react-table';
import { FC, useState } from 'react';

interface ArchiveTableInterface {
  data: common_ArchiveItemFull[];
  handleSaveNewOrderOfRows: (
    updatedItems: common_ArchiveItemFull[],
    archiveId: number | undefined,
  ) => void;
  deleteItemFromArchive: (archiveId: number | undefined, itemId: number | undefined) => void;
}

export const ArchiveTable: FC<ArchiveTableInterface> = ({
  data,
  handleSaveNewOrderOfRows,
  deleteItemFromArchive,
}) => {
  const [tableData, setTableData] = useState(data);

  const handleRowOrderChange = (updatedItems: common_ArchiveItemFull[]) => {
    setTableData(updatedItems);
    handleSaveNewOrderOfRows(updatedItems, updatedItems[0]?.archiveId);
  };

  const moveRow = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= tableData.length) return;
    const updatedData = [...tableData];
    const [movedItem] = updatedData.splice(fromIndex, 1);
    updatedData.splice(toIndex, 0, movedItem);
    handleRowOrderChange(updatedData);
  };

  const columns: MRT_ColumnDef<common_ArchiveItemFull>[] = [
    {
      id: 'actions',
      header: 'Order',
      Cell: ({ row }) => (
        <div>
          <IconButton
            onClick={() => moveRow(row.index, row.index - 1)}
            aria-label='move up'
            disabled={row.index === 0}
          >
            <ArrowUpwardIcon />
          </IconButton>

          <IconButton
            onClick={() => moveRow(row.index, row.index + 1)}
            aria-label='move down'
            disabled={row.index === tableData.length - 1}
          >
            <ArrowDownwardIcon />
          </IconButton>
        </div>
      ),
    },
    {
      accessorKey: 'archiveItem.media.media.fullSize.mediaUrl',
      header: 'Media',
      Cell: ({ cell }) => (
        <img
          src={cell.getValue() as string}
          alt='Archive item'
          style={{ width: '100px', height: 'auto', objectFit: 'scale-down' }}
        />
      ),
    },
    { accessorKey: 'archiveItem.title', header: 'Title', size: 200 },
    {
      accessorKey: 'archiveItem.url',
      header: 'URL',
      Cell: ({ cell }) => (
        <a href={cell.getValue() as string} target='_blank' rel='noopener noreferrer'>
          link
        </a>
      ),
    },
    {
      accessorKey: 'id',
      header: 'Delete',
      Cell: ({ row }) => (
        <IconButton
          onClick={() => deleteItemFromArchive(row.original.archiveId, row.original.id)}
          aria-label='delete item'
        >
          <DeleteIcon color='error' fontSize='medium' />
        </IconButton>
      ),
    },
  ];

  return (
    <MaterialReactTable
      columns={columns}
      data={data}
      enablePagination={false}
      enableBottomToolbar={true}
      enableRowOrdering
      muiTableContainerProps={{ style: { height: '400px' } }}
      muiTableBodyRowProps={{
        sx: {
          height: '60px',
        },
      }}
      muiRowDragHandleProps={({ table }) => ({
        onDragEnd: () => {
          const { draggingRow, hoveredRow } = table.getState();
          if (hoveredRow && draggingRow) {
            const updatedData = [...tableData];
            updatedData.splice(
              (hoveredRow as MRT_Row<common_ArchiveItemFull>).index,
              0,
              updatedData.splice(draggingRow.index, 1)[0],
            );
            setTableData(updatedData);
            handleRowOrderChange(updatedData);
          }
        },
      })}
    />
  );
};
