import { Box, Button, Chip, TextField } from '@mui/material';
import { common_ProductTagInsert } from 'api/proto-http/admin';
import { useField } from 'formik';
import { FC, useEffect, useState } from 'react';

export const Tags: FC<{ name: string }> = ({ name }) => {
  const [field, , helpers] = useField<common_ProductTagInsert[]>(name);
  const [newTag, setNewTag] = useState('');
  const [tags, setTags] = useState<string[]>(() => {
    const storedTags = localStorage.getItem('productTags');
    return storedTags ? JSON.parse(storedTags) : [];
  });
  const initialSelectedTags = Array.isArray(field.value)
    ? field.value.map((tag) => tag.tag || '')
    : [];

  const [selectedTags, setSelectedTags] = useState<string[]>(initialSelectedTags);

  useEffect(() => {
    localStorage.setItem('productTags', JSON.stringify(tags));
  }, [tags]);

  useEffect(() => {
    helpers.setValue(selectedTags.map((tag) => ({ tag })));
  }, [selectedTags, helpers]);

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
    </Box>
  );
};
