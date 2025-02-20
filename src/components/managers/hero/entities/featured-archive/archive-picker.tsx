import { Checkbox } from '@mui/material';
import { common_ArchiveFull } from 'api/proto-http/frontend';
import { Dialog } from 'components/common/utility/dialog';
import { useArchiveStore } from 'lib/stores/archive/store';

import { MaterialReactTable, MRT_ColumnDef, useMaterialReactTable } from 'material-react-table';
import { useEffect, useMemo, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (newSelectedArchive: common_ArchiveFull[]) => void;
  selectedArchiveId: number;
}

export function ArchivePicker({ open, onClose, onSave, selectedArchiveId }: Props) {
  const { archives, fetchArchives } = useArchiveStore();

  const [data, setData] = useState(archives);
  const [selectedArchive, setSelectedArchive] = useState<common_ArchiveFull | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (open) {
      const initialSelection = archives?.find((archive) => archive.id === selectedArchiveId);
      setSelectedArchive(initialSelection);
      fetchArchives(50, 0);
    }
  }, [open, currentPage]);

  useEffect(() => {
    setData(archives);
  }, [archives]);

  function handleSave() {
    if (!selectedArchive) return;
    onSave([selectedArchive]);
    onClose();
  }

  const columns = useMemo<MRT_ColumnDef<common_ArchiveFull>[]>(
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
          const item = row.original.media?.[0];
          const thumbnail = item?.media?.fullSize?.mediaUrl;
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
    data,
    initialState: {
      pagination: {
        pageSize: 50,
        pageIndex: 1,
      },
    },
    muiPaginationProps: {
      rowsPerPageOptions: [50, 100, 200],
      showFirstButton: false,
      showLastButton: false,
    },
  });

  return (
    <Dialog open={open} onClose={onClose} title='select archive' isSaveButton save={handleSave}>
      <MaterialReactTable table={table} />
    </Dialog>
  );
}
