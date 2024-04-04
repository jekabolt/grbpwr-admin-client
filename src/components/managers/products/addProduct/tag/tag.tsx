import { Box, Button, Chip, TextField } from '@mui/material';
import { FC, useEffect, useState } from 'react';
import { AddProductTagInterface } from '../interface/interface';

export const Tags: FC<AddProductTagInterface> = ({ setProduct }) => {
  const [newTag, setNewTag] = useState('');
  const [tags, setTags] = useState<string[]>(() => {
    const storedTags = localStorage.getItem('productTags');
    return storedTags ? JSON.parse(storedTags) : [];
  });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    localStorage.setItem('productTags', JSON.stringify(tags));
    setProduct((prevProduct) => ({
      ...prevProduct,
      tags: selectedTags.map((tag) => ({ tag })),
    }));
  }, [tags, selectedTags, setProduct]);

  const uploadNewTag = () => {
    const trimmedTag = newTag.trim();
    if (!trimmedTag || tags.includes(trimmedTag)) return;
    const updatedTags = [...tags, trimmedTag];
    setTags(updatedTags);
    if (!selectedTags.includes(trimmedTag)) {
      setSelectedTags([...selectedTags, trimmedTag]);
    }
    setNewTag('');
  };
  const handleDeleteTag = (tagToDelete: string) => {
    const updatedTags = tags.filter((tag) => tag !== tagToDelete);
    setTags(updatedTags);
    setSelectedTags(selectedTags.filter((tag) => tag !== tagToDelete));
  };

  const handleTagClick = (tag: string) => {
    setSelectedTags((prevSelectedTags) =>
      prevSelectedTags.includes(tag)
        ? prevSelectedTags.filter((t) => t !== tag)
        : [...prevSelectedTags, tag],
    );
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
