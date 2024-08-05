import { Box, Button, Chip, TextField, Typography } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { FC, useEffect, useState } from 'react';
import { ProductTagsInterface } from '../interface/interface';

export const Tags: FC<ProductTagsInterface> = ({ isAddingProduct, isEditMode }) => {
  const { values, setFieldValue, initialValues, errors, touched } =
    useFormikContext<common_ProductNew>();
  const [tag, setTag] = useState('');
  const [localTags, setLocalTags] = useState<string[]>(() => {
    const storedTags = localStorage.getItem('productTags');
    return storedTags ? JSON.parse(storedTags) : [];
  });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAddTagField, setShowAddTagField] = useState(false);

  useEffect(() => {
    if (isAddingProduct) {
      setFieldValue(
        'tags',
        localTags.map((tag) => ({ tag })),
      );
    }
  }, [isAddingProduct, localTags, setFieldValue]);

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
        setShowAddTagField(false);
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

  const handleTagClick = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  useEffect(() => {
    if (isAddingProduct) {
      setFieldValue(
        'tags',
        selectedTags.map((tag) => ({ tag })),
      );
    }
  }, [selectedTags, setFieldValue, isAddingProduct]);

  const displayedTags = !isAddingProduct ? values.tags?.map((t) => t.tag) || [] : localTags;

  return (
    <Box display='grid' alignItems='center' gap='10px'>
      {isAddingProduct && !showAddTagField && (
        <Button variant='contained' onClick={() => setShowAddTagField(true)}>
          Add new tag
        </Button>
      )}
      {(isEditMode || showAddTagField) && (
        <Box display='flex' alignItems='center' gap='5px'>
          <TextField
            type='text'
            value={tag}
            placeholder='Upload new tag'
            size='small'
            label='TAG'
            InputLabelProps={{ shrink: true }}
            onChange={(e) => setTag(e.target.value)}
            disabled={!isAddingProduct}
          />
          <Button variant='contained' onClick={handleAddTag} disabled={!isAddingProduct}>
            Upload
          </Button>
        </Box>
      )}
      {!isEditMode && !isAddingProduct && (
        <Typography textTransform='uppercase' variant='h5'>
          list of tags
        </Typography>
      )}
      <Box display='grid' gridTemplateColumns='repeat(2, 1fr)' gap='5px'>
        {displayedTags.map((tag, index) => (
          <Chip
            key={index}
            label={tag}
            color={selectedTags.includes(tag || '') ? 'primary' : 'default'}
            onClick={isAddingProduct ? () => handleTagClick(tag || '') : undefined}
            onDelete={isEditMode || isAddingProduct ? () => handleDeleteTag(tag) : undefined}
          />
        ))}
      </Box>
      {touched.tags && errors.tags && (
        <Typography color='error' variant='overline'>
          {errors.tags}
        </Typography>
      )}
    </Box>
  );
};
