import { Box, Button, Chip, TextField } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { FC, useEffect, useState } from 'react';
import { ProductTagsInterface } from '../interface/interface';

export const Tags: FC<ProductTagsInterface> = ({ isAddingProduct, isEditMode }) => {
  const { values, setFieldValue, initialValues } = useFormikContext<common_ProductNew>();
  const [tag, setTag] = useState('');
  const [localTags, setLocalTags] = useState<string[]>(() => {
    const storedTags = localStorage.getItem('productTags');
    return storedTags ? JSON.parse(storedTags) : [];
  });

  useEffect(() => {
    if (isAddingProduct) {
      setFieldValue(
        'tags',
        localTags.map((tag) => ({ tag })),
      );
    }
  }, [isAddingProduct, localTags, setFieldValue]);

  // Effect to initialize localTags when in editing mode
  useEffect(() => {
    if (!isAddingProduct) {
      const safeTags =
        initialValues.tags
          ?.map((tag) => tag?.tag)
          .filter((tag): tag is string => tag !== undefined) || [];
      setLocalTags(safeTags);
    }
  }, [isAddingProduct, initialValues.tags]);

  const handleAddTag = () => {
    if (tag.trim() !== '') {
      const newTags = [...localTags, tag];
      if (isAddingProduct) {
        localStorage.setItem('productTags', JSON.stringify(newTags));
        setLocalTags(newTags);
      } else {
        const updatedTags = [...(values.tags ?? []), { tag }];
        setFieldValue('tags', updatedTags);
      }
      setTag('');
    }
  };

  const handleDeleteTag = (tagToDelete: string | undefined) => {
    let newTags;
    if (isAddingProduct) {
      newTags = localTags.filter((t) => t !== tagToDelete);
      localStorage.setItem('productTags', JSON.stringify(newTags));
      setLocalTags(newTags);
    } else {
      newTags = values.tags?.filter((t) => t.tag !== tagToDelete) || [];
      setFieldValue('tags', newTags);
    }
  };

  const displayedTags = !isAddingProduct ? values.tags?.map((t) => t.tag) || [] : localTags;

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
        <Button variant='contained' onClick={handleAddTag}>
          Upload
        </Button>
      </Box>
      <Box display='grid' gridTemplateColumns='repeat(2, 1fr)' gap='5px'>
        {displayedTags.map((tag, index) => (
          <Chip
            key={index}
            label={tag}
            color={isEditMode ? 'primary' : 'default'}
            onDelete={isEditMode || isAddingProduct ? () => handleDeleteTag(tag) : undefined}
          />
        ))}
      </Box>
    </Box>
  );
};
