import { Box, Button, Chip, TextField, Typography } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { FC, useEffect, useMemo, useState } from 'react';
import { ProductTagsInterface } from '../interface/interface';

export const Tags: FC<ProductTagsInterface> = ({ isAddingProduct, isEditMode, isCopyMode }) => {
  const { values, setFieldValue, errors, touched } = useFormikContext<common_ProductNew>();
  const [tag, setTag] = useState('');
  const [localTags, setLocalTags] = useState<string[]>(() => {
    const storedTags = localStorage.getItem('productTags');
    return storedTags ? JSON.parse(storedTags) : [];
  });
  const [copiedTags, setCopiedTags] = useState<string[]>([]);
  const [editedTags, setEditedTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAddTagField, setShowAddTagField] = useState(false);
  const [hasCopiedTagsUpdated, setHasCopiedTagsUpdated] = useState(false);

  useEffect(() => {
    if (isAddingProduct && !isCopyMode) {
      setFieldValue(
        'tags',
        selectedTags.map((tag) => ({ tag })),
      );
    }
  }, [isAddingProduct, selectedTags, setFieldValue]);

  useEffect(() => {
    if (isCopyMode && values && values.tags && values.tags?.length > 0 && !hasCopiedTagsUpdated) {
      const copiedTagsFromValues =
        values.tags.map((tag) => tag?.tag).filter((tag): tag is string => tag !== undefined) || [];

      setCopiedTags(copiedTagsFromValues);
      setSelectedTags(copiedTagsFromValues);
      setHasCopiedTagsUpdated(true);
    }
  }, [isCopyMode, values.tags, hasCopiedTagsUpdated]);

  useEffect(() => {
    if (isEditMode && values.tags && values.tags.length > 0) {
      const currentTags =
        values.tags?.map((tag) => tag?.tag).filter((tag): tag is string => tag !== undefined) || [];
      if (JSON.stringify(editedTags) !== JSON.stringify(currentTags)) {
        setEditedTags(currentTags);
        setSelectedTags(currentTags);
      }
    }
  }, [isEditMode]);

  const handleAddTag = () => {
    if (tag.trim() !== '' && !localTags.includes(tag)) {
      const newTags = [...localTags, tag];
      if (isAddingProduct) {
        localStorage.setItem('productTags', JSON.stringify(newTags));
        setLocalTags(newTags);
      }
      if (isCopyMode) {
        setCopiedTags((prevCopiedTags) => [...prevCopiedTags, tag]);
      }
      if (isEditMode) {
        setEditedTags((prevTags) => [...prevTags, tag]);
      }
      setTag('');
    }
  };

  const handleDeleteTag = (tagToDelete: string) => {
    if (isAddingProduct) {
      const newTags = localTags.filter((t) => t !== tagToDelete);
      localStorage.setItem('productTags', JSON.stringify(newTags));
      setLocalTags(newTags);
    } else if (isCopyMode) {
      const updatedCopiedTags = copiedTags.filter((t) => t !== tagToDelete);
      setCopiedTags(updatedCopiedTags);
    } else {
      const updateEditedTags = editedTags.filter((t) => t !== tagToDelete);
      setEditedTags(updateEditedTags);
    }
  };

  const handleTagClick = (tag: string) => {
    setSelectedTags((prevSelectedTags) => {
      const updatedSelectedTags = prevSelectedTags.includes(tag)
        ? prevSelectedTags.filter((t) => t !== tag)
        : [...prevSelectedTags, tag];
      return updatedSelectedTags;
    });
  };

  useEffect(() => {
    if (isEditMode || isCopyMode) {
      setFieldValue(
        'tags',
        selectedTags.map((tag) => ({ tag })),
      );
    }
  }, [isAddingProduct, isCopyMode, isEditMode, selectedTags, setFieldValue]);

  const displayedTags = useMemo(() => {
    return (
      (isCopyMode && copiedTags) ||
      (isAddingProduct && localTags) ||
      (isEditMode && editedTags) ||
      (!isEditMode &&
        values.tags?.map((tag) => tag?.tag).filter((tag): tag is string => tag !== undefined)) ||
      []
    );
  }, [isCopyMode, copiedTags, isAddingProduct, localTags, editedTags, isEditMode, values.tags]);

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
            onClick={() => handleTagClick(tag || '')}
            disabled={!isEditMode && !isAddingProduct && !isCopyMode}
            onDelete={
              isEditMode || isAddingProduct || isCopyMode
                ? () => handleDeleteTag(tag || '')
                : undefined
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
