import { Box, Button, Chip, TextField } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { FC, useState } from 'react';
import { EditProductTagsAndMeasurements } from '../utility/interfaces';

export const ProductTags: FC<EditProductTagsAndMeasurements> = ({ isEditMode }) => {
  const { values, setFieldValue } = useFormikContext<common_ProductNew>();
  const [tag, setTag] = useState('');

  const handleAddTag = () => {
    if (tag.trim() !== '') {
      const newTags = [...(values.tags ?? []), { tag }];
      setFieldValue('tags', newTags);
      setTag('');
    }
  };

  const handleDeleteTag = (tagToDelete: string | undefined) => {
    const newTags = values.tags?.filter((t) => t.tag !== tagToDelete);
    setFieldValue('tags', newTags);
  };

  return (
    <Box display='grid' alignItems='center' gap='10px'>
      <Box display='flex' alignItems='center' gap='5px'>
        <TextField
          type='text'
          value={tag}
          placeholder='Upload new tag'
          size='small'
          label='TAG'
          InputLabelProps={{ shrink: true }}
          onChange={(e) => setTag(e.target.value)}
        />
        <Button variant='contained' onClick={handleAddTag} disabled={!isEditMode}>
          Upload
        </Button>
      </Box>
      <Box display='grid' gridTemplateColumns='repeat(2, 1fr)' gap='5px'>
        {values.tags?.map((tag, index) => (
          <Chip
            key={index}
            label={tag.tag}
            color='default'
            onDelete={isEditMode ? () => handleDeleteTag(tag.tag) : undefined}
          />
        ))}
      </Box>
    </Box>
  );
};
