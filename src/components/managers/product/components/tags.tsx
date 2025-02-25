import { TextField } from '@mui/material';
import { Cross2Icon } from '@radix-ui/react-icons';
import { common_ProductNew } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { cn } from 'lib/utility';
import { FC, useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
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

  const handleAddTag = (e: React.MouseEvent) => {
    e.preventDefault();
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

  const handleDeleteTag = (tagToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let updatedTags = [];
    if (isAddingProduct) {
      const newTags = localTags.filter((t) => t !== tagToDelete);
      localStorage.setItem('productTags', JSON.stringify(newTags));
      setLocalTags(newTags);
      updatedTags = newTags;
    }
    if (isEditMode) {
      const updatedEditedTags = editedTags.filter((t) => t !== tagToDelete);
      setEditedTags(updatedEditedTags);
      updatedTags = updatedEditedTags;
    }
    if (isCopyMode) {
      const updatedCopiedTags = copiedTags.filter((t) => t !== tagToDelete);
      setCopiedTags(updatedCopiedTags);
      updatedTags = updatedCopiedTags;
    }

    setSelectedTags((prevSelectedTags) => prevSelectedTags.filter((t) => t !== tagToDelete));

    setFieldValue(
      'tags',
      selectedTags.filter((t) => t !== tagToDelete).map((tag) => ({ tag })),
    );
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
    <div className='grid items-center gap-2'>
      {(isAddingProduct || isCopyMode) && !showAddTagField && !isEditMode && (
        <Button size='lg' onClick={() => setShowAddTagField(true)}>
          add new tag
        </Button>
      )}
      {(isEditMode || (showAddTagField && (isAddingProduct || isCopyMode))) && (
        <TextField
          type='text'
          value={tag}
          placeholder='Upload new tag'
          fullWidth
          label='TAG'
          InputLabelProps={{ shrink: true }}
          onChange={(e) => setTag(e.target.value)}
          slotProps={{
            input: {
              endAdornment: (
                <Button size='lg' onClick={(e: React.MouseEvent) => handleAddTag(e)}>
                  upload
                </Button>
              ),
            },
          }}
        />
      )}
      {!isEditMode && !isAddingProduct && <Text variant='uppercase'>list of tags</Text>}
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-1'>
        {displayedTags.map((tag, index) => (
          <div
            key={index}
            className={cn(
              'flex justify-center items-center gap-2 p-2 rounded-full border border-text group',
              {
                'border-3': selectedTags.includes(tag || ''),
                'hover:cursor-pointer': isEditMode || isAddingProduct,
              },
            )}
            onClick={() =>
              (isEditMode || isAddingProduct || isCopyMode) && handleTagClick(tag || '')
            }
          >
            <Text size='small'>{tag}</Text>
            {(isEditMode || isAddingProduct || isCopyMode) && (
              <Button
                className='rounded-full lg:hidden lg:group-hover:block'
                onClick={(e: React.MouseEvent) => {
                  handleDeleteTag(tag || '', e);
                }}
              >
                <Cross2Icon />
              </Button>
            )}
          </div>
        ))}
      </div>
      {touched.tags && errors.tags && <Text variant='error'>{errors.tags}</Text>}
    </div>
  );
};
