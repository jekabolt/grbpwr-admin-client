import { Cross2Icon } from '@radix-ui/react-icons';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { ProductFormData } from '../utility/schema';

export function Tags({
  isAddingProduct,
  isEditMode,
  isCopyMode,
}: {
  isAddingProduct: boolean;
  isEditMode: boolean;
  isCopyMode: boolean;
}) {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<ProductFormData>();
  const values = watch();
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
      setValue(
        'tags',
        selectedTags.map((tag) => ({ tag })),
      );
    }
  }, [isAddingProduct, selectedTags, setValue]);

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
    const trimmedTag = tag.trim();
    if (trimmedTag !== '' && !localTags.includes(trimmedTag)) {
      const newTags = [...localTags, trimmedTag];
      if (isAddingProduct) {
        localStorage.setItem('productTags', JSON.stringify(newTags));
        setLocalTags(newTags);
      }
      if (isCopyMode) {
        setCopiedTags((prevCopiedTags) => [...prevCopiedTags, trimmedTag]);
      }
      if (isEditMode) {
        setEditedTags((prevTags) => [...prevTags, trimmedTag]);
      }
      setSelectedTags((prev) => (prev.includes(trimmedTag) ? prev : [...prev, trimmedTag]));
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

    setValue(
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
      setValue(
        'tags',
        selectedTags.map((tag) => ({ tag })),
      );
    }
  }, [isAddingProduct, isCopyMode, isEditMode, selectedTags, setValue]);

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
        <div className='flex items-center border-b border-textColor w-full'>
          <div className='flex-1'>
            <Input
              name='product.tags'
              value={tag}
              placeholder='upload new tag'
              label='tags'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTag(e.target.value)}
              className='w-full border-none leading-4 bg-transparent'
            />
          </div>
          <Button
            size='lg'
            onClick={(e: React.MouseEvent) => handleAddTag(e)}
            className='flex-shrink-0  ml-2 '
          >
            save
          </Button>
        </div>
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
      {errors.tags && <Text variant='error'>{errors.tags.message}</Text>}
    </div>
  );
}
