import { Box, Button, Chip, TextField, Typography } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { FC, useEffect, useState } from 'react';
import { ProductTagsInterface } from '../interface/interface';

export const Tags: FC<ProductTagsInterface> = ({ isAddingProduct, isEditMode, isCopyMode }) => {
  const { values, setFieldValue, errors, touched } = useFormikContext<common_ProductNew>();
  const [tag, setTag] = useState('');
  const [localTags, setLocalTags] = useState<string[]>(() => {
    const storedTags = localStorage.getItem('productTags');
    return storedTags ? JSON.parse(storedTags) : [];
  });
  const [copiedTags, setCopiedTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAddTagField, setShowAddTagField] = useState(false);

  useEffect(() => {
    if (isAddingProduct && !isCopyMode) {
      setFieldValue(
        'tags',
        localTags.map((tag) => ({ tag })),
      );
    }
  }, [isAddingProduct, localTags, setFieldValue]);

  useEffect(() => {
    if (isCopyMode && values.tags && values.tags.length > 0) {
      const copiedTagsFromValues =
        values.tags?.map((tag) => tag?.tag).filter((tag): tag is string => tag !== undefined) || [];
      setCopiedTags(copiedTagsFromValues);
      setFieldValue(
        'tags',
        copiedTagsFromValues.map((tag) => ({ tag })),
      );
    }
  }, [isCopyMode]);

  const handleAddTag = () => {
    if (tag.trim() !== '') {
      const newTags = [...localTags, tag];

      if (isAddingProduct) {
        localStorage.setItem('productTags', JSON.stringify(newTags));
        setLocalTags(newTags);
      }
      if (isCopyMode) {
        setCopiedTags((prevCopiedTags) => [...prevCopiedTags, tag]);
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

    if (isCopyMode) {
      newTags = values.tags?.filter((t) => t.tag !== tagToDelete) || [];
      setFieldValue('tags', newTags);
      const updatedCopiedTags = copiedTags.filter((t) => t !== tagToDelete);
      setCopiedTags(updatedCopiedTags);
    }
  };

  const handleTagClick = (tag: string) => {
    let updatedSelectedTags;

    if (selectedTags.includes(tag)) {
      updatedSelectedTags = selectedTags.filter((t) => t !== tag);
    } else {
      updatedSelectedTags = [...selectedTags, tag];
    }

    setSelectedTags(updatedSelectedTags);
  };

  useEffect(() => {
    if (isAddingProduct) {
      setFieldValue(
        'tags',
        selectedTags.map((tag) => ({ tag })),
      );
    }
  }, [selectedTags, setFieldValue, isAddingProduct]);

  const displayedTags = isCopyMode
    ? copiedTags
    : isAddingProduct
      ? localTags
      : values.tags?.map((t) => t.tag) || [];

  return (
    <Box display='grid' alignItems='center' gap='10px'>
      {(isAddingProduct || isCopyMode) && !showAddTagField && (
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
          />
          <Button variant='contained' onClick={handleAddTag}>
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
            onClick={isAddingProduct || isCopyMode ? () => handleTagClick(tag || '') : undefined}
            onDelete={
              isEditMode || isAddingProduct || isCopyMode ? () => handleDeleteTag(tag) : undefined
            }
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
