import { Grid, IconButton } from '@mui/material';
import { common_ArchiveItemFull } from 'api/proto-http/frontend';
import { MRT_ColumnDef, MRT_Row, MaterialReactTable } from 'material-react-table';
import { FC, useEffect, useState } from 'react';
import { listArchive } from '../interfaces/interfaces';

type ArchiveItemDisplay = {
  media: string | undefined;
  title: string | undefined;
  url: string | undefined;
};

export const ListArchive: FC<listArchive> = ({ archive, setArchive, deleteArchiveFromList }) => {
  const columns: MRT_ColumnDef<ArchiveItemDisplay>[] = [
    {
      accessorKey: 'media',
      header: 'Media',
      Cell: ({ cell }) => (
        <img
          src={cell.getValue() as string}
          alt='Archive item'
          style={{ width: '100%', height: 'auto', objectFit: 'scale-down' }}
        />
      ),
    },
    {
      accessorKey: 'title',
      header: 'Title',
      size: 200,
    },
    {
      accessorKey: 'url',
      header: 'URL',
      Cell: ({ cell }) => (
        <a href={cell.getValue() as string} target='_blank' rel='noopener noreferrer'>
          Link
        </a>
      ),
    },
  ];

  const handleSaveOrder = (
    updatedItems: common_ArchiveItemFull[],
    archiveId: number | undefined,
  ) => {
    // Update the archive with the new order of items
    setArchive((prevArchive) => {
      return prevArchive.map((archiveEntry) => {
        if (archiveEntry.archive?.id === archiveId) {
          return {
            ...archiveEntry,
            items: updatedItems,
          };
        }
        return archiveEntry;
      });
    });

    // Here, you can add your logic to save the updated archive to your backend
    // saveUpdatedArchive({ archiveId, updatedItems });
  };

  return (
    <Grid container spacing={2}>
      {archive.map((archiveEntry, index) => {
        const initialData = archiveEntry.items
          ? archiveEntry.items.map((item) => ({
              media: item.archiveItem?.media?.media?.thumbnail?.mediaUrl,
              title: item.archiveItem?.title,
              url: item.archiveItem?.url,
            }))
          : [];

        const [data, setData] = useState<ArchiveItemDisplay[]>(initialData);

        const moveRow = (fromIndex: number, toIndex: number) => {
          const updatedData = [...data];
          const item = updatedData.splice(fromIndex, 1)[0];
          updatedData.splice(toIndex, 0, item);
          setData(updatedData);
          const updatedItems: common_ArchiveItemFull[] = [...archiveEntry.items!];
          const movedItem = updatedItems.splice(fromIndex, 1)[0];
          updatedItems.splice(toIndex, 0, movedItem);

          handleSaveOrder(updatedItems, archiveEntry.archive?.id);
        };

        useEffect(() => {
          setData(initialData);
        }, [archiveEntry.items]);

        return (
          <>
            <Grid item xs={12} key={index}>
              <MaterialReactTable
                columns={columns}
                data={data}
                enableRowActions
                enableRowSelection
                enableSorting={false}
                enableRowOrdering
                muiRowDragHandleProps={({ table }) => ({
                  onDragEnd: () => {
                    const { draggingRow, hoveredRow } = table.getState();
                    if (hoveredRow && draggingRow) {
                      moveRow(draggingRow.index, (hoveredRow as MRT_Row<ArchiveItemDisplay>).index);
                    }
                  },
                })}
                initialState={{
                  density: 'compact',
                }}
              />
            </Grid>
            <Grid item>
              <IconButton onClick={() => deleteArchiveFromList(archiveEntry.archive?.id)}>
                Delete Archive
              </IconButton>
            </Grid>
          </>
        );
      })}
    </Grid>
  );
};
