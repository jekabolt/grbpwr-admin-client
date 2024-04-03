import { Box, Button, Chip, TextField } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import React, { FC, useEffect, useState } from 'react';

interface TagProps {
  product: common_ProductNew;
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>;
}

export const Tags: FC<TagProps> = ({ product, setProduct }) => {
  const [newTag, setNewTag] = useState('');
  const [tags, setTags] = useState<string[]>(() => {
    const storedTags = localStorage.getItem('productTags');
    return storedTags ? JSON.parse(storedTags) : [];
  });
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    const productTags =
      product.tags?.map((t) => t.tag).filter((tag): tag is string => tag !== undefined) || [];
    return productTags;
  });

  useEffect(() => {
    setProduct((prevProduct) => ({
      ...prevProduct,
      tags: selectedTags.map((tag) => ({ tag })),
    }));
  }, [selectedTags, tags, setProduct]);

  const uploadNewTag = () => {
    if (newTag.trim() === '') return;

    const trimmedTag = newTag.trim();
    const updatedTags = [...tags, trimmedTag];

    setTags(updatedTags);
    localStorage.setItem('productTags', JSON.stringify(updatedTags));

    setSelectedTags((prevSelectedTags) => [...prevSelectedTags, trimmedTag]);

    setProduct((prevProduct) => ({
      ...prevProduct,
      tags: [...(prevProduct.tags || []), { tag: trimmedTag }],
    }));

    setNewTag('');
  };

  const handleDeleteTag = (tagToDelete: string) => {
    const updatedTags = tags.filter((tag) => tag !== tagToDelete);
    setTags(updatedTags);
    localStorage.setItem('productTags', JSON.stringify(updatedTags));

    if (selectedTags.includes(tagToDelete)) {
      setSelectedTags(selectedTags.filter((tag) => tag !== tagToDelete));
    }
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
      <Box display='grid' gridTemplateColumns='repeat(2, 1fr)' gap='5px' flexWrap='wrap'>
        {tags.map((tag, index) => (
          <Chip
            label={tag}
            key={index}
            onClick={() => handleTagClick(tag)}
            onDelete={() => handleDeleteTag(tag)}
            color={selectedTags.includes(tag) ? 'primary' : 'default'}
          />
        ))}
      </Box>
    </Box>
  );
};
