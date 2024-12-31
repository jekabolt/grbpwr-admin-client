import { Button, Checkbox } from '@mui/material';
import { getArchive } from 'api/archive';
import { common_ArchiveFull } from 'api/proto-http/frontend';
import { Dialog } from 'components/common/dialog';
import { MaterialReactTable, MRT_ColumnDef } from 'material-react-table';
import { useEffect, useMemo, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (newSelectedArchive: common_ArchiveFull[]) => void;
  selectedArchiveId: number;
}

const calculateOffset = (page: number, limit: number) => (page - 1) * limit;

export function ArchivePicker({ open, onClose, onSave, selectedArchiveId }: Props) {
  const [archives, setArchives] = useState<common_ArchiveFull[]>([]);
  const [data, setData] = useState(archives);
  const [selectedArchive, setSelectedArchive] = useState<common_ArchiveFull | undefined>(undefined);
  const limit = 50;
  const [currentPage, setCurrentPage] = useState(1);
  const offset = calculateOffset(currentPage, limit);

  useEffect(() => {
    if (open) {
      const fetchArchives = async () => {
        const response = await getArchive({
          limit: limit,
          offset: offset,
          orderFactor: 'ORDER_FACTOR_DESC',
        });
        setArchives(response.archives || []);
        const initialSelection = response.archives?.find(
          (archive) => archive.archive?.id === selectedArchiveId,
        );
        setSelectedArchive(initialSelection);
      };
      fetchArchives();
    }
  }, [open, currentPage, offset, limit]);

  useEffect(() => {
    setData(archives);
  }, [archives]);

  const loadMore = () => {
    setCurrentPage((prevCurrentPage) => prevCurrentPage + 1);
  };

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
          const isSelected = selectedArchive?.archive?.id === row.original.archive?.id;
          return (
            <Checkbox
              checked={isSelected}
              onChange={() => setSelectedArchive(isSelected ? undefined : row.original)}
            />
          );
        },
      },
      {
        accessorKey: 'archive.id',
        header: 'ID',
      },
      {
        accessorKey: 'items',
        header: 'Thumbnail',
        Cell: ({ row }) => {
          const item = row.original.items?.[0];
          const thumbnail = item?.archiveItem?.media?.media?.thumbnail?.mediaUrl;
          return thumbnail ? (
            <img src={thumbnail} alt='Thumbnail' style={{ width: '100px', height: 'auto' }} />
          ) : null;
        },
        enableGlobalFilter: false,
      },
      {
        accessorKey: 'archive.archiveBody.description',
        header: 'Description',
      },
    ],
    [selectedArchive],
  );

  return (
    <Dialog open={open} onClose={onClose} title='select archive' isSaveButton save={handleSave}>
      <MaterialReactTable columns={columns} data={data} />
      <Button onClick={loadMore}>Load more</Button>
    </Dialog>
  );
}
