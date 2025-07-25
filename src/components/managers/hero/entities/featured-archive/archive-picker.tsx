import { Checkbox } from '@mui/material';
import { common_ArchiveList } from 'api/proto-http/frontend';
import { useArchives } from 'components/managers/archive/utility/useArchive';
import { Dialog } from 'ui/components/dialog';

import { MaterialReactTable, MRT_ColumnDef, useMaterialReactTable } from 'material-react-table';
import { useEffect, useMemo, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (newSelectedArchive: common_ArchiveList[]) => void;
  selectedArchiveId: number;
}

export function ArchivePicker({ open, onClose, onSave, selectedArchiveId }: Props) {
  const [selectedArchive, setSelectedArchive] = useState<common_ArchiveList | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(0);
  const limit = 50;

  const { data: archives, isLoading, error, refetch } = useArchives(limit, currentPage * limit);

  useEffect(() => {
    if (open) {
      const initialSelection = archives?.find((archive) => archive.id === selectedArchiveId);
      setSelectedArchive(initialSelection);
      refetch(); // Ensure fresh data when opening
    }
  }, [open, selectedArchiveId, archives, refetch]);

  function handleSave() {
    if (!selectedArchive) return;
    onSave([selectedArchive]);
    onClose();
  }

  const columns = useMemo<MRT_ColumnDef<common_ArchiveList>[]>(
    () => [
      {
        id: 'selection',
        header: 'Select',
        Cell: ({ row }) => {
          const isSelected = selectedArchive?.id === row.original.id;
          return (
            <Checkbox
              checked={isSelected}
              onChange={() => setSelectedArchive(isSelected ? undefined : row.original)}
            />
          );
        },
      },
      {
        accessorKey: 'id',
        header: 'ID',
      },
      {
        accessorKey: 'media',
        header: 'Thumbnail',
        Cell: ({ row }) => {
          const thumbnail = row.original.thumbnail?.media?.fullSize?.mediaUrl;
          return thumbnail ? (
            <img src={thumbnail} alt='Thumbnail' style={{ width: '100px', height: 'auto' }} />
          ) : null;
        },
        enableGlobalFilter: false,
      },
      {
        accessorKey: 'tag',
        header: 'Tag',
      },
      {
        accessorKey: 'heading',
        header: 'Heading',
      },
    ],
    [selectedArchive],
  );

  const table = useMaterialReactTable({
    autoResetPageIndex: false,
    columns,
    data: archives || [],
    state: {
      isLoading,
    },
    initialState: {
      pagination: {
        pageSize: 50,
        pageIndex: 0,
      },
    },
    muiPaginationProps: {
      rowsPerPageOptions: [50, 100, 200],
      showFirstButton: false,
      showLastButton: false,
    },
    onPaginationChange: (updater) => {
      if (typeof updater === 'function') {
        const newPagination = updater({ pageIndex: currentPage, pageSize: limit });
        setCurrentPage(newPagination.pageIndex);
      }
    },
  });

  if (error) {
    return (
      <Dialog open={open} onClose={onClose} title='select archive'>
        <div className='text-red-500 p-4'>
          Error loading archives: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title='select archive' isSaveButton save={handleSave}>
      <MaterialReactTable table={table} />
    </Dialog>
  );
}
