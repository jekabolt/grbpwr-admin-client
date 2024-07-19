import { Box, Button, Chip, TextField, Typography } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { FC, useEffect, useState } from 'react';
import { ProductTagsInterface } from '../interface/interface';

export const Tags: FC<ProductTagsInterface> = ({
  isEditMode = true,
  isAddingProduct,
  initialTags = [],
}) => {
  const { setFieldValue } = useFormikContext<common_ProductNew>();
  const [newTag, setNewTag] = useState('');
  const [tags, setTags] = useState<string[]>(() => {
    const storedTags = localStorage.getItem('productTags');
    return storedTags ? JSON.parse(storedTags) : [];
  });
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTags);
  const [showAddTagField, setShowAddTagField] = useState(false);

  useEffect(() => {
    localStorage.setItem('productTags', JSON.stringify(tags));
  }, [tags]);

  useEffect(() => {
    setFieldValue(
      'tags',
      selectedTags.map((tag) => ({ tag })),
    );
  }, [selectedTags, setFieldValue]);

  useEffect(() => {
    if (initialTags.length > 0) {
      setTags((prevTags) => Array.from(new Set([...prevTags, ...initialTags])));
    }
  }, [initialTags]);

  const handleAddTag = () => {
    const trimmedTag = newTag.trim();
    if (!trimmedTag || tags.includes(trimmedTag)) return;
    setTags([...tags, trimmedTag]);
    setNewTag('');
    setShowAddTagField(false);
  };

  const handleDeleteTag = (tagToDelete: string) => {
    setTags(tags.filter((tag) => tag !== tagToDelete));
    setSelectedTags(selectedTags.filter((tag) => tag !== tagToDelete));
  };

  const handleTagClick = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  return (
    <Box display='grid' gap='10px'>
      {isAddingProduct && !showAddTagField && (
        <Button variant='contained' onClick={() => setShowAddTagField(true)}>
          Add new tag
        </Button>
      )}
      {(isEditMode || showAddTagField) && (
        <Box display='flex' alignItems='center' gap='15px'>
          <TextField
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            label='TAG'
            variant='outlined'
            InputLabelProps={{ shrink: true }}
            size='small'
            placeholder='Upload new tag'
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
        {tags.map((tag) => (
          <Chip
            label={tag}
            key={tag}
            onClick={isAddingProduct ? () => handleTagClick(tag) : undefined}
            onDelete={isEditMode || isAddingProduct ? () => handleDeleteTag(tag) : undefined}
            color={selectedTags.includes(tag) ? 'primary' : 'default'}
          />
        ))}
      </Box>
      {isAddingProduct && selectedTags.length === 0 && (
        <Typography color='error' variant='overline'>
          No tag selected. Please select a tag.
        </Typography>
      )}
    </Box>
  );
};
