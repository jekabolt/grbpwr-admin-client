import { Box, Button, Chip, TextField, Typography } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { useEffect, useState } from 'react';

export const Tags = () => {
  const { setFieldValue } = useFormikContext<common_ProductNew>();
  const [newTag, setNewTag] = useState('');
  const [tags, setTags] = useState<string[]>(() => {
    const storedTags = localStorage.getItem('productTags');
    return storedTags ? JSON.parse(storedTags) : [];
  });

  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    localStorage.setItem('productTags', JSON.stringify(tags));
  }, [tags]);

  useEffect(() => {
    setFieldValue(
      'tags',
      selectedTags.map((tag) => ({ tag })),
    );
  }, [selectedTags, setFieldValue]);

  const uploadNewTag = () => {
    const trimmedTag = newTag.trim();
    if (!trimmedTag || tags.includes(trimmedTag)) return;
    setTags([...tags, trimmedTag]);
    setNewTag('');
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
      <Box display='flex' alignItems='center' gap='15px'>
        <TextField
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          label='TAG'
          variant='outlined'
          InputLabelProps={{ shrink: true }}
          size='small'
          placeholder='upload new tag'
        />
        <Button variant='contained' onClick={uploadNewTag}>
          Upload
        </Button>
      </Box>
      <Box display='grid' gridTemplateColumns='repeat(2, 1fr)' gap='5px'>
        {tags.map((tag) => (
          <Chip
            label={tag}
            key={tag}
            onClick={() => handleTagClick(tag)}
            onDelete={() => handleDeleteTag(tag)}
            color={selectedTags.includes(tag) ? 'primary' : 'default'}
          />
        ))}
      </Box>
      {selectedTags.length === 0 && (
        <Typography color='error' variant='overline'>
          No tag selected. Please select a tag.
        </Typography>
      )}
    </Box>
  );
};
